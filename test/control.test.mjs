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


test('cancel does not become terminal until an optimistic provider cancellation is observed by poll', async () => {
  const { root, project } = fixture();
  const order = [];
  class OptimisticCancelProvider {
    constructor() { this.polls = 0; }
    async settings(worker) { return { name: worker, model: 'mock-chat', provider: 'nvidia', tools: true, effort_policy: { default: 'medium' } }; }
    async create() { order.push('create'); return { id: 'chat_c0123456789abcdef_1', status: 'in_progress', model: 'mock-chat', provider: 'nvidia' }; }
    async cancel({ id }) { order.push('cancel'); return { id, status: 'cancelled' }; }
    async poll({ id }) {
      order.push(`poll-${++this.polls}`);
      return this.polls < 2 ? { id, status: 'in_progress' } : { id, status: 'cancelled', usage: null, estimatedUsd: 0, priceStatus: 'free', model: 'mock-chat', provider: 'nvidia' };
    }
  }
  try {
    const provider = new OptimisticCancelProvider();
    const controller = new RunController({ stateDir: join(root, 'state'), provider, pollIntervalMs: 5 });
    const runId = 'RCHATCANCEL1';
    const pending = controller.spawn({ projectRoot: project, worker: 'mock', task: 'Wait.', maxSteps: 4, runId });
    await waitForAdmission(controller, runId);
    controller.cancel(runId);
    const result = await pending;
    assert.equal(result.status, 'cancelled');
    assert(order.includes('cancel'));
    assert(order.some(x => x.startsWith('poll-')), 'provider cancellation must be independently observed');
    assert(order.indexOf('cancel') < order.findIndex(x => x.startsWith('poll-')));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('cancel racing provider completion reports incomplete rather than confirmed cancellation', async () => {
  const { root, project } = fixture();
  class CompletionRaceProvider {
    async settings(worker) { return { name: worker, model: 'mock', tools: true, effort_policy: { default: 'medium' } }; }
    async create() { return { id: 'resp_race', status: 'in_progress' }; }
    async cancel({ id }) { return { id, status: 'completed', text: 'already done', calls: [], usage: { input: 2, cached: 0, output: 1, total: 3 }, estimatedUsd: 0.001, priceStatus: 'estimated', model: 'mock' }; }
    async poll() { throw new Error('poll should not be needed after authoritative completion'); }
  }
  try {
    const controller = new RunController({ stateDir: join(root, 'state'), provider: new CompletionRaceProvider(), pollIntervalMs: 10 });
    const runId = 'RRACECAN01';
    const pending = controller.spawn({ projectRoot: project, worker: 'mock', task: 'Wait.', maxSteps: 4, runId });
    await waitForAdmission(controller, runId);
    controller.cancel(runId);
    const result = await pending;
    assert.equal(result.status, 'incomplete');
    assert.equal(result.providerStatus, 'completed');
    assert.notEqual(result.status, 'cancelled');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('hard steer never resubmits until cancellation uncertainty reaches a terminal provider state', async () => {
  const { root, project } = fixture();
  const order = [];
  class UncertainHardSteerProvider {
    constructor() { this.creates = 0; this.cancelPolls = 0; }
    async settings(worker) { return { name: worker, model: 'mock', tools: true, effort_policy: { default: 'medium' } }; }
    async create(args) {
      this.creates++;
      order.push(`create-${this.creates}`);
      if (this.creates === 1) return { id: 'resp_first', status: 'in_progress' };
      assert.match(JSON.stringify(args.input), /change course/);
      return { id: 'resp_second', status: 'completed', text: 'done', calls: [], usage: { input: 1, cached: 0, output: 1, total: 2 }, estimatedUsd: 0.001, priceStatus: 'estimated', model: 'mock' };
    }
    async cancel({ id }) { order.push('cancel-unknown'); return { id, status: 'cancel_unknown', reason: 'transport uncertain' }; }
    async poll({ id }) {
      this.cancelPolls++;
      order.push(`cancel-poll-${this.cancelPolls}`);
      return this.cancelPolls < 2 ? { id, status: 'in_progress' } : { id, status: 'cancelled', usage: null, estimatedUsd: null, priceStatus: 'unknown', model: 'mock' };
    }
  }
  try {
    const provider = new UncertainHardSteerProvider();
    const controller = new RunController({ stateDir: join(root, 'state'), provider, pollIntervalMs: 5 });
    const runId = 'RHARDWAIT1';
    const pending = controller.spawn({ projectRoot: project, worker: 'mock', task: 'Inspect.', maxSteps: 4, runId });
    await waitForAdmission(controller, runId);
    controller.steer(runId, 'change course', { hard: true });
    const result = await pending;
    assert.equal(result.status, 'completed');
    assert.equal(provider.creates, 2);
    assert(order.indexOf('create-2') > order.indexOf('cancel-poll-2'), JSON.stringify(order));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('read-only poll transport failure is retried without inventing terminal failure', async () => {
  const { root, project } = fixture();
  class FlakyPollProvider {
    constructor() { this.polls = 0; }
    async settings(worker) { return { name: worker, model: 'mock', tools: true, effort_policy: { default: 'medium' } }; }
    async create() { return { id: 'resp_flaky', status: 'in_progress' }; }
    async cancel({ id }) { return { id, status: 'cancelled' }; }
    async poll({ id }) {
      this.polls++;
      if (this.polls === 1) {
        const error = new Error('temporary GET failure');
        error.usageDisposition = 'read_only';
        throw error;
      }
      return { id, status: 'completed', text: 'done', calls: [], usage: { input: 1, cached: 0, output: 1, total: 2 }, estimatedUsd: 0.001, priceStatus: 'estimated', model: 'mock' };
    }
  }
  try {
    const provider = new FlakyPollProvider();
    const controller = new RunController({ stateDir: join(root, 'state'), provider, pollIntervalMs: 5 });
    const result = await controller.spawn({ projectRoot: project, worker: 'mock', task: 'Wait.', maxSteps: 4, runId: 'RFLAKYPOLL1' });
    assert.equal(result.status, 'completed');
    assert.equal(provider.polls, 2);
    assert(controller.events(result.runId).some(e => e.type === 'model.poll_failed' && e.payload.usageDisposition === 'read_only'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('ambiguous provider create cannot be classified as ordinary zero-cost failure', async () => {
  const { root, project } = fixture();
  class AmbiguousCreateProvider {
    async settings(worker) { return { name: worker, model: 'mock', tools: true, effort_policy: { default: 'medium' } }; }
    async create() {
      const error = new Error('POST transport ended without an authoritative response');
      error.usageDisposition = 'ambiguous';
      throw error;
    }
  }
  try {
    const controller = new RunController({ stateDir: join(root, 'state'), provider: new AmbiguousCreateProvider(), pollIntervalMs: 5 });
    const result = await controller.spawn({ projectRoot: project, worker: 'mock', task: 'Do work.', maxSteps: 4, runId: 'RAMBIG001' });
    assert.equal(result.status, 'interrupted');
    assert.equal(result.providerExecutionUnknown, true);
    assert.equal(result.usageUnknown, true);
    assert.equal(result.costUnknown, true);
    assert(controller.events(result.runId).some(e => e.type === 'model.request_failed' && e.payload.usageDisposition === 'ambiguous'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('actual provider model substitution replaces configured identity in durable run truth', async () => {
  const { root, project } = fixture();
  class SubstitutingProvider {
    async settings(worker) { return { name: worker, model: 'configured-model', provider: 'nvidia', tools: true, effort_policy: { default: 'medium' } }; }
    async create() {
      return {
        id: 'chat_c0123456789abcdef_1', status: 'completed', text: 'done', calls: [],
        usage: null, estimatedUsd: 0, priceStatus: 'free', model: 'substitute-model',
        provider: 'nvidia', substitutedFrom: 'configured-model',
      };
    }
  }
  try {
    const controller = new RunController({ stateDir: join(root, 'state'), provider: new SubstitutingProvider(), pollIntervalMs: 5 });
    const result = await controller.spawn({ projectRoot: project, worker: 'mock', task: 'Do work.', maxSteps: 4, runId: 'RSUBMODEL1' });
    assert.equal(result.status, 'completed');
    assert.equal(result.configuredModel, 'configured-model');
    assert.equal(result.model, 'substitute-model');
    assert.equal(result.substitutedFrom, 'configured-model');
    const event = controller.events(result.runId).find(e => e.type === 'model.completed');
    assert.equal(event.payload.model, 'substitute-model');
    assert.equal(event.payload.substitutedFrom, 'configured-model');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
