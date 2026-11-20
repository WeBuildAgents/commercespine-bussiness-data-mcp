#!/usr/bin/env node
import { parseArgs } from "node:util";
import { spawn } from "node:child_process";
import { readFile, mkdir, writeFile, cp, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {homedir} from 'node:os';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { ServiceClient, publicResult, serviceOrigin } from "./client.js";
import { SessionStore } from "./store.js";
import { pair } from "./pairing.js";
import { NativeClient,isNativeSession } from './native-client.js';
import { nativeLogin } from './native-login.js';

async function openBrowser(url: string): Promise<void> {
  const command = process.platform === "win32" ? "rundll32.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.once("error", reject); child.once("spawn", () => { child.unref(); resolve(); });
  });
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { service: { type: "string" }, api:{type:'string'},console:{type:'string'}, "state-dir": { type: "string" }, "no-open": { type: "boolean" }, "skill-dir": { type: "string" } } });
  const command = positionals[0] ?? "serve";
  const store = new SessionStore(values["state-dir"]??(values.service?undefined:resolve(homedir(),'.commercespine-mcp')));
  if (command === "help") {
    console.log("sellerplex-ppc login --api https://eb-api.sellerplex.com --console https://ecombrain.sellerplex.com [--no-open]\nsellerplex-ppc serve\nsellerplex-ppc status\nsellerplex-ppc logout\nsellerplex-ppc install-skill --skill-dir ABSOLUTE_HARNESS_SKILLS_DIRECTORY\nOptional: --state-dir PRIVATE_DIRECTORY. Legacy service: login --service URL. Native mode needs no Docker, local PostgreSQL or Notion. Scheduled runs use the harness scheduler; see docs/setup.md."); return;
  }
  if (command === "install-skill") {
    if (!values["skill-dir"]) throw new Error("Choose --skill-dir explicitly for the intended harness.");
    const folders=['sellerplex-automation','sellerplex-business'];
    for(const folder of folders){const destination=resolve(values['skill-dir'],folder);if(await lstat(destination).catch(()=>null))throw new Error('Skill already exists: '+destination+'. Compare your customizations before updating.')}
    await mkdir(resolve(values['skill-dir']),{recursive:true});
    for(const folder of folders)await cp(new URL('../skills/'+folder+'/',import.meta.url),resolve(values['skill-dir'],folder),{recursive:true,errorOnExist:true,force:false});
    console.log('Installed skills: '+folders.join(', '));return;
  }
  if (command === "login") {
    if(values.api){
      if(values.service)throw new Error('Choose native --api or legacy --service, not both.');
      await nativeLogin({api:values.api,console:values.console??'https://ecombrain.sellerplex.com',store,showUrl:async url=>{process.stderr.write('Complete native Commerce Spine sign-in in your browser:\n'+url+'\n');if(!values['no-open'])await openBrowser(url).catch(()=>process.stderr.write('Open the link above manually.\n'))}});
      process.stderr.write('Native MCP connected. Provider credentials remain in your protected local session.\n');return;
    }
    const origin = serviceOrigin(values.service ?? (await store.load())?.origin ?? "");
    await pair({ origin, store, showUrl: async url => {
      process.stderr.write(`Complete Commerce Spine sign-in in your browser:\n${url}\n`);
      if (!values["no-open"]) await openBrowser(url).catch(() => process.stderr.write("Open the link above manually.\n"));
    } });
    process.stderr.write("Paired successfully. Your session is stored locally; no provider keys are exposed to the agent.\n"); return;
  }
  const session = await store.load();
  if (!session && command!=='serve') throw new Error("Run sellerplex-ppc login --api https://eb-api.sellerplex.com first, or connect from the ppc_connect tool.");
  if (values.service && session && serviceOrigin(values.service) !== session.origin) throw new Error("Stored session belongs to a different service. Log in to the selected service first.");
  const native=!session||isNativeSession(session);
  const client = native?new NativeClient(store,fetch,{api:values.api??'https://eb-api.sellerplex.com',console:values.console??'https://ecombrain.sellerplex.com'}):new ServiceClient(session!.origin, async () => (await store.load())?.token);
  if (command === "status") { console.log(JSON.stringify(publicResult(await client.request("GET", "/v1/me")), null, 2)); return; }
  if (command === "logout") {
    await client.request("POST", "/v1/logout", {});
    await store.clear(); process.stderr.write("Session revoked and local credentials removed.\n"); return;
  }
  if (command !== "serve") throw new Error("Unknown command. Run sellerplex-ppc help.");
  const server = createServer(client,{legacy:!native});
  await server.connect(new StdioServerTransport());
  const shutdown = async () => { await server.close(); process.exit(0); };
  process.once("SIGTERM", shutdown); process.once("SIGINT", shutdown);
}

main().catch(error => { process.stderr.write(`${error instanceof Error ? error.message : "Operation failed."}\n`); process.exitCode = 1; });
