import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { RunController } from '../src/runtime/controller.mjs';
import { RuntimeService } from '../src/runtime/service.mjs';
import { serve } from '../src/server.mjs';
import { fixture, PollingProvider } from './helpers.mjs';

test('runtime service returns run id promptly and exposes status/events', async () => {
  const {root,project}=fixture();
  try {
    const provider=new PollingProvider({completeAfter:2}); provider.listWorkers=async()=>[{name:'mock',model:'mock-polling',available:true}];
    const controller=new RunController({stateDir:join(root,'state'),provider,pollIntervalMs:25}); const service=new RuntimeService({controller,provider});
    const admitted=await service.invoke('spawn',{projectRoot:project,worker:'mock',task:'Wait briefly.',maxSteps:3});
    assert.equal(admitted.status,'running'); assert.match(admitted.runId,/^R/); assert((await service.invoke('list')).some(r=>r.runId===admitted.runId));
    assert.equal((await service.invoke('workers'))[0].name,'mock'); assert.equal((await service.wait(admitted.runId)).status,'completed');
    const events=await service.invoke('events',{runId:admitted.runId,afterSequence:0}); assert(events.some(e=>e.type==='run.started')); assert(events.some(e=>e.type==='run.completed'));
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('slow admission cannot become a live orphan after an apparent spawn failure', async () => {
  let summary = null;
  const controller = {
    status(runId) { return summary?.runId === runId ? summary : null; },
    async spawn({ runId }) {
      await new Promise(resolve => setTimeout(resolve, 80));
      summary = { runId, status: 'running', phase: 'admitted', lastSequence: 0 };
      await new Promise(resolve => setTimeout(resolve, 30));
      summary = { ...summary, status: 'completed', phase: 'completed' };
      return summary;
    },
  };
  const service = new RuntimeService({ controller, provider: {} });
  const started = Date.now();
  const admitted = await service.start({ runId: 'RSLOW0001' });
  assert.equal(admitted.status, 'running');
  assert(Date.now() - started >= 60, 'test must exercise delayed admission rather than an immediate summary');
  assert.equal((await service.wait('RSLOW0001')).status, 'completed');
});

test('JSONL service exposes Desktop request/response boundary', async () => {
  const input=new PassThrough(); const replies=[];
  const service={async invoke(method,params){if(method==='status')return{runId:params.runId,status:'running'};if(method==='list')return[{runId:'RJSONL001',status:'running'}];throw new Error('no such method');}};
  const serving=serve({input,output:msg=>replies.push(msg),service});
  input.write(JSON.stringify({id:1,method:'status',params:{runId:'RJSONL001'}})+'\n'); input.write('{not json}\n'); input.write(JSON.stringify({id:2,method:'list',params:{}})+'\n'); input.write(JSON.stringify({id:3,method:'missing',params:{}})+'\n'); input.end();
  await serving; assert.deepEqual(replies[0],{id:1,result:{runId:'RJSONL001',status:'running'}}); assert.equal(replies[1].error.code,'invalid_json'); assert.equal(replies[2].result[0].runId,'RJSONL001'); assert.equal(replies[3].error.code,'runtime_error');
});
