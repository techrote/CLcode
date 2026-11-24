import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const SAFE_RUN = /^R[0-9A-Z]{8,24}$/;
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'incomplete', 'step_limit', 'time_limit', 'interrupted']);
const now = () => new Date().toISOString();
const safeRun = id => {
  const value = String(id ?? '').toUpperCase();
  if (!SAFE_RUN.test(value)) throw new Error('Invalid run id.');
  return value;
};

export function newRunId() {
  return `R${Date.now().toString(36).toUpperCase()}${randomBytes(4).toString('hex').toUpperCase()}`;
}

export class RunStore {
  constructor(stateDir) {
    if (!stateDir) throw new Error('stateDir is required.');
    this.stateDir = stateDir;
    this.runsDir = join(stateDir, 'runs');
    mkdirSync(this.runsDir, { recursive: true });
  }

  runDir(runId) {
    return join(this.runsDir, safeRun(runId));
  }

  init(summary) {
    const dir = this.runDir(summary.runId);
    try {
      mkdirSync(dir);
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error(`Run ${safeRun(summary.runId)} already exists.`);
      throw error;
    }
    mkdirSync(join(dir, 'control'));
    const initial = { ...summary, runId: safeRun(summary.runId), createdAt: summary.createdAt ?? now(), updatedAt: now(), lastSequence: 0 };
    this.writeSummary(initial);
    return initial;
  }

  event(runId, type, payload = {}, summaryPatch = {}) {
    const dir = this.runDir(runId);
    const summary = this.readSummary(runId);
    if (!summary) throw new Error(`Unknown run ${runId}.`);
    const prior = this.readEvents(runId, 0);
    if (TERMINAL.has(prior.at(-1)?.type?.replace(/^run\./, ''))) throw new Error('Cannot append after final run event.');
    if (TERMINAL.has(summary.status) && type !== `run.${summary.status}`) throw new Error('Cannot append to a terminal run.');
    const sequence = Number(prior.at(-1)?.sequence ?? 0) + 1;
    const event = { runId: safeRun(runId), sequence, at: now(), type, payload };
    appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    this.patchSummary(runId, { ...summaryPatch, lastSequence: sequence });
    return event;
  }

  finish(runId, status, patch = {}) {
    if (!TERMINAL.has(status)) throw new Error('Invalid terminal status.');
    const finishedAt = now();
    this.event(runId, `run.${status}`, { ...patch, finishedAt }, { ...patch, status, phase: status, finishedAt });
    return this.readSummary(runId);
  }

  readEvents(runId, afterSequence = 0) {
    const id = safeRun(runId);
    const file = join(this.runDir(id), 'events.jsonl');
    const summary = this.readSummary(id);
    if (!Number.isInteger(afterSequence) || afterSequence < 0) throw new Error('Invalid event cursor.');
    const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
    if (!raw) {
      if (summary?.lastSequence > 0) throw new Error(`Event history for ${id} has been truncated.`);
      return [];
    }
    if (!raw.endsWith('\n')) throw new Error(`Event journal for ${id} ends with a partial record.`);
    const lines = raw.split('\n').slice(0, -1);
    const events = [];
    for (let i = 0; i < lines.length; i++) {
      let event;
      try { event = JSON.parse(lines[i]); }
      catch { throw new Error(`Event journal for ${id} is corrupt at line ${i + 1}.`); }
      if (event?.runId !== id) throw new Error(`Event journal for ${id} contains a mismatched run id at line ${i + 1}.`);
      if (!Number.isInteger(event?.sequence) || event.sequence !== i + 1) {
        throw new Error(`Event journal for ${id} has a missing or duplicate sequence at line ${i + 1}.`);
      }
      if (events.length && TERMINAL.has(events.at(-1)?.type?.replace(/^run\./, ''))) throw new Error(`Event journal for ${id} contains events after its terminal event.`);
      events.push(event);
    }
    if (summary && summary.lastSequence > events.length) throw new Error(`Event history for ${id} has been truncated below its durable sequence.`);
    return events.filter(e => e.sequence > afterSequence);
  }

  summaryFile(runId) { return join(this.runDir(runId), 'summary.json'); }

  readSummary(runId) {
    const id = safeRun(runId);
    const file = this.summaryFile(id);
    if (!existsSync(file)) return null;
    let summary;
    try { summary = JSON.parse(readFileSync(file, 'utf8')); }
    catch { throw new Error(`Run summary for ${id} is corrupt.`); }
    if (summary?.runId !== id) throw new Error(`Run summary for ${id} contains a mismatched run id.`);
    if (!Number.isInteger(summary.lastSequence) || summary.lastSequence < 0) throw new Error(`Run summary for ${id} has an invalid sequence.`);
    return summary;
  }

  writeSummary(summary) {
    const file = this.summaryFile(summary.runId);
    mkdirSync(this.runDir(summary.runId), { recursive: true });
    const tmp = `${file}.${process.pid}.${randomBytes(3).toString('hex')}.tmp`;
    writeFileSync(tmp, JSON.stringify({ ...summary, updatedAt: now() }, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, file);
  }

  patchSummary(runId, patch) {
    const current = this.readSummary(runId);
    if (!current) throw new Error(`Unknown run ${runId}.`);
    const next = { ...current, ...patch, runId: current.runId, updatedAt: now() };
    this.writeSummary(next);
    return next;
  }

  list() {
    let names = [];
    try { names = readdirSync(this.runsDir); } catch { return []; }
    return names.map(id => this.readSummary(id)).filter(Boolean).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  enqueueControl(runId, control) {
    const id = safeRun(runId);
    const summary = this.readSummary(id);
    if (!summary) throw new Error(`Unknown run ${id}.`);
    if (TERMINAL.has(summary.status)) throw new Error(`Run ${id} is already terminal (${summary.status}); control was not accepted.`);
    const dir = join(this.runDir(id), 'control');
    mkdirSync(dir, { recursive: true });
    const rec = {
      id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
      at: now(),
      ...control, delivery: 'queued',
    };
    const file = join(dir, `${rec.id}.json`), tmp = `${file}.tmp`;
    let created = false;
    try {
      writeFileSync(tmp, JSON.stringify(rec), { encoding: 'utf8', mode: 0o600, flag: 'wx' }); created = true;
      renameSync(tmp, file);
    } finally { if (created) rmSync(tmp, { force: true }); }
    return rec;
  }

  takeControls(runId) {
    const dir = join(this.runDir(runId), 'control');
    let names = [];
    try { names = readdirSync(dir).filter(x => x.endsWith('.json')).sort(); } catch { return []; }
    const out = [];
    for (const name of names) {
      const file = join(dir, name);
      const done = `${file}.taken`;
      if (existsSync(done)) throw new Error('Duplicate claimed control; reconciliation required.');
      try { renameSync(file, done); }
      catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
      let rec;
      try { rec = JSON.parse(readFileSync(done, 'utf8')); }
      catch { throw new Error('Claimed control is corrupt; reconciliation required.'); }
      if (!['cancel','steer'].includes(rec?.type) || `${rec.id}.json` !== name) throw new Error('Claimed control identity is invalid.');
      out.push(rec);
    }
    return out;
  }
}
