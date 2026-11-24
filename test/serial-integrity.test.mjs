import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, rmSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { RunStore } from '../src/runtime/journal.mjs';
import { RunController } from '../src/runtime/controller.mjs';
import { RuntimeService } from '../src/runtime/service.mjs';
import { RunFollower } from '../src/desktop/runtime-client.mjs';
import { projectRunView } from '../src/desktop/run-view-model.mjs';
import { GPTopusAdapter } from '../src/runtime/gptopus-adapter.mjs';
import { ScopedTools } from '../src/runtime/tools.mjs';
import { fixture, PollingProvider } from './helpers.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function gate() { let open; const promise = new Promise(resolve => { open = resolve; }); return { promise, open }; }
function immediateProvider() {
  const p = new PollingProvider();
  p.create = async args => { p.creates.push(args); return { id:'resp_done', status:'completed', text:'done', calls:[] }; };
  return p;
}
function observed(promise) { return promise.then(value => ({ value }), error => ({ error })); }
async function until(fn, ms = 5000) {
  const start=Date.now(); while (!fn()) { if(Date.now()-start>ms) throw new Error('fixture barrier timed out'); await sleep(10); }
}

test('competing services cannot acknowledge the same durable run as locally owned', async () => {
  const a=fixture(), b=fixture();
  const enter=gate(), releaseA=gate(), releaseB=gate();
  let first, second;
  try {
    const pa=immediateProvider(), pb=immediateProvider();
    pa.settings=async worker=>{enter.open(); await releaseA.promise; return {name:worker,model:'mock',tools:true};};
    pb.create=async args=>{pb.creates.push(args); await releaseB.promise; return {id:'resp_b',status:'completed',calls:[],text:'done'};};
    const sa=new RuntimeService({controller:new RunController({stateDir:join(a.root,'state'),provider:pa}),provider:pa});
    const sb=new RuntimeService({controller:new RunController({stateDir:join(a.root,'state'),provider:pb}),provider:pb});
    const runId='RSHARED001';
    first=observed(sa.start({projectRoot:a.project,worker:'mock',task:'first',runId}));
    await enter.promise;
    second=await sb.start({projectRoot:b.project,worker:'mock',task:'second',runId});
    assert.equal(second.ownership,'local');
    const ownership=sa.status(runId)?.ownership;
    await sleep(40); releaseA.open();
    const outcome=await first;
    releaseB.open(); await sb.wait(runId);
    assert.equal(ownership,'unverified');
    assert.match(String(outcome.error?.message),/already exists/i);
    assert.equal(pa.creates.length,0);
  } finally { releaseA.open(); releaseB.open(); if(first) await first; await sleep(30); rmSync(a.root,{recursive:true,force:true}); rmSync(b.root,{recursive:true,force:true}); }
});

test('distinct run IDs and state directories cannot concurrently own one worktree', async () => {
  const {root,project}=fixture();
  const entered=gate(), release=gate();
  let first;
  try {
    const pa=immediateProvider(), pb=immediateProvider();
    pa.create=async args=>{pa.creates.push(args); entered.open(); await release.promise; return {id:'resp_a',status:'completed',calls:[],text:'done'};};
    const a=new RunController({stateDir:join(root,'a'),provider:pa});
    const b=new RunController({stateDir:join(root,'b'),provider:pb});
    first=observed(a.spawn({projectRoot:project,worker:'mock',task:'first',runId:'RPROJECT01'}));
    await entered.promise;
    const second=await observed(b.spawn({projectRoot:project,worker:'mock',task:'second',runId:'RPROJECT02'}));
    release.open(); assert.equal((await first).value?.status,'completed');
    assert.match(String(second.error?.message),/lease|locked|active run/i);
    assert.equal(pb.creates.length,0);
    const retry=await b.spawn({projectRoot:project,worker:'mock',task:'later',runId:'RPROJECT03'});
    assert.equal(retry.status,'completed');
  } finally {release.open(); if(first) await first; rmSync(root,{recursive:true,force:true});}
});

test('ambiguous provider outcome blocks accidental fresh-run replay on the same worktree', async () => {
  const {root,project}=fixture();
  try {
    const pa=immediateProvider(), pb=immediateProvider();
    pa.create=async args=>{pa.creates.push(args); const e=new Error('ambiguous acceptance'); e.usageDisposition='ambiguous'; throw e;};
    const a=new RunController({stateDir:join(root,'a'),provider:pa}), b=new RunController({stateDir:join(root,'b'),provider:pb});
    const first=await a.spawn({projectRoot:project,worker:'mock',task:'first',runId:'RUNKNOWN11'});
    assert.equal(first.status,'incomplete'); assert.equal(first.providerState,'unknown');
    await assert.rejects(b.spawn({projectRoot:project,worker:'mock',task:'retry',runId:'RUNKNOWN12'}),/lease|locked|active run/i);
    assert.equal(pb.creates.length,0);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('valid-looking truncated journal tail cannot be silently replaced by a new event', () => {
  const root=mkdtempSync(join(tmpdir(),'clcode-tail-'));
  try {
    const s=new RunStore(root), id='RTRUNC0001';
    s.init({runId:id,status:'running'}); s.event(id,'run.started'); s.event(id,'model.requested');
    const file=join(s.runDir(id),'events.jsonl'), first=readFileSync(file,'utf8').split('\n')[0]+'\n';
    writeFileSync(file,first);
    assert.throws(()=>s.event(id,'model.accepted'),/history|sequence|truncat/i);
    assert.equal(readFileSync(file,'utf8'),first);
    assert.equal(s.readSummary(id).lastSequence,2);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('journal cannot append another event after the final run event', () => {
  const root=mkdtempSync(join(tmpdir(),'clcode-final-'));
  try {
    const s=new RunStore(root), id='RFINALL001';
    s.init({runId:id,status:'running'}); s.event(id,'run.started');
    s.patchSummary(id,{status:'completed'}); s.event(id,'run.completed');
    assert.throws(()=>s.event(id,'model.requested'),/terminal|final/i);
    assert.equal(s.readEvents(id).length,2);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('provider-attempt ceiling also applies to repeated hard steering', async () => {
  const {root,project}=fixture();
  try {
    const p=immediateProvider(), id='RATTEMPT01';
    const c=new RunController({stateDir:join(root,'state'),provider:p,pollIntervalMs:1});
    p.create=async args=>{
      p.creates.push(args);
      if(p.creates.length===1){c.steer(id,'new direction',{hard:true}); return {id:'resp_first',status:'in_progress'};}
      return {id:'resp_second',status:'completed',calls:[],text:'done'};
    };
    const result=await c.spawn({projectRoot:project,worker:'mock',task:'bounded',runId:id,maxSteps:1});
    assert.equal(result.status,'step_limit'); assert.equal(p.creates.length,1);
    assert(!c.events(id).some(e=>e.type==='run.steer_delivered'));
    assert.equal(result.currentResponseId,null);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('soft steer at the final attempt is not reported delivered to a nonexistent request', async () => {
  const {root,project}=fixture();
  try {
    const p=immediateProvider(), id='RSTEERLIM1';
    const c=new RunController({stateDir:join(root,'state'),provider:p});
    p.create=async args=>{p.creates.push(args); c.steer(id,'later'); return {id:'resp_only',status:'completed',calls:[],text:'done'};};
    const result=await c.spawn({projectRoot:project,worker:'mock',task:'bounded',runId:id,maxSteps:1});
    assert.equal(result.status,'step_limit'); assert.equal(p.creates.length,1);
    assert(c.events(id).some(e=>e.type==='run.steer_received'));
    assert(!c.events(id).some(e=>e.type==='run.steer_delivered'));
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('provider response finishing after the deadline cannot be reported as an on-budget completion', async () => {
  const {root,project}=fixture();
  try {
    const p=immediateProvider();
    p.create=async args=>{p.creates.push(args); await sleep(160); return {id:'resp_late',status:'completed',calls:[],text:'late'};};
    const c=new RunController({stateDir:join(root,'state'),provider:p});
    const result=await c.spawn({projectRoot:project,worker:'mock',task:'deadline',runId:'RLATE00001',maxMinutes:0.001});
    assert.equal(result.status,'time_limit');
    assert(c.events(result.runId).some(e=>e.type==='model.completed'&&e.payload.responseId==='resp_late'));
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('follower cannot accept a foreign status despite matching event count and terminal type', async () => {
  const a='RSTATUS001', b='RSTATUS002';
  const fake={async request(method,params){
    if(method==='events') return params.afterSequence===0?[{runId:a,sequence:1,type:'run.completed'}]:[];
    return {runId:b,status:'completed',lastSequence:1};
  }};
  await assert.rejects(new RunFollower(fake,{pollMs:1}).follow(a),e=>e.code==='status_run_mismatch');
});

test('unverified persisted ownership and upstream ambiguity survive Desktop status projection', () => {
  const v=projectRunView({status:{runId:'RVIEWOWN01',status:'running',ownership:'unverified',providerState:'unknown',requestId:'RVIEWOWN01:1',lastSequence:0}});
  assert.equal(v.ownership,'unverified'); assert.equal(v.providerState,'unknown'); assert.equal(v.requestId,'RVIEWOWN01:1');
});

test('cached donor loader rechecks source before a new provider request', async () => {
  const root=mkdtempSync(join(tmpdir(),'clcode-donor-cache-'));
  try {
    const dir=join(root,'plugins','openai-workers','bridge'); mkdirSync(dir,{recursive:true});
    writeFileSync(join(dir,'workers.mjs'),"export const WORKER_TYPES={fake:{}};\nexport const workerSettings=name=>({name,model:'fake',tools:true});\n");
    writeFileSync(join(dir,'server.mjs'),"export async function dispatch(){return {id:'resp_fake',status:'completed'};}\n");
    const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:'pipe'});
    git('init','-b','main');git('config','user.name','test');git('config','user.email','test@example.invalid');git('add','.');git('commit','-m','fake donor');
    const adapter=new GPTopusAdapter({root,expectedSha:git('rev-parse','HEAD').trim()});
    await adapter.listWorkers();
    writeFileSync(join(dir,'workers.mjs'),"// changed after initial donor verification\n");
    await assert.rejects(adapter.create({worker:'fake',input:'hi',instructions:'x',tools:[]}),/working tree is not clean|donor.*changed/i);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('ordinary descendant process cannot write after test-tool cancellation', async () => {
  const {root,project}=fixture();
  const ready=join(root,'ready'), marker=join(root,'late-write');
  let pending; const abort=new AbortController();
  try {
    const childCode='setTimeout(()=>require("node:fs").writeFileSync('+JSON.stringify(marker)+',"late"),1000)';
    writeFileSync(join(project,'test','descendant.test.mjs'),
      "import test from 'node:test'; import {spawn} from 'node:child_process'; import {writeFileSync} from 'node:fs';\n"+
      "test('descendant',async()=>{ const c=spawn(process.execPath,['-e',"+JSON.stringify(childCode)+"],{stdio:'ignore'}); c.unref(); writeFileSync("+JSON.stringify(ready)+",String(c.pid)); await new Promise(r=>setTimeout(r,10000)); });\n");
    execFileSync('git',['add','.'],{cwd:project});execFileSync('git',['commit','-m','fixture: descendant'],{cwd:project,stdio:'pipe'});
    const tools=await ScopedTools.create(project);
    pending=tools.runTest(abort.signal);
    await until(()=>existsSync(ready)); abort.abort();
    const result=await pending;
    assert.equal(result.aborted,true);
    await sleep(1300);
    assert.equal(existsSync(marker),false,'descendant performed an external effect after cancellation');
  } finally {abort.abort(); if(pending) await pending; if(existsSync(ready)){try{process.kill(Number(readFileSync(ready,'utf8')));}catch{}} rmSync(root,{recursive:true,force:true});}
});
