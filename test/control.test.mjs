import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunController } from '../src/runtime/controller.mjs';
import { fixture, PollingProvider } from './helpers.mjs';

test('hard steer interrupts model and is delivered on restart', async () => {
  const { root, project } = fixture();
  try {
    const provider = new PollingProvider({ completeAfter:1 });
    const controller = new RunController({ stateDir:join(root,'state'), provider, pollIntervalMs:20 });
    const runId='RSTEER0001'; const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Inspect.',maxSteps:4,runId});
    await new Promise(r=>setTimeout(r,5)); controller.steer(runId,'Re-read the tests.',{hard:true});
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
    await new Promise(r=>setTimeout(r,5)); controller.cancel(runId);
    const result=await pending; assert.equal(result.status,'cancelled'); assert.equal(provider.cancels.length,1);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('cancel interrupts long-running local test process', async () => {
  const { root, project } = fixture();
  class ToolProvider { constructor(){this.i=0;} async settings(worker){return {name:worker,model:'mock',tools:true,effort_policy:{default:'medium'}};} async create(){this.i++; return this.i===1?{id:'resp_tool',status:'completed',text:'',calls:[{call_id:'t',name:'run_test',args:{}}]}:{id:'done',status:'completed',text:'done',calls:[]};} async poll(){throw new Error('unused');} async cancel(){return {status:'cancelled'};} }
  try {
    writeFileSync(join(project,'test','slow.test.mjs'),"import test from 'node:test';\ntest('slow',async()=>{await new Promise(r=>setTimeout(r,10000));});\n");
    const controller=new RunController({stateDir:join(root,'state'),provider:new ToolProvider(),pollIntervalMs:10});
    const runId='RTOOLCANCEL1'; const started=Date.now(); const pending=controller.spawn({projectRoot:project,worker:'mock',task:'Run tests.',maxSteps:3,runId});
    await new Promise(r=>setTimeout(r,350)); controller.cancel(runId); const result=await pending;
    assert.equal(result.status,'cancelled'); assert(Date.now()-started<5000);
    const tool=controller.events(runId).find(e=>e.type==='tool.completed'&&e.payload.name==='run_test'); assert.equal(tool.payload.result.aborted,true);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
