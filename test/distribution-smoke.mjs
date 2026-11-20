import assert from 'node:assert/strict';
import {mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
const stage=resolve(process.argv[2]),temporary=await mkdtemp(join(tmpdir(),'commerce-spine-distribution-'));
try{
  const isolated=join(temporary,'package');await cp(stage,isolated,{recursive:true});
  const cli=join(isolated,'server/dist/cli.js'),state=join(temporary,'private-state');
  const client=new Client({name:'clean-recipient-harness',version:'1'});
  await client.connect(new StdioClientTransport({command:process.execPath,args:[cli,'serve','--state-dir',state],cwd:isolated,stderr:'pipe'}));
  try{
    const tools=(await client.listTools()).tools;assert.ok(tools.length>30);assert.ok(tools.some(t=>t.name==='ppc_connect'));
    for(const name of ['automation','business'])assert.ok((await client.readResource({uri:'sellerplex://skills/'+name})).contents[0].text.length>1000);
    const guide=await client.callTool({name:'ppc_workflow_guide',arguments:{guide:'automation-contracts'}});assert.ok(!guide.isError);
    assert.equal((await client.callTool({name:'ppc_identity',arguments:{}})).isError,true);
    const manifest=JSON.parse(await readFile(join(isolated,'manifest.json'),'utf8'));assert.equal(manifest.tools.length,tools.length);
    const plans={};for(const harness of ['codex','claude-code']){const result=spawnSync(process.execPath,[join(isolated,'install.mjs'),harness,'--dry-run'],{cwd:isolated,encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);const plan=JSON.parse(result.stdout);assert.equal(plan.harness,harness);assert.ok(plan.args.includes(cli));plans[harness]={valid:true,skills:plan.skills.length}}
    const result={passed:true,version:manifest.version,tools:tools.length,skills:2,isolatedRecipientDirectory:true,installedDevelopmentDependencies:false,authenticatedLiveUser:false,installerPlans:plans};
    await writeFile(resolve(stage,'../distribution-smoke.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await client.close()}
}finally{assert.equal(dirname(temporary),resolve(tmpdir()));await rm(temporary,{recursive:true,force:true})}
