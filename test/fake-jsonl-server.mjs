import readline from 'node:readline';

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let statusPolls = 0;
let nextSequence = 1;
const allEvents = [];
const send = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const push = (type, payload = {}) => allEvents.push({ runId: 'RCLIENT001', sequence: nextSequence++, type, payload });
push('run.started');

rl.on('line', line => {
  const message = JSON.parse(line);
  const { id, method, params = {} } = message;
  const ok = result => send({ id, result });
  if (method === 'delay') return setTimeout(() => ok({ value: params.value }), Number(params.ms ?? 0));
  if (method === 'workers') return ok([{ name: 'mock', model: 'mock-coder', available: true }]);
  if (method === 'spawn') return ok({ runId: 'RCLIENT001', status: 'running', phase: 'admitted' });
  if (method === 'events') return ok(allEvents.filter(e => e.sequence > Number(params.afterSequence ?? 0)));
  if (method === 'status') {
    statusPolls++;
    if (statusPolls >= 2 && !allEvents.some(e => e.type === 'run.completed')) push('run.completed', { answer: 'done' });
    return ok({ runId: 'RCLIENT001', status: statusPolls >= 2 ? 'completed' : 'running', lastSequence: nextSequence - 1 });
  }
  if (method === 'steer') { push('run.steer_received', { text: params.text, hard: !!params.hard }); return ok({ id: 'ctrl-steer', type: 'steer' }); }
  if (method === 'cancel') { push('run.cancel_requested'); return ok({ id: 'ctrl-cancel', type: 'cancel' }); }
  send({ id, error: { code: 'runtime_error', message: `Unknown ${method}` } });
});
