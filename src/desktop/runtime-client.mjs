import { spawn } from 'node:child_process';
import readline from 'node:readline';

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

  async request(method, params = {}, { timeoutMs = this.requestTimeoutMs } = {}) {
    if (typeof method !== 'string' || !method) throw new Error('method is required.');
    if (!this.child) this.start();
    if (!this.running) throw this.closedError ?? new RuntimeProtocolError('Runtime process is not running.', 'process_exit');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RuntimeProtocolError(`Runtime request ${method} timed out after ${timeoutMs}ms.`, 'timeout', { id, method }));
      }, timeoutMs);
      timer.unref?.();
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, 'utf8');
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new RuntimeProtocolError(`Could not write runtime request: ${error.message}`, 'write_error'));
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
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new RuntimeProtocolError(String(message.error.message ?? 'Runtime request failed.'), String(message.error.code ?? 'runtime_error'), message.error));
    } else {
      pending.resolve(message.result);
    }
  }

  #closeWith(error) {
    if (this.closedError) return;
    this.closedError = error;
    for (const { reject, timer } of this.pending.values()) {
      clearTimeout(timer);
      reject(error);
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
  }

  async spawnAndFollow(params, options = {}) {
    const admitted = await this.client.request('spawn', params);
    this.runId = admitted.runId;
    this.onStatus(admitted);
    return this.follow(admitted.runId, options);
  }

  async follow(runId, { signal } = {}) {
    this.runId = runId;
    while (true) {
      if (signal?.aborted) throw new RuntimeProtocolError('Run following aborted by client.', 'aborted');
      const events = await this.client.request('events', { runId, afterSequence: this.cursor });
      for (const event of events ?? []) {
        this.cursor = Math.max(this.cursor, Number(event.sequence ?? 0));
        this.onEvent(event);
      }
      const status = await this.client.request('status', { runId });
      if (!status) throw new RuntimeProtocolError(`Run ${runId} no longer exists.`, 'run_missing');
      this.onStatus(status);
      if (TERMINAL.has(status.status)) {
        // Terminal state can be persisted after our preceding event poll. Drain once
        // more so the UI never misses the final run.completed/failed/cancelled event.
        const finalEvents = await this.client.request('events', { runId, afterSequence: this.cursor });
        for (const event of finalEvents ?? []) {
          this.cursor = Math.max(this.cursor, Number(event.sequence ?? 0));
          this.onEvent(event);
        }
        return status;
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
