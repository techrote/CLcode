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
    const runId = params.runId ?? newRunId();
    if (this.tasks.has(runId) || this.controller.status(runId)) throw new Error(`Run ${runId} already exists.`);
    const task = this.controller.spawn({ ...params, runId });
    this.tasks.set(runId, task);
    task.finally(() => this.tasks.delete(runId)).catch(() => {});

    // Never report a failed spawn while controller.spawn is still capable of
    // admitting the same run later. Admission work may include slow local Git
    // and provider-module initialization on Windows. Wait until either a durable
    // summary exists or the task itself resolves/rejects.
    while (true) {
      const summary = this.controller.status(runId);
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

  async wait(runId) {
    const task = this.tasks.get(runId);
    if (task) return task;
    return this.controller.status(runId);
  }

  async invoke(method, params = {}) {
    switch (method) {
      case 'workers': return this.provider.listWorkers();
      case 'spawn': return this.start(params);
      case 'status': return this.controller.status(params.runId);
      case 'events': return this.controller.events(params.runId, Number(params.afterSequence ?? 0));
      case 'steer': return this.controller.steer(params.runId, params.text, { hard: Boolean(params.hard) });
      case 'cancel': return this.controller.cancel(params.runId);
      case 'list': return this.controller.list();
      default: throw new Error(`Unknown runtime method ${String(method).slice(0, 80)}.`);
    }
  }
}
