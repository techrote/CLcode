import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { newRunId } from '../runtime/journal.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'incomplete', 'step_limit', 'time_limit', 'interrupted']);

export class RuntimeProtocolError extends Error {
  constructor(message, code = 'runtime_error', detail = null) {
    super(message);
    this.name = 'RuntimeProtocolError';
    this.code = code;
    this.detail = detail;
  }
}

export class RuntimeProcessClient {
  constructor({ command = process.execPath, args = [], cwd, env = process.env, requestTimeoutMs = 15_000, onStderr = () => {} } = {}) {
    this.command = command;
    this.args = [...args];
    this.cwd = cwd;
    this.env = { ...env };
    this.requestTimeoutMs = requestTimeoutMs;
    this.onStderr = onStderr;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.closedError = null;
  }

  start() {
    if (this.child) return this;
    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      env: this.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    this.child = child;
    const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
    lines.on('line', line => this.#handleLine(line));
    child.stdin.on('error', error => this.#closeWith(new RuntimeProtocolError(`Runtime request stream failed: ${error.message}`, 'write_error')));
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => this.onStderr(String(chunk)));
    child.once('error', error => this.#closeWith(new RuntimeProtocolError(`Runtime process failed to start: ${error.message}`, 'process_error')));
    child.once('exit', (code, signal) => {
      const suffix = signal ? `signal ${signal}` : `exit code ${code}`;
      this.#closeWith(new RuntimeProtocolError(`Runtime process exited (${suffix}).`, 'process_exit', { code, signal }));
    });
    return this;
  }

  get running() { return Boolean(this.child && this.child.exitCode === null && !this.closedError); }

  async request(method, params = {}, { timeoutMs } = {}) {
    if (typeof method !== 'string' || !method) throw new Error('method is required.');
    if (!this.child) this.start();
    if (!this.running) throw this.closedError ?? new RuntimeProtocolError('Runtime process is not running.', 'process_exit');
    const id = this.nextId++;
    if (method === 'spawn' && timeoutMs !== undefined && timeoutMs !== null) {
      throw new Error('spawn requests cannot use a client-side timeout; admission must resolve or fail authoritatively.');
    }
    const runId = method === 'spawn' ? String(params.runId ?? newRunId()).toUpperCase() : null;
    if (runId && !/^R[0-9A-Z]{8,24}$/.test(runId)) throw new Error('Invalid run id.');
    if (runId) params = { ...params, runId };
    const effectiveTimeoutMs = method === 'spawn' ? null : (timeoutMs === undefined ? this.requestTimeoutMs : timeoutMs);
    if (effectiveTimeoutMs !== null && (!Number.isFinite(Number(effectiveTimeoutMs)) || Number(effectiveTimeoutMs) <= 0)) {
      throw new Error('timeoutMs must be a positive number or null.');
    }
    return new Promise((resolve, reject) => {
      const timer = effectiveTimeoutMs === null ? null : setTimeout(() => {
        this.pending.delete(id);
        reject(new RuntimeProtocolError(`Runtime request ${method} timed out after ${effectiveTimeoutMs}ms.`, 'timeout', { id, method }));
      }, Number(effectiveTimeoutMs));
      timer?.unref?.();
      this.pending.set(id, { resolve, reject, timer, method, runId });
      try {
        this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, 'utf8');
      } catch (error) {
        if (timer) clearTimeout(timer);
        this.pending.delete(id);
        reject(runId ? new RuntimeProtocolError('Spawn transmission could not be confirmed; reconcile by run ID.', 'admission_unknown', { runId, cause: 'write_error' }) : new RuntimeProtocolError(`Could not write runtime request: ${error.message}`, 'write_error'));
      }
    });
  }

  async close({ graceMs = 1500 } = {}) {
    const child = this.child;
    if (!child) return;
    if (child.exitCode !== null) return;
    try { child.stdin.end(); } catch {}
    const exited = await Promise.race([
      new Promise(resolve => child.once('exit', () => resolve(true))),
      sleep(graceMs).then(() => false),
    ]);
    if (!exited && child.exitCode === null) {
      try { child.kill(); } catch {}
    }
  }

  #handleLine(line) {
    let message;
    try { message = JSON.parse(line); }
    catch {
      this.#closeWith(new RuntimeProtocolError('Runtime emitted non-JSON stdout; protocol stream is corrupted.', 'invalid_json', { line: line.slice(0, 300) }));
      try { this.child?.kill(); } catch {}
      return;
    }
    const pending = this.pending.get(message?.id);
    if (!pending) return;
    if (pending.timer) clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new RuntimeProtocolError(String(message.error.message ?? 'Runtime request failed.'), String(message.error.code ?? 'runtime_error'), { ...message.error, ...(pending.runId && { runId: pending.runId }) }));
    } else if (pending.runId && message.result?.runId !== pending.runId) {
      pending.reject(new RuntimeProtocolError('Spawn acknowledgement has a different or absent run ID; reconcile by requested ID.', 'admission_unknown', { runId: pending.runId, observedRunId: message.result?.runId ?? null }));
    } else {
      pending.resolve(message.result);
    }
  }

  #closeWith(error) {
    if (this.closedError) return;
    this.closedError = error;
    for (const { reject, timer, runId } of this.pending.values()) {
      if (timer) clearTimeout(timer);
      reject(runId ? new RuntimeProtocolError('Spawn acknowledgement was lost; reconcile by run ID before retrying.', 'admission_unknown', { runId, cause: error.code }) : error);
    }
    this.pending.clear();
  }
}

export class RunFollower {
  constructor(client, { pollMs = 150, onEvent = () => {}, onStatus = () => {} } = {}) {
    this.client = client;
    this.pollMs = pollMs;
    this.onEvent = onEvent;
    this.onStatus = onStatus;
    this.runId = null;
    this.cursor = 0;
    this.terminalEventStatus = null;
    this.terminalEventSequence = 0;
    this.following = false;
  }

  #reset(runId) {
    this.runId = runId;
    this.cursor = 0;
    this.terminalEventStatus = null;
    this.terminalEventSequence = 0;
  }

  #consume(runId, events) {
    for (const event of events ?? []) {
      const sequence = Number(event?.sequence);
      const expected = this.cursor + 1;
      if (!Number.isInteger(sequence) || sequence !== expected) {
        throw new RuntimeProtocolError(
          `Runtime event history for ${runId} is not contiguous: expected sequence ${expected}, received ${String(event?.sequence)}.`,
          'event_gap',
          { runId, expected, received: event?.sequence ?? null }
        );
      }
      if (event?.runId !== runId) {
        throw new RuntimeProtocolError(`Runtime event for ${event.runId} was delivered while following ${runId}.`, 'event_run_mismatch', { runId, eventRunId: event.runId, sequence });
      }
      this.cursor = sequence;
      if (typeof event?.type === 'string' && event.type.startsWith('run.')) {
        const state = event.type.slice(4);
        if (TERMINAL.has(state)) {
          this.terminalEventStatus = state;
          this.terminalEventSequence = sequence;
        }
      }
      this.onEvent(event);
    }
  }

  async spawnAndFollow(params, options = {}) {
    if (this.following) throw new RuntimeProtocolError('This follower already owns a follow operation.', 'follower_busy');
    this.following = true;
    try {
      const admitted = await this.client.request('spawn', params);
      if (this.runId !== admitted.runId) this.#reset(admitted.runId);
      this.runId = admitted.runId;
      this.onStatus(admitted);
      return await this.#follow(admitted.runId, options);
    } finally { this.following = false; }
  }

  async follow(runId, options = {}) {
    if (this.following) throw new RuntimeProtocolError('This follower already owns a follow operation.', 'follower_busy');
    this.following = true;
    try { return await this.#follow(String(runId).toUpperCase(), options); }
    finally { this.following = false; }
  }

  async #follow(runId, { signal } = {}) {
    if (this.runId !== runId) this.#reset(runId);
    this.runId = runId;
    while (true) {
      if (signal?.aborted) throw new RuntimeProtocolError('Run following aborted by client.', 'aborted');
      const events = await this.client.request('events', { runId, afterSequence: this.cursor });
      this.#consume(runId, events);
      let status = await this.client.request('status', { runId });
      if (!status) throw new RuntimeProtocolError(`Run ${runId} no longer exists.`, 'run_missing');
      if (status.runId !== runId) throw new RuntimeProtocolError('Runtime status identity differs from followed run.', 'status_run_mismatch', { runId, observedRunId: status.runId ?? null });
      if (!TERMINAL.has(status.status)) this.onStatus(status);
      if (status.status === 'running' && status.ownership === 'unverified') throw new RuntimeProtocolError('Persisted run state does not establish controller liveness; reconcile before retrying.', 'run_ownership_unverified', { runId });
      if (TERMINAL.has(status.status)) {
        // A terminal summary may become visible a few milliseconds before its
        // final event append. Drain and re-read status a bounded number of times,
        // then fail closed rather than telling the UI that incomplete history is complete.
        for (let attempt = 0; attempt < 4; attempt++) {
          const finalEvents = await this.client.request('events', { runId, afterSequence: this.cursor });
          this.#consume(runId, finalEvents);
          status = await this.client.request('status', { runId });
          if (!status) throw new RuntimeProtocolError(`Run ${runId} no longer exists.`, 'run_missing');
          if (status.runId !== runId) throw new RuntimeProtocolError('Runtime status identity differs from followed run.', 'status_run_mismatch', { runId, observedRunId: status.runId ?? null });
          const lastSequence = Number(status.lastSequence);
          const complete = Number.isInteger(lastSequence) && lastSequence === this.cursor &&
            this.terminalEventStatus === status.status && this.terminalEventSequence === this.cursor;
          if (complete) {
            this.onStatus(status);
            return status;
          }
          if (attempt < 3) await sleep(this.pollMs);
        }
        throw new RuntimeProtocolError(
          `Terminal run ${runId} does not have a complete matching terminal event history.`,
          'terminal_history_incomplete',
          {
            runId,
            status: status.status,
            statusLastSequence: status.lastSequence ?? null,
            cursor: this.cursor,
            terminalEventStatus: this.terminalEventStatus,
            terminalEventSequence: this.terminalEventSequence,
          }
        );
      }
      await sleep(this.pollMs);
    }
  }

  steer(text, { hard = false } = {}) {
    if (!this.runId) throw new Error('No run is being followed.');
    return this.client.request('steer', { runId: this.runId, text, hard });
  }

  cancel() {
    if (!this.runId) throw new Error('No run is being followed.');
    return this.client.request('cancel', { runId: this.runId });
  }
}
