import {mkdir,readFile,writeFile,cp} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {createServer} from '../dist/server.js';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),workspace=root;
const pkg=JSON.parse(await readFile(join(root,'package.json'),'utf8')),version=pkg.version;
const output=resolve(process.argv[2]??join(workspace,'artifacts','commercespine-mcp-'+version));
if(!output.startsWith(workspace+'/')&&!output.startsWith(workspace+'\\'))throw Error('Release staging must stay inside the package workspace.');
await mkdir(output,{recursive:true});
await writeFile(join(output,'package.json'),JSON.stringify({name:'@sellerplex/commerce-spine-mcp',version,description:'Native Commerce Spine MCP and operating skills',private:true,type:'module',engines:{node:'>=22'},bin:{'sellerplex-ppc':'server/dist/cli.js'},dependencies:pkg.dependencies},null,2)+'\n',{flag:'wx'});
for(const path of ['dist','skills','docs','release.json'])await cp(join(root,path),join(output,'server',path),{recursive:true});
await cp(join(root,'scripts/install.mjs'),join(output,'install.mjs'));
await cp(join(root,'docs/distribution-readme.md'),join(output,'README.md'));
// Derive exact production dependency pins from the reviewed workspace lockfile.
const lock=JSON.parse(await readFile(join(workspace,'package-lock.json'),'utf8'));
lock.name='@sellerplex/commerce-spine-mcp';lock.version=version;
lock.packages['']={name:lock.name,version,dependencies:pkg.dependencies,engines:{node:'>=22'}};
for(const [path,entry]of Object.entries(lock.packages))if(path.startsWith('packages/')||entry.link)delete lock.packages[path];
await writeFile(join(output,'package-lock.json'),JSON.stringify(lock,null,2)+'\n');
const server=createServer({request:async()=>{throw Error('Packaging must not access accounts')}},{legacy:false}),client=new Client({name:'release-builder',version});
const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(a);await client.connect(b);
const tools=(await client.listTools()).tools.map(({name,description})=>({name,description}));await client.close();await server.close();
const manifest={manifest_version:'0.3',name:'commercespine',display_name:'Commerce Spine',version,description:'Recurring analyses, KPI-linked proposals and native Business data with human review.',author:{name:'SellerPlex'},repository:{type:'git',url:'https://github.com/WeBuildAgents/commercespine-bussiness-data-mcp'},server:{type:'node',entry_point:'server/dist/cli.js',mcp_config:{command:'node',args:['${__dirname}/server/dist/cli.js','serve','--state-dir','${HOME}/.commercespine-mcp/claude-desktop']}},tools,tools_generated:false,prompts_generated:true,compatibility:{platforms:['win32','darwin','linux'],runtimes:{node:'>=22'}}};
await writeFile(join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(JSON.stringify({stage:output,version,tools:tools.length,skills:2,authentication:'browser; no bundled credentials',next:'npm ci --omit=dev --ignore-scripts in stage; validate and pack with @anthropic-ai/mcpb@2.1.2'}));
