#!/usr/bin/env node
import {readFile,writeFile,mkdir,cp,lstat} from 'node:fs/promises';
import {homedir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2),harness=args[0],dryRun=args.includes('--dry-run');
if(!['codex','claude-code'].includes(harness)){console.error('Usage: node install.mjs codex|claude-code [--dry-run]\nClaude Desktop: open the .mcpb bundle and use ppc_connect.');process.exit(1)}
const root=dirname(fileURLToPath(import.meta.url)),cli=resolve(root,'server/dist/cli.js'),skills=join(homedir(),harness==='codex'?'.codex':'.claude','skills'),state=join(homedir(),'.commercespine-mcp',harness);
const command=process.platform==='win32'?(harness==='codex'?'codex.exe':'claude.exe'):(harness==='codex'?'codex':'claude');
const registerArgs=harness==='codex'?['mcp','add','commercespine','--',process.execPath,cli,'serve','--state-dir',state]:['mcp','add','--transport','stdio','--scope','user','commercespine','--',process.execPath,cli,'serve','--state-dir',state];
const result={harness,command,args:registerArgs,skills:['sellerplex-automation','sellerplex-business'].map(name=>join(skills,name)),stateDirectory:state,authentication:'ppc_connect: human browser sign-in'};
if(dryRun){console.log(JSON.stringify(result,null,2));process.exit(0)}
await lstat(cli);
const existing=spawnSync(command,['mcp','get','commercespine'],{encoding:'utf8',windowsHide:true});
if(existing.error){throw Error('Install the official '+harness+' CLI first, or use the manual configuration in server/docs/setup.md. '+existing.error.message)}
if(existing.status===0)throw Error('A commerсespine MCP entry already exists. Inspect it and use the documented update procedure; no configuration was overwritten.');
for(const name of ['sellerplex-automation','sellerplex-business'])if(await lstat(join(skills,name)).catch(()=>null))throw Error('Skill already exists: '+name+'. Preserve customizations and follow the update procedure.');
// Back up the existing harness config before its supported CLI writes the server entry.
const config=join(homedir(),harness==='codex'?'.codex/config.toml':'.claude.json');
if(await lstat(config).catch(()=>null)){const backup=join(homedir(),'.commercespine-mcp','backups',new Date().toISOString().replaceAll(':','-'));await mkdir(backup,{recursive:true,mode:0o700});await writeFile(join(backup,harness==='codex'?'config.toml':'claude.json'),await readFile(config),{mode:0o600,flag:'wx'})}
const registration=spawnSync(command,registerArgs,{encoding:'utf8',windowsHide:true});if(registration.status!==0)throw Error('Harness registration failed. '+registration.stderr);
await mkdir(skills,{recursive:true});for(const name of ['sellerplex-automation','sellerplex-business'])await cp(join(root,'server/skills',name),join(skills,name),{recursive:true,force:false,errorOnExist:true});
console.log(JSON.stringify({...result,installed:true,next:'Restart the harness, call ppc_connect, then ppc_identity and ppc_capabilities.'},null,2));
