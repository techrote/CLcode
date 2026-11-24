#!/usr/bin/env node
import { resolve } from 'node:path';
import { GPTopusAdapter, GPTOPUS_PINNED_SHA } from './runtime/gptopus-adapter.mjs';
import { RunController } from './runtime/controller.mjs';

function parse(argv) {
  const [command, ...rest] = argv;
  const opts = { _: [] };
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i];
    if (!item.startsWith('--')) { opts._.push(item); continue; }
    const key = item.slice(2);
    if (['hard'].includes(key)) { opts[key] = true; continue; }
    const value = rest[++i];
    if (value === undefined) throw new Error(`Missing value for --${key}.`);
    opts[key] = value;
  }
  return { command, opts };
}

function usage() {
  return `CLcode hostless runtime\n\n` +
    `run --gptopus PATH --project PATH --worker NAME --task TEXT [--state PATH] [--effort high] [--max-steps 16] [--max-minutes 30]\n` +
    `workers --gptopus PATH [--state PATH]\n` +
    `status RUN_ID [--state PATH]\n` +
    `events RUN_ID [--state PATH] [--after N]\n` +
    `steer RUN_ID TEXT [--state PATH] [--hard]\n` +
    `cancel RUN_ID [--state PATH]\n` +
    `list [--state PATH]\n\nPinned GPTopus donor: ${GPTOPUS_PINNED_SHA}`;
}

const { command, opts } = parse(process.argv.slice(2));
if (!command || command === 'help' || command === '--help') { console.log(usage()); process.exit(0); }
const stateDir = resolve(opts.state ?? '.clcode-state');

if (command === 'run' || command === 'workers') {
  if (!opts.gptopus) throw new Error('--gptopus PATH is required.');
  const provider = new GPTopusAdapter({ root: opts.gptopus, stateDir });
  if (command === 'workers') {
    console.log(JSON.stringify(await provider.listWorkers(), null, 2));
    process.exit(0);
  }
  for (const name of ['project', 'worker', 'task']) if (!opts[name]) throw new Error(`--${name} is required.`);
  const controller = new RunController({ stateDir, provider });
  const summary = await controller.spawn({
    projectRoot: opts.project, worker: opts.worker, task: opts.task, effort: opts.effort,
    maxSteps: Number(opts['max-steps'] ?? 16), maxMinutes: Number(opts['max-minutes'] ?? 30),
  });
  console.log(JSON.stringify(summary, null, 2));
  process.exit(summary.status === 'completed' ? 0 : 2);
}

// Control/status commands do not need to load a provider; they only manipulate/read durable state.
const inertProvider = { settings: async () => { throw new Error('Provider not available in control-only command.'); } };
const controller = new RunController({ stateDir, provider: inertProvider });
if (command === 'status') {
  if (!opts._[0]) throw new Error('status requires RUN_ID.');
  console.log(JSON.stringify(controller.status(opts._[0]), null, 2));
} else if (command === 'events') {
  if (!opts._[0]) throw new Error('events requires RUN_ID.');
  console.log(JSON.stringify(controller.events(opts._[0], Number(opts.after ?? 0)), null, 2));
} else if (command === 'steer') {
  if (!opts._[0] || !opts._[1]) throw new Error('steer requires RUN_ID and TEXT.');
  console.log(JSON.stringify(controller.steer(opts._[0], opts._.slice(1).join(' '), { hard: Boolean(opts.hard) }), null, 2));
} else if (command === 'cancel') {
  if (!opts._[0]) throw new Error('cancel requires RUN_ID.');
  console.log(JSON.stringify(controller.cancel(opts._[0]), null, 2));
} else if (command === 'list') {
  console.log(JSON.stringify(controller.list(), null, 2));
} else {
  throw new Error(`Unknown command ${command}.\n\n${usage()}`);
}
