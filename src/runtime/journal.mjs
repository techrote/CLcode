import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const SAFE_RUN = /^R[0-9A-Z]{8,24}$/;
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
    mkdirSync(join(dir, 'control'), { recursive: true });
    const initial = { ...summary, createdAt: summary.createdAt ?? now(), updatedAt: now(), lastSequence: 0 };
    this.writeSummary(initial);
    return initial;
  }

  event(runId, type, payload = {}) {
    const dir = this.runDir(runId);
    mkdirSync(dir, { recursive: true });
    const summary = this.readSummary(runId);
    const sequence = Number(summary?.lastSequence ?? 0) + 1;
    const event = { runId: safeRun(runId), sequence, at: now(), type, payload };
    appendFileSync(join(dir, 'events.jsonl'), `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    this.patchSummary(runId, { lastSequence: sequence });
    return event;
  }

  readEvents(runId, afterSequence = 0) {
    const file = join(this.runDir(runId), 'events.jsonl');
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)).filter(e => e.sequence > afterSequence);
  }

  summaryFile(runId) { return join(this.runDir(runId), 'summary.json'); }

  readSummary(runId) {
    try { return JSON.parse(readFileSync(this.summaryFile(runId), 'utf8')); }
    catch { return null; }
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
    const dir = join(this.runDir(runId), 'control');
    if (!existsSync(this.summaryFile(runId))) throw new Error(`Unknown run ${runId}.`);
    mkdirSync(dir, { recursive: true });
    const rec = {
      id: `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`,
      at: now(),
      ...control,
    };
    const file = join(dir, `${rec.id}.json`);
    writeFileSync(file, JSON.stringify(rec), { encoding: 'utf8', mode: 0o600 });
    return rec;
  }

  takeControls(runId) {
    const dir = join(this.runDir(runId), 'control');
    let names = [];
    try { names = readdirSync(dir).filter(x => x.endsWith('.json')).sort(); } catch { return []; }
    const out = [];
    for (const name of names) {
      const file = join(dir, name);
      try {
        out.push(JSON.parse(readFileSync(file, 'utf8')));
        // rename out of inbox before unlink-equivalent deletion to avoid repeat after crash
        const done = `${file}.taken`;
        renameSync(file, done);
      } catch {}
    }
    return out;
  }
}
