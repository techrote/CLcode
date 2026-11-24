import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { childEnv, resolveExecutable, assertNoExternalGitFilters } from './tools.mjs';

const EXPECTED_DONOR = '849627463c3e2be660f9d24976320b072c107b34';

export class GPTopusAdapter {
  constructor({ root, env = process.env, stateDir, expectedSha = EXPECTED_DONOR } = {}) {
    if (!root) throw new Error('GPTopus checkout root is required.');
    this.root = resolve(root);
    this.expectedSha = expectedSha;
    this.env = { ...env };
    if (stateDir) {
      this.env.OPENAI_WORKER_USAGE_DIR ??= join(resolve(stateDir), 'gptopus');
      this.env.OAI_CONFIG_STATE_DIR ??= join(resolve(stateDir), 'gptopus-ui');
    }
    this.loaded = null;
  }

  verifyDonor() {
    if (this.expectedSha) {
      // Local Git configuration is outside the pinned donor commit and may run
      // helpers such as core.fsmonitor. Integrity probes therefore use the same
      // credential-scrubbed environment as project tool subprocesses.
      const gitEnv = childEnv(this.env);
      const gitExecutable = resolveExecutable('git', gitEnv, { rejectRoot: this.root });
      let actual;
      try { actual = execFileSync(gitExecutable, ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'rev-parse', 'HEAD'], { cwd: this.root, encoding: 'utf8', windowsHide: true, env: gitEnv }).trim(); }
      catch { throw new Error('GPTopus checkout is not a readable Git worktree; cannot verify donor pin.'); }
      if (actual !== this.expectedSha) throw new Error(`GPTopus donor SHA mismatch: expected ${this.expectedSha}, got ${actual}.`);
      let indexFlags;
      try { indexFlags = execFileSync(gitExecutable, ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'ls-files', '-v', '-z'], { cwd: this.root, encoding: 'utf8', windowsHide: true, env: gitEnv }); }
      catch { throw new Error('GPTopus donor index is unreadable.'); }
      if (indexFlags.split('\0').some(entry => /^[a-zS] /.test(entry))) throw new Error('GPTopus donor index flags hide worktree changes; use a full clean checkout without assume-unchanged or skip-worktree.');
      assertNoExternalGitFilters(gitExecutable, this.root, gitEnv);
      let dirty;
      try { dirty = execFileSync(gitExecutable, ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=all'], { cwd: this.root, encoding: 'utf8', windowsHide: true, env: gitEnv }).trim(); }
      catch { throw new Error('GPTopus checkout status is unreadable; cannot verify donor source integrity.'); }
      if (dirty) throw new Error('GPTopus donor working tree is not clean; refusing to load source that differs from the pinned commit.');
    }
  }

  async load() {
    if (this.loaded) return this.loaded;
    this.verifyDonor();
    const bridge = join(this.root, 'plugins', 'openai-workers', 'bridge', 'server.mjs');
    const workers = join(this.root, 'plugins', 'openai-workers', 'bridge', 'workers.mjs');
    if (!existsSync(bridge) || !existsSync(workers)) {
      throw new Error('GPTopus checkout does not contain the expected pinned bridge files.');
    }
    const [{ dispatch }, workerModule] = await Promise.all([
      import(pathToFileURL(bridge).href), import(pathToFileURL(workers).href),
    ]);
    this.loaded = { dispatch, workerSettings: workerModule.workerSettings, WORKER_TYPES: workerModule.WORKER_TYPES };
    return this.loaded;
  }

  async listWorkers() {
    const { workerSettings, WORKER_TYPES } = await this.load();
    return Object.keys(WORKER_TYPES).map(name => {
      try { return { ...workerSettings(name, this.env), available: true }; }
      catch (error) { return { name, available: false, error: String(error?.message ?? error) }; }
    });
  }

  async settings(worker) {
    const { workerSettings } = await this.load();
    return workerSettings(worker, this.env);
  }

  async unpack(value) {
    if (!value?.paged) return value;
    try {
      if (!Number.isInteger(value.pages) || value.pages < 1 || value.pages > 256 || !Number.isInteger(value.length) || value.length < 1 || value.length > 4_000_000) throw new Error('GPTopus response exceeds CLcode paging bound or has invalid page metadata.');
      const { dispatch } = await this.load();
      let joined = '';
      for (let page = 0; page < value.pages; page++) {
        const chunk = (await dispatch('page', { id: value.id, page }, { env: this.env })).chunk;
        if (typeof chunk !== 'string' || joined.length + chunk.length > value.length) throw new Error('GPTopus page is invalid.');
        joined += chunk;
      }
      if (joined.length !== value.length) throw new Error('GPTopus paged response was incomplete.');
      const decoded = JSON.parse(joined);
      if (decoded?.id !== value.id || decoded?.status !== value.status) throw new Error('GPTopus paged response identity differs from its envelope.');
      return decoded;
    } catch (cause) {
      const error = new Error('GPTopus accepted response could not be reconstructed: ' + String(cause?.message ?? cause), { cause });
      error.responseId = value.id;
      error.usageDisposition = 'ambiguous';
      throw error;
    }
  }

  async create({ worker, input, instructions, tools, effort, previousResponseId, agentId, requestId }) {
    let dispatch, settings;
    try {
      if (this.loaded) this.verifyDonor();
      ({ dispatch } = await this.load());
      settings = await this.settings(worker);
      if (settings.tools === false && tools.length) throw new Error(`${worker} does not support tools.`);
    } catch (error) { error.usageDisposition = 'not_started'; throw error; }
    return this.unpack(await dispatch('create', {
      worker_type: settings.name,
      model: settings.model,
      input,
      instructions,
      tools,
      ...(effort && { effort }),
      ...(previousResponseId && { previous_response_id: previousResponseId }),
      ...(settings.service_tier && { service_tier: settings.service_tier }),
      agent_id: agentId,
      ...(requestId && { request_id: requestId }),
    }, { env: this.env }));
  }

  async poll({ worker, id }) {
    const { dispatch } = await this.load();
    return this.unpack(await dispatch('poll', { id, worker_type: worker, wait_ms: 0 }, { env: this.env }));
  }

  async cancel({ worker, id }) {
    const { dispatch } = await this.load();
    return dispatch('cancel', { id, worker_type: worker }, { env: this.env });
  }
}

export const GPTOPUS_PINNED_SHA = EXPECTED_DONOR;
