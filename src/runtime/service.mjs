import { newRunId } from './journal.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export class RuntimeService {
  constructor({ controller, provider } = {}) {
    if (!controller) throw new Error('controller is required.');
    if (!provider) throw new Error('provider is required.');
    this.controller = controller;
    this.provider = provider;
    this.tasks = new Map();
  }

  async start(params = {}) {
    const runId = String(params.runId ?? newRunId()).toUpperCase();
    if (!/^R[0-9A-Z]{8,24}$/.test(runId)) throw new Error('Invalid run id.');
    if (this.tasks.has(runId) || this.controller.status(runId)) throw new Error(`Run ${runId} already exists.`);
    const task = this.controller.spawn({ ...params, runId });
    this.tasks.set(runId, task);
    task.finally(() => this.tasks.delete(runId)).catch(() => {});

    // Never report a failed spawn while controller.spawn is still capable of
    // admitting the same run later. Admission work may include slow local Git
    // and provider-module initialization on Windows. Wait until either a durable
    // summary exists or the task itself resolves/rejects.
    while (true) {
      const summary = this.status(runId);
      if (summary) return summary;
      const outcome = await Promise.race([
        task.then(value => ({ done: true, value }), error => ({ done: true, error })),
        sleep(10).then(() => ({ done: false })),
      ]);
      if (outcome.done) {
        if (outcome.error) throw outcome.error;
        return outcome.value;
      }
    }
  }

  #observed(summary) {
    if (!summary) return summary;
    const ownership = summary.status === 'running'
      ? (this.tasks.has(String(summary.runId).toUpperCase()) ? 'local' : 'unverified')
      : 'terminal';
    return { ...summary, ownership };
  }

  status(runId) { return this.#observed(this.controller.status(runId)); }
  list() { return this.controller.list().map(summary => this.#observed(summary)); }

  #requireOwned(runId) {
    const status = this.status(runId);
    if (status?.status === 'running' && status.ownership !== 'local') throw new Error('Run ownership is unverified; inspect the original controller/provider before sending controls.');
  }

  async wait(runId) {
    const task = this.tasks.get(String(runId).toUpperCase());
    if (task) return task;
    return this.status(runId);
  }

  async invoke(method, params = {}) {
    switch (method) {
      case 'workers': return this.provider.listWorkers();
      case 'spawn': return this.start(params);
      case 'status': return this.status(params.runId);
      case 'events': return this.controller.events(params.runId, Number(params.afterSequence ?? 0));
      case 'steer': this.#requireOwned(params.runId); return this.controller.steer(params.runId, params.text, { hard: Boolean(params.hard) });
      case 'cancel': this.#requireOwned(params.runId); return this.controller.cancel(params.runId);
      case 'list': return this.list();
      default: throw new Error(`Unknown runtime method ${String(method).slice(0, 80)}.`);
    }
  }
}
