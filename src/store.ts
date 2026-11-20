import { mkdir, readFile, rename, chmod, writeFile, unlink, lstat,open } from "node:fs/promises";
import {setTimeout as pause} from 'node:timers/promises';
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { serviceOrigin } from "./client.js";

export interface Session { origin: string; token: string; savedAt: string;mode?:'native';consoleOrigin?:string;credentials?:import('./native-client.js').NativeCredentials;preferences?:Record<string,unknown> }
export const defaultStateDirectory = () => join(homedir(), ".sellerplex-ppc");

function windowsProtect(value: string, decrypt: boolean): string {
  const operation = decrypt ? "Unprotect" : "Protect";
  const script = `Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); $result=[Security.Cryptography.ProtectedData]::${operation}($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Out.Write([Convert]::ToBase64String($result))`;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
    input: value, encoding: "utf8", windowsHide: true, timeout: 10_000, maxBuffer: 1_048_576
  });
  if (result.status !== 0 || result.error || !result.stdout.trim()) throw new Error("Windows user credential protection is unavailable. No plaintext token was stored.");
  return result.stdout.trim();
}

export class SessionStore {
  constructor(readonly directory = defaultStateDirectory()) {}
  private get path() { return join(this.directory, "session.json"); }

  /** Serialize refresh-token rotation across stdio processes sharing one installation. */
  async withLock<T>(work:()=>Promise<T>):Promise<T>{
    await mkdir(this.directory,{recursive:true,mode:0o700});
    const info=await lstat(this.directory);if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Credential directory must be a real private directory.');
    const path=join(this.directory,'refresh.lock'),deadline=Date.now()+30000;
    for(;;){
      let handle;
      try{handle=await open(path,'wx',0o600)}catch(error){
        if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
        try{const prior=await lstat(path),pid=Number(await readFile(path,'utf8'));if(!prior.isSymbolicLink()&&prior.isFile()&&Number.isInteger(pid)&&pid>0&&Date.now()-prior.mtimeMs>30000){let dead=false;try{process.kill(pid,0)}catch(e){dead=(e as NodeJS.ErrnoException).code==='ESRCH'}if(dead){const current=await lstat(path);if(current.mtimeMs===prior.mtimeMs&&current.ino===prior.ino)await unlink(path)}}}catch{}
        if(Date.now()>=deadline)throw new Error('Another MCP process is updating this connection. Retry after it finishes.');await pause(100);continue;
      }
      try{await handle.writeFile(String(process.pid));return await work()}finally{await handle.close();await unlink(path).catch(()=>{})}
    }
  }

  async save(session: Session): Promise<void> {
    serviceOrigin(session.origin);
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(this.directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error("Credential directory must be a real private directory.");
    if (process.platform !== "win32") await chmod(this.directory, 0o700);
    const serialized = JSON.stringify(session);
    const envelope = process.platform === "win32"
      ? { format: "windows-dpapi-current-user", data: windowsProtect(Buffer.from(serialized).toString("base64"), false) }
      : { format: "private-file", data: serialized };
    const temporary = join(this.directory, `session-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(envelope), { mode: 0o600, flag: "wx" });
      await rename(temporary, this.path);
    } finally { await unlink(temporary).catch(() => {}); }
  }

  async load(): Promise<Session | undefined> {
    try {
      const stat = await lstat(this.path);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Invalid credential file.");
      if (process.platform !== "win32" && (stat.mode & 0o077) !== 0) throw new Error("Credential file is accessible to other users. Restore permissions to 0600.");
      const envelope = JSON.parse(await readFile(this.path, "utf8")) as { format: string; data: string };
      let payload: string;
      if (envelope.format === "windows-dpapi-current-user" && process.platform === "win32") payload = Buffer.from(windowsProtect(envelope.data, true), "base64").toString("utf8");
      else if (envelope.format === "private-file" && process.platform !== "win32") payload = envelope.data;
      else throw new Error("Credential protection does not match this operating system; log in again.");
      const session = JSON.parse(payload) as Session;
      if (!session.token || typeof session.token !== "string" || !session.savedAt) throw new Error("Invalid saved session.");
      serviceOrigin(session.origin);
      return session;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async clear(): Promise<void> { await unlink(this.path).catch(error => { if (error.code !== "ENOENT") throw error; }); }
}
