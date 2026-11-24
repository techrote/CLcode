import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GPTopusAdapter } from '../src/runtime/gptopus-adapter.mjs';

test('GPTopus adapter verifies donor pin, clean source and paged bridge contract', async () => {
  const root=mkdtempSync(join(tmpdir(),'clcode-donor-'));
  try {
    const dir=join(root,'plugins','openai-workers','bridge'); mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'workers.mjs'),"export const WORKER_TYPES={fake:{model:'fake/model',provider:'fake',tools:true}};\nexport const workerSettings=name=>({name,model:'fake/model',provider:'fake',tools:true,effort_policy:{default:'medium'}});\n");
    writeFileSync(join(dir,'server.mjs'),"const text='{\"id\":\"p1\",\"status\":\"completed\",\"text\":\"ok\",\"calls\":[],\"usage\":null}';\nexport async function dispatch(name,args){if(name==='create'){if(args.input==='broken')return{id:'p-broken',status:'completed',paged:true,pages:2,length:20};return{id:'p1',status:'completed',paged:true,pages:2,length:text.length}}if(name==='page'){if(args.id==='p-broken')throw new Error('page cache missing');const m=Math.floor(text.length/2);return{chunk:args.page===0?text.slice(0,m):text.slice(m)}};if(name==='cancel')return{id:args.id,status:'cancelled'};if(name==='poll')return{id:args.id,status:'completed',text:'ok',calls:[]};}\n");
    execFileSync('git',['init','-b','main'],{cwd:root,stdio:'pipe'}); execFileSync('git',['config','user.name','test'],{cwd:root}); execFileSync('git',['config','user.email','test@example.invalid'],{cwd:root}); execFileSync('git',['add','.'],{cwd:root}); execFileSync('git',['commit','-m','fake donor'],{cwd:root,stdio:'pipe'});
    const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
    const adapter=new GPTopusAdapter({root,expectedSha:sha,stateDir:join(root,'state')});
    assert.equal((await adapter.listWorkers())[0].name,'fake');
    assert.equal((await adapter.create({worker:'fake',input:'hi',instructions:'x',tools:[],agentId:'RFAKE0001'})).text,'ok');
    await assert.rejects(
      adapter.create({worker:'fake',input:'broken',instructions:'x',tools:[],agentId:'RFAKE0002'}),
      error => error.responseId === 'p-broken' && error.usageDisposition === 'ambiguous' && error.providerExecutionUnknown === true
    );
    await assert.rejects(new GPTopusAdapter({root,expectedSha:'0000000000000000000000000000000000000000'}).load(),/SHA mismatch/);
    appendFileSync(join(dir,'workers.mjs'),'// local mutation after pin\n');
    await assert.rejects(new GPTopusAdapter({root,expectedSha:sha}).load(),/working tree is not clean/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
