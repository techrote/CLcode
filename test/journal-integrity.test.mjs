import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RunStore } from '../src/runtime/journal.mjs';

test('run store refuses duplicate durable run ids', () => {
  const root = mkdtempSync(join(tmpdir(), 'clcode-journal-'));
  try {
    const store = new RunStore(root);
    store.init({ runId: 'RDUPL0001', status: 'running', phase: 'admitted' });
    assert.throws(
      () => store.init({ runId: 'RDUPL0001', status: 'running', phase: 'admitted' }),
      /already exists/
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('run store fails closed on corrupt summaries and partial event writes', () => {
  const root = mkdtempSync(join(tmpdir(), 'clcode-journal-'));
  try {
    const store = new RunStore(root);
    store.init({ runId: 'RCORR0001', status: 'running', phase: 'admitted' });
    store.event('RCORR0001', 'run.started', {});
    appendFileSync(join(store.runDir('RCORR0001'), 'events.jsonl'), '{"runId":"RCORR0001"');
    assert.throws(() => store.readEvents('RCORR0001'), /partial record/);

    writeFileSync(store.summaryFile('RCORR0001'), '{not valid json');
    assert.throws(() => store.readSummary('RCORR0001'), /summary .* corrupt/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('controls are rejected after a run is terminal', () => {
  const root = mkdtempSync(join(tmpdir(), 'clcode-journal-'));
  try {
    const store = new RunStore(root);
    store.init({ runId: 'RTERMCTRL1', status: 'running', phase: 'admitted' });
    store.patchSummary('RTERMCTRL1', { status: 'completed', phase: 'completed' });
    assert.throws(
      () => store.enqueueControl('RTERMCTRL1', { type: 'cancel' }),
      /already terminal/
    );
  } finally { rmSync(root, { recursive: true, force: true }); }
});
