import { newRunId } from './journal.mjs';

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
    if (this.tasks.has(runId) || this.controller.status(runId)) throw new Error('Run ' + runId + ' already exists.');
    let admit;
    const admitted = new Promise(resolve => { admit = resolve; });
    const record = { task: null, admitted: false };
    this.tasks.set(runId, record);
    // Only this specific controller's post-persistence acknowledgement can
    // establish ownership. Another process may win the same run ID.
    const task = Promise.resolve().then(() => this.controller.spawn({
      ...params, runId,
      onAdmitted: summary => {
        record.admitted = true;
        admit({ ...summary, ownership: 'local' });
      },
    }));
    record.task = task;
    task.finally(() => {
      if (this.tasks.get(runId) === record) this.tasks.delete(runId);
    }).catch(() => {});
    return Promise.race([admitted, task.then(value => this.#observed(value))]);
  }

  #observed(summary) {
    if (!summary) return summary;
    const ownership = summary.status === 'running'
      ? (this.tasks.get(String(summary.runId).toUpperCase())?.admitted ? 'local' : 'unverified')
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
    const record = this.tasks.get(String(runId).toUpperCase());
    if (record) return record.task;
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
      default: throw new Error('Unknown runtime method ' + String(method).slice(0, 80) + '.');
    }
  }
}
