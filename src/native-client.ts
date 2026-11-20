import {type ApiClient, ServiceError, serviceOrigin} from './client.js';
import {type Session, SessionStore} from './store.js';
import {assertReadOnlyGraphql} from './server.js';

export interface NativeCredentials {
  accessToken:string; refreshToken:string; expiresAt:number;
  agentToken:string; agentTokenId:string; userId:string; organizationId:string;
}
export type NativeSession=Session & {mode:'native';consoleOrigin:string;credentials:NativeCredentials};
export const isNativeSession=(s:Session|undefined):s is NativeSession=>s?.mode==='native';
type Method='GET'|'POST'|'PATCH'|'DELETE';
const identifier='[a-zA-Z0-9_-]+';
const object=(v:unknown):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,any>:{};

/** Direct, fixed-route transport. No local Business database, Notion dependency or decision route. */
export class NativeClient implements ApiClient {
  private serial:Promise<unknown>=Promise.resolve();
  private connecting?:{ready:Promise<string>;done:Promise<void>};
  constructor(private store:SessionStore,private fetcher:typeof fetch=fetch,private defaults={api:'https://eb-api.sellerplex.com',console:'https://ecombrain.sellerplex.com'}){serviceOrigin(defaults.api);serviceOrigin(defaults.console)}
  private async connect(reconnect:boolean){
    if(isNativeSession(await this.store.load())&&!reconnect)return {status:'already_connected',next:'Call ppc_identity; use reconnect=true if the session was revoked.'};
    if(!this.connecting){
      const {nativeLogin}=await import('./native-login.js');
      let show!:(url:string)=>void,fail!:(error:Error)=>void;const ready=new Promise<string>((resolve,reject)=>{show=resolve;fail=reject});
      const state={ready,done:Promise.resolve()};this.connecting=state;
      state.done=nativeLogin({...this.defaults,store:this.store,fetcher:this.fetcher,showUrl:async url=>show(url)}).catch(()=>{fail(new Error('Native setup failed. Retry ppc_connect.'))}).finally(()=>{if(this.connecting===state)this.connecting=undefined});
    }
    return {status:'awaiting_human_sign_in',verificationUrl:await this.connecting.ready,expiresInSeconds:300,instructions:'Open this local link yourself, sign in and confirm the MCP connection. Never paste a password or token into chat. After connecting, call ppc_identity.'};
  }
  private async api(session:NativeSession,method:Method,path:string,body?:unknown,agent=false):Promise<any>{
    const origin=serviceOrigin(session.origin);
    const response=await this.fetcher(origin+path,{method,headers:{authorization:'Bearer '+(agent?session.credentials.agentToken:session.credentials.accessToken),'content-type':'application/json','x-ppc-adapter-version':'0.3.3'},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'error',signal:AbortSignal.timeout(65000)});
    if(!response.ok){const value=await response.json().catch(()=>null);const code=value?.error?.code;throw new ServiceError(response.status,typeof code==='string'&&/^[A-Z0-9_]{1,80}$/.test(code)?code:'NATIVE_REQUEST_REJECTED')}
    return response.status===204?{ok:true}:response.json();
  }
  private async session():Promise<NativeSession>{
    const refresh=async()=>{
      const current=await this.store.load();if(!isNativeSession(current))throw new ServiceError(401,'NATIVE_LOGIN_REQUIRED');
      if(current.credentials.expiresAt<Date.now()+30000){
        const response=await this.fetcher(serviceOrigin(current.origin)+'/api/v1/auth/refresh',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({refreshToken:current.credentials.refreshToken}),redirect:'error',signal:AbortSignal.timeout(20000)});
        if(!response.ok)throw new ServiceError(401,'NATIVE_LOGIN_REQUIRED');
        const auth=object((await response.json()).data);
        if(typeof auth.accessToken!=='string'||typeof auth.refreshToken!=='string'||!Number.isFinite(auth.expiresIn))throw new ServiceError(502,'INVALID_AUTH_RESPONSE');
        Object.assign(current.credentials,{accessToken:auth.accessToken,refreshToken:auth.refreshToken,expiresAt:Date.now()+auth.expiresIn*1000});await this.store.save(current);
      }
      return current;
    };
    const work=this.serial.catch(()=>{}).then(()=>typeof this.store.withLock==='function'?this.store.withLock(refresh):refresh());this.serial=work;return work;
  }
  async request(method:Method,path:string,body?:unknown):Promise<unknown>{
    if(!path.startsWith('/v1/')||path.includes('..')||path.includes('\\')||path.includes('#'))throw new Error('Invalid native route.');
    if(method==='POST'&&path==='/v1/native/connect')return this.connect(object(body).reconnect===true);
    const s=await this.session();
    if(method==='GET'&&path==='/v1/me'){
      const profile=object((await this.api(s,'GET','/api/v1/users/me')).data);
      if(profile.id!==s.credentials.userId||profile.organization?.id!==s.credentials.organizationId||profile.status!=='ACTIVE'||profile.mustResetPassword)throw new ServiceError(403,'CURRENT_IDENTITY_REQUIRED');
      let accounts=profile.effectiveAccountIds;
      if(!Array.isArray(accounts)){
        const available=object((await this.api(s,'GET','/api/v1/ecommerce-accounts?only_name=true')).data).items??[];
        accounts=available.map((a:any)=>a.id).filter((id:unknown)=>typeof id==='string'&&(profile.roleCodes?.includes('ORG_ADMIN')||(profile.amazonAccountIds??[]).includes(id)));
      }
      return {user:{id:profile.id,organizationId:profile.organization.id,displayName:profile.displayName,email:profile.email,roleCodes:profile.roleCodes,role:profile.roleCodes?.includes('ORG_ADMIN')?'Admin':'Member'},accounts,transport:'native',approvalChannel:'authenticated_console'};
    }
    if(method==='GET'&&path==='/v1/native/capabilities'){
      const capabilities:Record<string,unknown>={transport:'native',adapterVersion:'0.3.3',apiOrigin:s.origin,consoleOrigin:s.consoleOrigin,approval:{agentCanApprove:false,channel:'authenticated_console',exactVersionRequired:true},skills:['sellerplex-automation','sellerplex-business'],nativeHistory:true};
      for(const [key,endpoint,agent] of [['business','/action/v1/business/catalog',true],['assignments','/action/v1/automation/assignments',true],['metadata','/api/v1/automation/metadata/tags',false]] as const){
        try{const value=await this.api(s,'GET',endpoint,undefined,agent);capabilities[key]={available:true,...(key==='business'?{catalog:value.data}:{}),...(key==='assignments'?{assignedAnalysisCount:value.data?.length}:{} )}}
        catch(error){if(!(error instanceof ServiceError))throw error;capabilities[key]={available:false,status:error.status,reason:error.status===404?'backend_upgrade_required':error.status===403?'not_currently_authorized':'unavailable'}}
      }
      return capabilities;
    }
    if(method==='POST'&&path==='/v1/data/query'){assertReadOnlyGraphql(String(object(body).query??''));return this.api(s,method,'/graphql',body,true)}
    if(method==='GET'&&path==='/v1/catalog')return this.api(s,'POST','/graphql',{query:'query PPCDataCatalog { dataCatalog { id entity layer queryable description accountField dateField fields { name type filterable sortable groupable aggregatable } } }'},true);
    if(method==='GET'&&path==='/v1/native/amazon-catalog')return this.api(s,'GET','/action/v1/catalog',undefined,true);
    if(method==='GET'&&path==='/v1/native/business/catalog')return this.api(s,'GET','/action/v1/business/catalog',undefined,true);
    if(method==='GET'&&path==='/v1/native/business/candidates')return this.api(s,'GET','/action/v1/business/candidates',undefined,true);
    if(method==='POST'&&path==='/v1/native/business/preview')return this.api(s,'POST','/api/v1/automation/business-preview',body);
    if(method==='GET'&&/^\/v1\/native\/business\/targets\/[\w-]+\/impacts$/.test(path))return this.api(s,'GET',path.replace('/v1/native/business','/action/v1/business'),undefined,true);
    if(method==='GET'&&/^\/v1\/native\/business\/proposals(?:\?status=[A-Z_]+)?$/.test(path)){
      const value=await this.api(s,'GET',path.replace('/v1/native/business/proposals','/action/v1/action-proposals'),undefined,true);return {...value,data:(value.data??[]).filter((p:any)=>p.domain==='BUSINESS')};
    }
    if(method==='POST'&&path==='/v1/native/business/proposals')return this.api(s,'POST','/action/v1/action-proposals',body,true);
    const review=new RegExp('^/v1/native/review/('+identifier+')$').exec(path);
    if(method==='GET'&&review){let detail=await this.api(s,'GET','/action/v1/action-proposals/'+review[1],undefined,true);if(detail.data?.domain==='AMAZON'){try{detail=await this.api(s,'GET','/action/v1/automation/proposals/'+review[1],undefined,true)}catch(error){if(!(error instanceof ServiceError&&error.status===404))throw error}}return {...detail,reviewUrl:s.consoleOrigin+'/execution/action-queue?proposal='+encodeURIComponent(review[1]!),agentCanApprove:false}}
    const proposal=new RegExp('^/v1/native/business/proposals/('+identifier+')(\\/cancel)?$').exec(path);
    if(proposal){
      const upstream='/action/v1/action-proposals/'+proposal[1];const detail=await this.api(s,'GET',upstream,undefined,true);
      if(detail.data?.domain!=='BUSINESS')throw new ServiceError(404,'NATIVE_BUSINESS_PROPOSAL_NOT_FOUND');
      if(method==='GET'&&!proposal[2])return {...detail,reviewUrl:s.consoleOrigin+'/execution/action-queue?proposal='+encodeURIComponent(proposal[1]!)};
      if(method==='PATCH'&&!proposal[2]){const {entity,scope,...patch}=object(body);if(entity!==detail.data.entity)throw new ServiceError(409,'NATIVE_ENTITY_CHANGED');return this.api(s,'PATCH',upstream,patch,true)}
      if(method==='POST'&&proposal[2])return this.api(s,'POST',upstream+'/cancel',body,true);
    }
    const parsed=new URL(path,'https://local.invalid');
    const readOnly=new Set(['/v1/native/scopes','/v1/native/overview','/v1/native/kpi-catalog','/v1/native/kpi-results']);
    if(method==='GET'&&(readOnly.has(parsed.pathname)||/^\/v1\/native\/library\/(information|methods|kpi-targets|analyses|runs|evidence|evidence-checks)$/.test(parsed.pathname))){
      // Information is scope-specific; callers use the explicit scope route below.
      return this.api(s,'GET',path.replace('/v1/native','/api/v1/automation'));
    }
    if(method==='GET'&&/^\/v1\/native\/scopes\/[\w-]+\/(information|kpi-targets|analyses)$/.test(parsed.pathname))return this.api(s,'GET',path.replace('/v1/native','/api/v1/automation'));
    if(/^\/v1\/native\/metadata\/(tags|properties)(\/[\w-]+)?$/.test(parsed.pathname)&&['GET','POST','PATCH','DELETE'].includes(method))return this.api(s,method,path.replace('/v1/native','/api/v1/automation'),body);
    if((method==='GET'&&/^\/v1\/native\/automation\/assignments$/.test(parsed.pathname))||(method==='POST'&&path==='/v1/native/automation/runs')||(method==='GET'&&new RegExp('^/v1/native/automation/runs/'+identifier+'$').test(path))||(method==='POST'&&new RegExp('^/v1/native/automation/runs/'+identifier+'/(heartbeat|complete|proposals)$').test(path))||(method==='POST'&&path==='/v1/native/automation/proposals')||(method==='GET'&&new RegExp('^/v1/native/automation/proposals/'+identifier+'$').test(path)))return this.api(s,method,path.replace('/v1/native/automation','/action/v1/automation'),body,true);
    if(path==='/v1/settings'&&method==='GET')return {timezone:s.preferences?.timezone,accountIds:s.preferences?.accountIds??[],schedule:s.preferences?.schedule,installedScheduler:false};
    if(path==='/v1/settings'&&method==='PATCH'){s.preferences=object(body);await this.store.save(s);return {saved:true,installedScheduler:false}}
    if(path==='/v1/logout'&&method==='POST'){await this.api(s,'POST','/api/v1/auth/logout',{refreshToken:s.credentials.refreshToken});return {ok:true,localSessionRevoked:true,agentTokenRetained:true}}
    throw new ServiceError(400,'UNSUPPORTED_NATIVE_ROUTE');
  }
}
