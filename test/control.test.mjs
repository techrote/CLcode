import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { RunController } from '../src/runtime/controller.mjs';
import { fixture, PollingProvider } from './helpers.mjs';

async function waitForAdmission(controller, runId) {
  for (let i=0;i<200;i++) { if (controller.status(runId)) return; await new Promise(r=>setTimeout(r,5)); }
  throw new Error(`Run ${runId} was not admitted in time.`);
}

test('hard steer interrupts model and is delivered on restart', async () => {
  const { root, project } = fixture();
  try {
    const provider = new PollingProvider({ completeAfter:1 });
    const controller = new RunController({ stateDir:join(root,'state'), provider, pollIntervalMs:20 });
    const runId='RSTEER0001'; const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Inspect.',maxSteps:4,runId});
    await waitForAdmission(controller, runId); controller.steer(runId,'Re-read the tests.',{hard:true});
    const result=await pending;
    assert.equal(result.status,'completed'); assert.equal(provider.cancels.length,1); assert.equal(provider.creates.length,2);
    assert.match(JSON.stringify(provider.creates[1].input),/Re-read the tests/);
    assert(controller.events(runId).some(e=>e.type==='model.interrupted'));
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('cross-process-style cancel cancels in-progress provider response', async () => {
  const { root, project } = fixture();
  try {
    const provider=new PollingProvider({completeAfter:999});
    const controller=new RunController({stateDir:join(root,'state'),provider,pollIntervalMs:15});
    const runId='RCANCEL001'; const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Wait.',maxSteps:4,runId});
    await waitForAdmission(controller, runId); controller.cancel(runId);
    const result=await pending; assert.equal(result.status,'cancelled'); assert.equal(provider.cancels.length,1);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('cancel interrupts long-running local test process', async () => {
  const { root, project } = fixture();
  class ToolProvider { constructor(){this.i=0;} async settings(worker){return {name:worker,model:'mock',tools:true,effort_policy:{default:'medium'}};} async create(){this.i++; return this.i===1?{id:'resp_tool',status:'completed',text:'',calls:[{call_id:'t',name:'run_test',args:{}}]}:{id:'done',status:'completed',text:'done',calls:[]};} async poll(){throw new Error('unused');} async cancel(){return {status:'cancelled'};} }
  try {
    writeFileSync(join(project,'test','slow.test.mjs'),"import test from 'node:test';\ntest('slow',async()=>{await new Promise(r=>setTimeout(r,10000));});\n");
    execFileSync('git',['add','.'],{cwd:project}); execFileSync('git',['commit','-m','fixture: add slow test'],{cwd:project,stdio:'pipe'});
    const controller=new RunController({stateDir:join(root,'state'),provider:new ToolProvider(),pollIntervalMs:10});
    const runId='RTOOLCANCEL1'; const started=Date.now(); const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Run tests.',maxSteps:3,runId});
    await waitForAdmission(controller, runId); await new Promise(r=>setTimeout(r,350)); controller.cancel(runId); const result=await pending;
    assert.equal(result.status,'cancelled'); assert(Date.now()-started<5000);
    const tool=controller.events(runId).find(e=>e.type==='tool.completed'&&e.payload.name==='run_test'); assert.equal(tool.payload.result.aborted,true);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('ambiguous hard-steer cancellation never submits a replacement', async () => {
  const {root, project} = fixture();
  try {
    const provider = new PollingProvider({completeAfter: 999});
    provider.cancel = async ({id}) => ({id, status:'cancel_unknown'});
    const controller = new RunController({stateDir:join(root,'state'),provider,pollIntervalMs:10});
    const runId='RUNKNOWN01';
    const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Wait',runId});
    await waitForAdmission(controller,runId);
    controller.steer(runId,'Do not replay',{hard:true});
    const result=await pending;
    assert.equal(result.status,'incomplete');
    assert.equal(result.providerState,'unknown');
    assert.equal(provider.creates.length,1);
    assert(controller.events(runId).some(e=>e.type==='model.cancel_unconfirmed'));
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('soft steering consumed while polling survives a final text response', async () => {
  const {root,project}=fixture();
  try {
    const provider=new PollingProvider({completeAfter:1});
    const controller=new RunController({stateDir:join(root,'state'),provider,pollIntervalMs:10});
    const runId='RSOFTFINAL1';
    const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Wait',runId});
    await waitForAdmission(controller,runId);
    controller.steer(runId,'Answer the revised question');
    const result=await pending;
    assert.equal(result.status,'completed');
    assert.equal(provider.creates.length,2);
    assert.match(JSON.stringify(provider.creates[1].input),/Answer the revised question/);
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('cancel queued during create prevents returned tool calls from editing', async () => {
  const {root,project}=fixture();
  try {
    let release, accepted;
    const waiting=new Promise(r=>{release=r;});
    const entered=new Promise(r=>{accepted=r;});
    const provider=new PollingProvider();
    provider.create=async()=>{accepted(); await waiting; return {id:'resp_late',status:'completed',calls:[{call_id:'edit',name:'edit_file',args:{path:'src/slug.mjs',old_text:'return String(value)',new_text:'return String(42)'}}]};};
    const controller=new RunController({stateDir:join(root,'state'),provider,pollIntervalMs:10});
    const runId='RCREATETOOL1';
    const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Edit',runId});
    await entered;
    controller.cancel(runId); release();
    assert.equal((await pending).status,'cancelled');
    assert(!controller.events(runId).some(e=>e.type==='tool.requested'));
    assert.equal(execFileSync('git',['status','--porcelain'],{cwd:project,encoding:'utf8'}).trim(),'');
  } finally {rmSync(root,{recursive:true,force:true});}
});

test('ambiguous operator cancellation is not reported as confirmed', async () => {
  const {root,project}=fixture();
  try {
    const provider=new PollingProvider({completeAfter:999});
    provider.cancel=async ({id})=>({id,status:'cancel_unknown'});
    const controller=new RunController({stateDir:join(root,'state'),provider,pollIntervalMs:10});
    const runId='RCANCELUNKNOWN';
    const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Wait',runId});
    await waitForAdmission(controller,runId);
    controller.cancel(runId);
    const result=await pending;
    assert.equal(result.status,'incomplete');
    assert.equal(result.providerState,'unknown');
    assert(!controller.events(runId).some(e=>e.type==='model.cancelled'));
  } finally {rmSync(root,{recursive:true,force:true});}
});
