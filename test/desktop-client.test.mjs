import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { RuntimeProcessClient, RunFollower, RuntimeProtocolError } from '../src/desktop/runtime-client.mjs';

const fake = fileURLToPath(new URL('./fake-jsonl-server.mjs', import.meta.url));

function client(requestTimeoutMs = 2000) {
  return new RuntimeProcessClient({ command: process.execPath, args: [fake], requestTimeoutMs });
}

test('runtime process client correlates concurrent out-of-order replies', async () => {
  const c = client();
  try {
    const slow = c.request('delay', { value: 'slow', ms: 80 });
    const fast = c.request('delay', { value: 'fast', ms: 5 });
    assert.equal((await fast).value, 'fast');
    assert.equal((await slow).value, 'slow');
    assert.equal((await c.request('workers'))[0].name, 'mock');
  } finally { await c.close(); }
});

test('spawn admission is not abandoned by the generic request timeout', async () => {
  const c = client(20);
  try {
    const admitted = await c.request('spawn', { delayMs: 80, runId: 'RCLIENT001' });
    assert.equal(admitted.runId, 'RCLIENT001');
    assert.equal(admitted.status, 'running');
    await assert.rejects(
      c.request('spawn', { delayMs: 80 }, { timeoutMs: 10 }),
      /spawn requests cannot use a client-side timeout/
    );
  } finally { await c.close(); }
});

test('run follower consumes cursored events until terminal status', async () => {
  const c = client();
  const events = []; const statuses = [];
  try {
    const follower = new RunFollower(c, { pollMs: 10, onEvent: e => events.push(e), onStatus: s => statuses.push(s.status) });
    const result = await follower.spawnAndFollow({ projectRoot: 'fixture', worker: 'mock', task: 'work' });
    assert.equal(result.status, 'completed');
    assert(events.some(e => e.type === 'run.started'));
    assert(events.some(e => e.type === 'run.completed'));
    assert.equal(statuses.at(-1), 'completed');
    const seqs = events.map(e => e.sequence);
    assert.equal(new Set(seqs).size, seqs.length, 'event cursor must not redeliver events');
  } finally { await c.close(); }
});

test('run follower resets its event cursor when switching run identity', async () => {
  const eventRequests = [];
  const events = [];
  const history = [
    { runId: 'RNEW0001', sequence: 1, type: 'run.started', payload: {} },
    { runId: 'RNEW0001', sequence: 2, type: 'run.completed', payload: { answer: 'done' } },
  ];
  const fakeClient = {
    async request(method, params) {
      if (method === 'events') {
        eventRequests.push({ ...params });
        return history.filter(event => event.sequence > Number(params.afterSequence ?? 0));
      }
      if (method === 'status') return { runId: params.runId, status: 'completed', lastSequence: 2 };
      throw new Error(`Unexpected method ${method}`);
    },
  };
  const follower = new RunFollower(fakeClient, { onEvent: event => events.push(event) });
  follower.runId = 'ROLD0001';
  follower.cursor = 42;
  const result = await follower.follow('RNEW0001');
  assert.equal(result.status, 'completed');
  assert.equal(eventRequests[0].afterSequence, 0);
  assert.equal(events[0].runId, 'RNEW0001');
  assert.equal(follower.cursor, 2);
});

test('run follower rejects missing event sequences instead of projecting a complete history', async () => {
  const fakeClient = {
    async request(method) {
      if (method === 'events') return [
        { runId: 'RGAP00001', sequence: 1, type: 'run.started', payload: {} },
        { runId: 'RGAP00001', sequence: 3, type: 'run.completed', payload: {} },
      ];
      if (method === 'status') return { runId: 'RGAP00001', status: 'completed', lastSequence: 3 };
      throw new Error(`Unexpected method ${method}`);
    },
  };
  const follower = new RunFollower(fakeClient, { pollMs: 1 });
  await assert.rejects(
    follower.follow('RGAP00001'),
    error => error instanceof RuntimeProtocolError && error.code === 'event_gap'
  );
});

test('run follower refuses terminal status without the matching terminal event', async () => {
  const fakeClient = {
    async request(method, params) {
      if (method === 'events') return Number(params.afterSequence ?? 0) === 0
        ? [{ runId: 'RTERM0001', sequence: 1, type: 'run.started', payload: {} }]
        : [];
      if (method === 'status') return { runId: 'RTERM0001', status: 'completed', lastSequence: 1 };
      throw new Error(`Unexpected method ${method}`);
    },
  };
  const follower = new RunFollower(fakeClient, { pollMs: 1 });
  await assert.rejects(
    follower.follow('RTERM0001'),
    error => error instanceof RuntimeProtocolError && error.code === 'terminal_history_incomplete'
  );
});

test('follower steering and cancellation use the active run id', async () => {
  const c = client();
  try {
    const follower = new RunFollower(c); follower.runId = 'RCLIENT001';
    assert.equal((await follower.steer('change course', { hard: true })).type, 'steer');
    assert.equal((await follower.cancel()).type, 'cancel');
  } finally { await c.close(); }
});

test('runtime errors are structured and pending requests reject when process exits', async () => {
  const c = client();
  try {
    await assert.rejects(c.request('missing'), error => error instanceof RuntimeProtocolError && error.code === 'runtime_error');
    const pending = c.request('delay', { value: 'never', ms: 1000 });
    c.child.kill();
    await assert.rejects(pending, error => error instanceof RuntimeProtocolError && error.code === 'process_exit');
  } finally { await c.close(); }
});

test('lost spawn acknowledgement exposes known reconciliation ID', async () => {
  const c=client();
  try {
    const pending=c.request('spawn',{runId:'RLOST0001',delayMs:1000});
    c.child.kill();
    await assert.rejects(pending,error=>error.code==='admission_unknown'&&error.detail.runId==='RLOST0001');
  } finally {await c.close();}
});
test('follower refuses to claim continuity for an unverified persisted run', async () => {
  const fakeClient={async request(method){if(method==='events')return[];return {runId:'RRESTART01',status:'running',ownership:'unverified'};}};
  await assert.rejects(new RunFollower(fakeClient,{pollMs:1}).follow('RRESTART01'),error=>error.code==='run_ownership_unverified');
});
test('a busy follower rejects a second spawn before it reaches the service', async () => {
  let release; const gate=new Promise(resolve=>{release=resolve;}); let spawns=0;
  const fakeClient={async request(method,params){if(method==='spawn'){spawns++;return {runId:'RSECOND001',status:'running'};}if(method==='events'){await gate;return params.afterSequence===0?[{runId:'RFIRST0001',sequence:1,type:'run.completed'}]:[];}return {runId:'RFIRST0001',status:'completed',lastSequence:1};}};
  const follower=new RunFollower(fakeClient,{pollMs:1});
  const first=follower.follow('RFIRST0001');
  await assert.rejects(follower.spawnAndFollow({}),error=>error.code==='follower_busy');
  assert.equal(spawns,0); release(); assert.equal((await first).status,'completed');
});
