import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

export function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'clcode-runtime-'));
  const project = join(root, 'fixture');
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/create-fixture.mjs', import.meta.url)), project], { stdio: 'pipe' });
  return { root, project };
}

export class ScriptedProvider {
  constructor() { this.i = 0; this.seen = []; }
  async settings(worker) { return { name: worker, model: 'mock-coder', tools: true, effort_policy: { default: 'medium' } }; }
  async create(args) {
    this.seen.push(args);
    const n = ++this.i;
    const id = `resp_mock_${n}`;
    const call = (call_id, name, a) => ({ call_id, name, args: a });
    if (n === 1) return { id, status: 'completed', text: '', calls: [call('c1','read_file',{path:'src/slug.mjs'}), call('c2','read_file',{path:'test/slug.test.mjs'})] };
    if (n === 2) return { id, status: 'completed', text: '', calls: [call('c3','edit_file',{path:'src/slug.mjs',old_text:"  return String(value).trim().toLowerCase();",new_text:"  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');"})] };
    if (n === 3) return { id, status: 'completed', text: '', calls: [call('c4','run_test',{})] };
    if (n === 4) return { id, status: 'completed', text: '', calls: [call('c5','git_local',{action:'diff'})] };
    if (n === 5) return { id, status: 'completed', text: '', calls: [call('c6','git_local',{action:'commit',message:'fix: normalize slugs'})] };
    return { id, status: 'completed', text: 'done', calls: [] };
  }
  async poll() { throw new Error('poll not expected'); }
  async cancel() { return { status: 'cancelled' }; }
}

export class PollingProvider {
  constructor({ completeAfter = 2 } = {}) { this.completeAfter = completeAfter; this.creates = []; this.polls = 0; this.cancels = []; }
  async settings(worker) { return { name: worker, model: 'mock-polling', tools: true, effort_policy: { default: 'medium' } }; }
  async create(args) { this.creates.push(args); return { id: `resp_poll_${this.creates.length}`, status: 'in_progress' }; }
  async poll({ id }) { this.polls++; return this.polls < this.completeAfter ? { id, status: 'in_progress' } : { id, status: 'completed', text: 'done', calls: [] }; }
  async cancel({ id }) { this.cancels.push(id); return { id, status: 'cancelled' }; }
}
