import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {serviceOrigin,ServiceError} from './client.js';
import {type NativeSession,isNativeSession} from './native-client.js';
import {SessionStore} from './store.js';

const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
/** Browser-only explicit sign-in. The model never receives passwords, JWTs or raw agent tokens. */
export async function nativeLogin(options:{api:string;console:string;store:SessionStore;showUrl:(url:string)=>Promise<void>;fetcher?:typeof fetch;timeoutMs?:number}):Promise<void>{
  const api=serviceOrigin(options.api),consoleOrigin=serviceOrigin(options.console),fetcher=options.fetcher??fetch;
  const nonce=randomBytes(32).toString('base64url');let origin='',attempts=0,busy=false,settled=false;
  let complete!:()=>void,reject!:(error:Error)=>void;
  const done=new Promise<void>((resolve,no)=>{complete=resolve;reject=no});
  const server=createServer(async(req,res)=>{
    const respond=(status:number,body:string)=>{res.writeHead(status,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff','content-security-policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"});res.end(body)};
    if(req.headers.host!==new URL(origin).host||req.url!=='/login?state='+nonce){respond(404,'Not found');return}
    if(req.method==='GET'){
      respond(200,`<!doctype html><html lang="en"><meta charset="utf-8"><title>Connect Commerce Spine MCP</title><h1>Connect Commerce Spine MCP</h1><p>Sign in to ${escape(api)}. Credentials are sent only to this local setup process and your Commerce Spine API, never to the assistant.</p><form method="post"><input type="hidden" name="nonce" value="${nonce}"><label>Email <input type="email" name="email" autocomplete="username" required></label><p><label>Password <input type="password" name="password" autocomplete="current-password" required></label></p><label><input type="checkbox" name="consent" value="yes" required>Connect my identity and create or reuse my agent API token for this MCP. Human approval remains in the Action Console.</label><p><button>Connect MCP</button></p></form></html>`);return;
    }
    if(req.method!=='POST'||req.headers.origin!==origin||req.headers['content-type']?.split(';')[0]!=='application/x-www-form-urlencoded'){respond(403,'Invalid local sign-in request.');return}
    if(busy||attempts>=8||settled){respond(429,'Setup is busy or expired. Restart the login command.');return}
    busy=true;attempts++;
    try{
      let text='';for await(const chunk of req){text+=chunk.toString();if(Buffer.byteLength(text)>8192)throw Error('invalid_form')}
      const form=new URLSearchParams(text);
      if(form.get('nonce')!==nonce||form.get('consent')!=='yes'||!form.get('email')||!form.get('password'))throw Error('invalid_form');
      const call=async(path:string,method='GET',body?:unknown,token?:string)=>{
        const response=await fetcher(api+path,{method,headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new ServiceError(response.status,'LOGIN_FAILED');return (await response.json()).data;
      };
      const auth=await call('/api/v1/auth/login','POST',{email:form.get('email'),password:form.get('password')});
      form.delete('password');text='';
      if(typeof auth?.accessToken!=='string'||typeof auth?.refreshToken!=='string'||!Number.isFinite(auth?.expiresIn))throw Error('invalid_auth');
      const user=await call('/api/v1/users/me','GET',undefined,auth.accessToken);
      if(!user?.id||!user.organization?.id||user.status!=='ACTIVE'||user.organization.status!=='ACTIVE'||user.mustResetPassword||!user.roleCodes?.some((r:string)=>['ORG_ADMIN','MEMBER'].includes(r)))throw Error('identity_not_eligible');
      const previous=await options.store.load();let agentToken:string|undefined,agentTokenId:string|undefined;
      if(isNativeSession(previous)&&previous.origin===api&&previous.credentials.userId===user.id&&previous.credentials.organizationId===user.organization.id){
        try{const prior=await call('/api/v1/tokens/'+encodeURIComponent(previous.credentials.agentTokenId),'GET',undefined,auth.accessToken);if(prior.ownerUserId===user.id&&prior.status==='ACTIVE'&&(!prior.expiresAt||Date.parse(prior.expiresAt)>Date.now())){agentToken=previous.credentials.agentToken;agentTokenId=prior.id}}
        catch(error){if(!(error instanceof ServiceError&&error.status===404))throw error}
      }
      if(!agentToken){const created=await call('/api/v1/tokens','POST',{label:'Commerce Spine native MCP',consumerType:'AGENT'},auth.accessToken);if(typeof created?.rawToken!=='string'||created.token?.ownerUserId!==user.id||created.token?.status!=='ACTIVE')throw Error('invalid_agent_token');agentToken=created.rawToken;agentTokenId=created.token.id}
      if(!agentTokenId||!agentToken)throw Error('invalid_agent_token');
      const session:NativeSession={mode:'native',origin:api,consoleOrigin,token:'native-protected-session',savedAt:new Date().toISOString(),credentials:{accessToken:auth.accessToken,refreshToken:auth.refreshToken,expiresAt:Date.now()+auth.expiresIn*1000,agentToken,agentTokenId,userId:user.id,organizationId:user.organization.id}};
      await options.store.save(session);settled=true;respond(200,'<!doctype html><title>MCP connected</title><h1>MCP connected</h1><p>Return to Codex or Claude. You can close this tab.</p>');complete();
    }catch{respond(401,'<!doctype html><title>Connection failed</title><h1>Connection failed</h1><p>Check your Commerce Spine sign-in and current eligibility, then reload this setup page. No provider error or credential is exposed.</p>')}
    finally{busy=false}
  });
  await new Promise<void>((resolve,no)=>{server.once('error',no);server.listen(0,'127.0.0.1',()=>resolve())});
  origin='http://127.0.0.1:'+((server.address() as {port:number}).port);
  const timeout=setTimeout(()=>{settled=true;reject(Error('Native sign-in expired. Run login again.'))},options.timeoutMs??300000);
  try{await options.showUrl(origin+'/login?state='+nonce);await done}finally{clearTimeout(timeout);server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
}
