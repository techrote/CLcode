#!/usr/bin/env node
import readline from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GPTopusAdapter, GPTOPUS_PINNED_SHA } from './runtime/gptopus-adapter.mjs';
import { RunController } from './runtime/controller.mjs';
import { RuntimeService } from './runtime/service.mjs';

function parse(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument ${key}.`);
    const value = argv[++i];
    if (value === undefined) throw new Error(`Missing value for ${key}.`);
    opts[key.slice(2)] = value;
  }
  return opts;
}

function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }

export async function serve({ input = process.stdin, output = send, service } = {}) {
  if (!service) throw new Error('service is required.');
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); }
    catch { output({ id: null, error: { code: 'invalid_json', message: 'Request must be one JSON object per line.' } }); continue; }
    const id = message?.id ?? null;
    try {
      if (!message || typeof message.method !== 'string') throw new Error('method is required.');
      const result = await service.invoke(message.method, message.params ?? {});
      output({ id, result });
    } catch (error) {
      output({ id, error: { code: 'runtime_error', message: String(error?.message ?? error).slice(0, 1200) } });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const opts = parse(process.argv.slice(2));
  if (!opts.gptopus) throw new Error('--gptopus PATH is required.');
  const stateDir = resolve(opts.state ?? '.clcode-state');
  const provider = new GPTopusAdapter({ root: opts.gptopus, stateDir });
  const controller = new RunController({ stateDir, provider });
  const service = new RuntimeService({ controller, provider });
  process.stderr.write(`CLcode hostless runtime service; GPTopus pin ${GPTOPUS_PINNED_SHA}; state ${stateDir}\n`);
  await serve({ service });
}
