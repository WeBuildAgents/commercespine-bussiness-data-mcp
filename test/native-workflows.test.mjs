import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {createServer} from '../dist/server.js';
import {NativeClient} from '../dist/native-client.js';
import {nativeLogin} from '../dist/native-login.js';
import {SessionStore} from '../dist/store.js';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {createServer as httpServer} from 'node:http';
import {spawnSync} from 'node:child_process';

const session=()=>({mode:'native',origin:'https://api.example',consoleOrigin:'https://console.example',token:'native-protected-session',savedAt:new Date().toISOString(),credentials:{accessToken:'private-jwt',refreshToken:'private-refresh',expiresAt:Date.now()+3600000,agentToken:'private-agent',agentTokenId:'token_1',userId:'user_1',organizationId:'org_1'}});
const memory=()=>({value:session(),async load(){return this.value},async save(v){this.value=v}});
async function connect(t,request){const server=createServer({request},{legacy:false}),client=new Client({name:'native-test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);t.after(async()=>{await client.close();await server.close()});return client}
const uuids={analysis:'11111111-1111-4111-8111-111111111111',claim:'22222222-2222-4222-8222-222222222222',run:'33333333-3333-4333-8333-333333333333'};

test('native MCP negotiation exposes both complete workflows and no legacy or approval primitives',async t=>{
 const client=await connect(t,async()=>({ok:true}));const names=(await client.listTools()).tools.map(t=>t.name);
 for(const name of ['ppc_connect','ppc_capabilities','ppc_native_assignments','ppc_native_run_start','ppc_native_run_complete','ppc_native_proposal_prepare','ppc_ad_hoc_proposal_prepare','ppc_metadata_create','ppc_metadata_archive','ppc_review_prepare'])assert.ok(names.includes(name),name);
 for(const name of ['ppc_run_start','ppc_knowledge_submit','ppc_analysis_propose'])assert.ok(!names.includes(name));
 assert.ok(names.every(n=>!/approve|execute|retrigger|http/.test(n)));
 for(const uri of ['sellerplex://skills/automation','sellerplex://skills/business','sellerplex://references/automation-contracts','sellerplex://references/business-contracts'])assert.ok((await client.readResource({uri})).contents[0].text.length>500);
 const prompts=(await client.listPrompts()).prompts.map(p=>p.name);assert.deepEqual(prompts.sort(),['analyze-or-edit-business','run-assigned-analyses']);
});

test('direct native route separation sends Console JWT only to allowed Console paths and agent token to Action/data',async()=>{
 const calls=[],store=memory();const client=new NativeClient(store,async(url,options)=>{calls.push({url,options});return Response.json({data:[]})});
 await client.request('GET','/v1/native/metadata/tags?q=budget');await client.request('POST','/v1/native/metadata/properties',{name:'Owner'});
 await client.request('DELETE','/v1/native/metadata/tags/11111111-1111-4111-8111-111111111111?version=2');
 await client.request('GET','/v1/native/automation/assignments');await client.request('POST','/v1/data/query',{query:'query { dataCatalog { id } }'});
 assert.ok(calls.slice(0,3).every(c=>c.options.headers.authorization==='Bearer private-jwt'));
 assert.ok(calls.slice(3).every(c=>c.options.headers.authorization==='Bearer private-agent'));
 assert.equal(calls[2].options.method,'DELETE');assert.ok(calls.every(c=>c.options.redirect==='error'));
});

test('native route allowlist rejects decisions, traversal and GraphQL mutations before upstream writes',async()=>{
 const calls=[];const client=new NativeClient(memory(),async(...args)=>{calls.push(args);return Response.json({})});
 for(const path of ['/v1/native/business/proposals/p/approve','/v1/native/business/proposals/p/reject','/v1/native/automation/runs/r/execute','/v1/native/http','/v1/native/../../secrets'])await assert.rejects(client.request('POST',path,{}));
 await assert.rejects(client.request('POST','/v1/data/query',{query:'mutation { action }'}));assert.equal(calls.length,0);
});

test('revoked/unsupported capabilities stay visible and writes are not blindly retried or leaked',async t=>{
 let count=0;const native=new NativeClient(memory(),async()=>{count++;return Response.json({error:{code:'FORBIDDEN_SCOPE',detail:'private-provider-credential'}},{status:403})});
 const cap=await native.request('GET','/v1/native/capabilities');assert.equal(cap.business.available,false);assert.equal(cap.business.status,403);assert.equal(cap.assignments.available,false);assert.equal(count,3);
 const client=await connect(t,(...args)=>native.request(...args));const result=await client.callTool({name:'ppc_metadata_create',arguments:{kind:'tags',name:'Budget'}});assert.equal(result.isError,true);assert.equal(count,4);assert.doesNotMatch(JSON.stringify(result),/private-/);
});

test('independent stdio clients sharing protected state rotate an expired refresh session only once',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'native-mcp-refresh-'));t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));return rm(directory,{recursive:true,force:true})});
 const first=new SessionStore(directory),second=new SessionStore(directory),expired=session();expired.credentials.expiresAt=0;await first.save(expired);let rotations=0;
 const fetcher=async(path,options)=>{if(path.endsWith('/auth/refresh')){rotations++;await new Promise(resolve=>setTimeout(resolve,40));return Response.json({data:{accessToken:'rotated-private-jwt',refreshToken:'rotated-private-refresh',expiresIn:3600}})}assert.equal(options.headers.authorization,'Bearer rotated-private-jwt');return Response.json({data:[]})};
 await Promise.all([new NativeClient(first,fetcher).request('GET','/v1/native/kpi-catalog'),new NativeClient(second,fetcher).request('GET','/v1/native/kpi-catalog')]);
 assert.equal(rotations,1);assert.equal((await second.load()).credentials.refreshToken,'rotated-private-refresh');
});

test('MCP claim, heartbeat, proposal and closure preserve exact native claim identity',async t=>{
 const calls=[];const client=await connect(t,async(...args)=>{calls.push(args);return {data:{runId:uuids.run,status:'running'}}});
 const start={analysisId:uuids.analysis,requestId:uuids.claim,scheduledAt:'2026-11-19T12:00:00Z',periodStart:'2026-11-12T00:00:00Z',periodEnd:'2026-11-19T00:00:00Z',timezone:'America/Sao_Paulo'};
 assert.ok(!(await client.callTool({name:'ppc_native_run_start',arguments:start})).isError);
 await client.callTool({name:'ppc_native_run_heartbeat',arguments:{runId:uuids.run,requestId:uuids.claim}});
 await client.callTool({name:'ppc_native_proposal_prepare',arguments:{runId:uuids.run,requestId:uuids.claim,key:'campaign-1-budget',evidence:[{queryId:'q1'}],rationale:'Protocol rule',expectedEffect:'Improve target',proposal:{kpiTargets:[{targetId:'target',revisionId:'revision'}]}}});
 await client.callTool({name:'ppc_native_run_complete',arguments:{runId:uuids.run,requestId:uuids.claim,status:'partial',summary:'Missing data',checks:[{status:'inconclusive'}],sources:[{queryId:'q1'}],errors:[{reason:'missing_day'}]}});
 assert.equal(calls.length,4);assert.ok(calls.every(c=>c[2].requestId===uuids.claim));assert.equal(calls[3][2].status,'partial');assert.equal(calls[3][2].errors[0].reason,'missing_day');assert.equal(calls[2][1],`/v1/native/automation/runs/${uuids.run}/proposals`);
});

test('browser login binds origin/nonce/consent, stores protected native credentials, and exposes none to the model',async()=>{
 const store={value:undefined,async load(){return this.value},async save(v){this.value=v}};let url;const calls=[];
 const pending=nativeLogin({api:'https://api.example',console:'https://console.example',store,timeoutMs:10000,showUrl:async link=>{url=link;const page=await fetch(link);const html=await page.text();assert.match(html,/consent/);const nonce=new URL(link).searchParams.get('state');
  const evil=await fetch(link,{method:'POST',headers:{origin:'https://evil.example','content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce,email:'me@example.com',password:'never-return',consent:'yes'})});assert.equal(evil.status,403);
  const ok=await fetch(link,{method:'POST',headers:{origin:new URL(link).origin,'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({nonce,email:'me@example.com',password:'never-return',consent:'yes'})});assert.equal(ok.status,200);assert.doesNotMatch(await ok.text(),/never-return|jwt-secret|raw-agent/);
 },fetcher:async(path,options)=>{calls.push({path,options});if(path.endsWith('/login'))return Response.json({data:{accessToken:'jwt-secret',refreshToken:'refresh-secret',expiresIn:3600}});if(path.endsWith('/me'))return Response.json({data:{id:'user_1',organization:{id:'org_1',status:'ACTIVE'},status:'ACTIVE',roleCodes:['ORG_CUSTOM_ANALYST']}});return Response.json({data:{rawToken:'raw-agent',token:{id:'t1',ownerUserId:'user_1',status:'ACTIVE'}}})}});
 await pending;assert.equal(store.value.mode,'native');assert.equal(store.value.credentials.agentToken,'raw-agent');assert.equal(calls.length,3);assert.ok(url.startsWith('http://127.0.0.1:'));
});

test('fresh stdio install negotiates native tools before login and skill installer includes references',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'native-mcp-'));t.after(()=>{assert.equal(dirname(resolve(directory)),resolve(tmpdir()));return rm(directory,{recursive:true,force:true})});
 const transport=new StdioClientTransport({command:process.execPath,args:[resolve('dist/cli.js'),'serve','--state-dir',directory],stderr:'pipe'}),client=new Client({name:'fresh-codex-or-claude',version:'1'});await client.connect(transport);t.after(()=>client.close());assert.ok((await client.listTools()).tools.some(t=>t.name==='ppc_connect'));
 const skills=join(directory,'skills');const installed=spawnSync(process.execPath,[resolve('dist/cli.js'),'install-skill','--skill-dir',skills],{encoding:'utf8',windowsHide:true});assert.equal(installed.status,0,installed.stderr);
 for(const [name,ref] of [['sellerplex-automation','automation-contracts'],['sellerplex-business','business-contracts']]){const text=await readFile(join(skills,name,'SKILL.md'),'utf8');assert.match(text,new RegExp('name: '+name));assert.ok((await readFile(join(skills,name,'references',ref+'.md'),'utf8')).length>500)}
 const repeat=spawnSync(process.execPath,[resolve('dist/cli.js'),'install-skill','--skill-dir',skills],{encoding:'utf8',windowsHide:true});assert.notEqual(repeat.status,0);assert.match(repeat.stderr,/already exists/);
});
