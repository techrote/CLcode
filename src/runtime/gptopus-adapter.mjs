import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

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

  async load() {
    if (this.loaded) return this.loaded;
    if (this.expectedSha) {
      let actual;
      try { actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: this.root, encoding: 'utf8', windowsHide: true }).trim(); }
      catch { throw new Error('GPTopus checkout is not a readable Git worktree; cannot verify donor pin.'); }
      if (actual !== this.expectedSha) throw new Error(`GPTopus donor SHA mismatch: expected ${this.expectedSha}, got ${actual}.`);
      let dirty;
      try { dirty = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: this.root, encoding: 'utf8', windowsHide: true }).trim(); }
      catch { throw new Error('GPTopus checkout status is unreadable; cannot verify donor source integrity.'); }
      if (dirty) throw new Error('GPTopus donor working tree is not clean; refusing to load source that differs from the pinned commit.');
    }
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
    const fail = error => {
      const wrapped = error instanceof Error ? error : new Error(String(error));
      // A paged value exists only after GPTopus has an accepted response identity.
      // Losing the in-memory page cache or receiving incomplete pages must never
      // erase that identity or be reclassified as a pre-send/local failure.
      wrapped.responseId ??= value.id ?? null;
      wrapped.usageDisposition ??= 'ambiguous';
      wrapped.providerExecutionUnknown = true;
      return wrapped;
    };
    try {
      if (value.pages > 256 || value.length > 4_000_000) throw new Error('GPTopus response exceeds CLcode paging bound.');
      const { dispatch } = await this.load();
      let joined = '';
      for (let page = 0; page < value.pages; page++) {
        joined += (await dispatch('page', { id: value.id, page }, { env: this.env })).chunk;
      }
      if (joined.length !== value.length) throw new Error('GPTopus paged response was incomplete.');
      return JSON.parse(joined);
    } catch (error) {
      throw fail(error);
    }
  }

  async create({ worker, input, instructions, tools, effort, previousResponseId, agentId }) {
    const { dispatch } = await this.load();
    const settings = await this.settings(worker);
    if (settings.tools === false && tools.length) throw new Error(`${worker} does not support tools.`);
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
