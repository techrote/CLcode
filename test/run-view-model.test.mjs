import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunView, applyRuntimeEvent, applyRuntimeEvents, applyRuntimeStatus, publicRunView } from '../src/desktop/run-view-model.mjs';

const ev = (sequence, type, payload = {}) => ({ runId: 'RVIEW0001', sequence, at: `2026-11-23T00:00:0${sequence}Z`, type, payload });

test('run view pairs model/tool events and accumulates verified usage', () => {
  const view = createRunView();
  applyRuntimeEvents(view, [
    ev(1, 'run.started', { projectRoot: 'C:/fixture', worker: 'sol6-2', model: 'gpt-6.2-sol' }),
    ev(2, 'model.requested', { step: 1, previousResponseId: null }),
    ev(3, 'model.accepted', { step: 1, responseId: 'resp_1', status: 'completed' }),
    ev(4, 'model.completed', { step: 1, responseId: 'resp_1', status: 'completed', text: '', usage: { input: 100, cached: 20, output: 30, total: 130 }, estimatedUsd: 0.001 }),
    ev(5, 'tool.requested', { step: 1, callId: 'c1', name: 'read_file', args: { path: 'src/a.mjs' } }),
    ev(6, 'tool.completed', { step: 1, callId: 'c1', name: 'read_file', result: { ok: true, content: 'x' } }),
    ev(7, 'model.requested', { step: 2, previousResponseId: 'resp_1' }),
    ev(8, 'model.completed', { step: 2, responseId: 'resp_2', status: 'completed', text: 'done', usage: { input: 50, cached: 0, output: 10, total: 60 }, estimatedUsd: 0.0005 }),
    ev(9, 'run.completed', { answer: 'done', steps: 2 }),
  ]);
  const out = publicRunView(view);
  assert.equal(out.status, 'completed');
  assert.equal(out.terminal, true);
  assert.equal(out.answer, 'done');
  assert.equal(out.steps.length, 2);
  assert.deepEqual(out.steps[0].tools, ['c1']);
  assert.equal(out.tools[0].status, 'completed');
  assert.deepEqual(out.usage, { input: 150, cached: 20, output: 40, total: 190, estimatedUsd: 0.0015, unknown: false, costUnknown: false });
});

test('run view is replay-safe and detects missing event ranges', () => {
  const view = createRunView();
  applyRuntimeEvent(view, ev(1, 'run.started'));
  applyRuntimeEvent(view, ev(1, 'run.started', { model: 'should-not-replay' }));
  applyRuntimeEvent(view, ev(3, 'model.requested', { step: 1 }));
  assert.equal(view.timeline.length, 2);
  assert.equal(view.model, null);
  assert.equal(view.gapDetected, true);
  assert.deepEqual(view.gaps, [{ after: 1, before: 3 }]);
  assert.equal(view.lastSequence, 3);
});

test('steering state records receive/deliver lifecycle and hard interruption', () => {
  const view = createRunView();
  applyRuntimeEvents(view, [
    ev(1, 'run.started'),
    ev(2, 'run.steer_received', { controlId: 's1', hard: true, text: 're-read tests' }),
    ev(3, 'model.interrupted', { responseId: 'resp_1', reason: 'hard steering' }),
    ev(4, 'run.steer_delivered', { controlIds: ['s1'], step: 1, hard: true }),
  ]);
  const out = publicRunView(view);
  assert.equal(out.steering[0].hard, true);
  assert.equal(out.steering[0].deliveredSequence, 4);
  assert.deepEqual(out.pendingSteering, []);
  assert.equal(out.timeline.find(x => x.type === 'model.interrupted').label, 'Model response interrupted');
});

test('status overlay preserves event authority while supplying current process fields', () => {
  const view = createRunView();
  applyRuntimeEvents(view, [ev(1, 'run.started'), ev(2, 'model.requested', { step: 1 })]);
  applyRuntimeStatus(view, { runId: 'RVIEW0001', status: 'running', phase: 'model', step: 1, currentResponseId: 'resp_live', lastSequence: 5 });
  const out = publicRunView(view);
  assert.equal(out.currentResponseId, 'resp_live');
  assert.equal(out.highestSeenSequence, 5);
  assert.equal(out.lastSequence, 2, 'status must not falsely advance consumed event cursor');
  assert.equal(out.terminal, false);
});

test('tool failures and terminal failure reason remain visible to UI', () => {
  const view = createRunView();
  applyRuntimeEvents(view, [
    ev(1, 'run.started'),
    ev(2, 'tool.requested', { step: 1, callId: 'x', name: 'edit_file', args: { path: '../escape' } }),
    ev(3, 'tool.completed', { step: 1, callId: 'x', name: 'edit_file', result: { ok: false, error: 'Path escapes project root.' } }),
    ev(4, 'run.failed', { reason: 'Model could not recover.' }),
  ]);
  const out = publicRunView(view);
  assert.equal(out.tools[0].status, 'failed');
  assert.equal(out.tools[0].result.error, 'Path escapes project root.');
  assert.equal(out.status, 'failed');
  assert.equal(out.reason, 'Model could not recover.');
  assert.equal(out.terminal, true);
});
