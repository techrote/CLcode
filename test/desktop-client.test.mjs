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
    const admitted = await c.request('spawn', { delayMs: 80 });
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
    assert.deepEqual(statuses.slice(-2), ['running', 'completed']);
    const seqs = events.map(e => e.sequence);
    assert.equal(new Set(seqs).size, seqs.length, 'event cursor must not redeliver events');
  } finally { await c.close(); }
});

test('run follower resets its event cursor when switching run identity', async () => {
  const eventRequests = [];
  const events = [];
  const fakeClient = {
    async request(method, params) {
      if (method === 'events') {
        eventRequests.push({ ...params });
        return params.afterSequence === 0
          ? [{ runId: params.runId, sequence: 1, type: 'run.started', payload: {} }]
          : [];
      }
      if (method === 'status') return { runId: params.runId, status: 'completed', lastSequence: 1 };
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
  assert.equal(follower.cursor, 1);
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
