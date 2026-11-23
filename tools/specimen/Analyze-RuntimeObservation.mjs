#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';

function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  if (rows.length < 1) return [];
  const headers = rows.shift();
  return rows.filter(r => r.some(x => x !== '')).map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])));
}

function norm(path) { return resolve(path).toLowerCase(); }
function q(text) { return String(text ?? '').replaceAll('|', '\\|'); }

const observationDir = resolve(process.argv[2] ?? '');
if (!observationDir || !existsSync(observationDir)) throw new Error('Usage: node analyze-runtime-observation.mjs OBSERVATION_DIR [MAP_JSON] [OUTPUT_DIR]');
const mapPath = process.argv[3] ? resolve(process.argv[3]) : null;
const outputDir = resolve(process.argv[4] ?? observationDir);
const processFile = join(observationDir, 'process-samples.csv');
const connectionFile = join(observationDir, 'connections.csv');
if (!existsSync(processFile) || !existsSync(connectionFile)) throw new Error('Observation directory must contain process-samples.csv and connections.csv.');

const procRows = parseCsv(readFileSync(processFile, 'utf8'));
const connRows = parseCsv(readFileSync(connectionFile, 'utf8'));
const processByPid = new Map();
for (const row of procRows) {
  const pid = Number(row.ProcessId);
  if (!Number.isInteger(pid)) continue;
  const prev = processByPid.get(pid) ?? { pid, parentPid: Number(row.ParentProcessId) || null, name: row.Name, executablePath: row.ExecutablePath, samples: 0, firstSeen: row.TimestampUtc, lastSeen: row.TimestampUtc };
  prev.samples++;
  if (row.TimestampUtc < prev.firstSeen) prev.firstSeen = row.TimestampUtc;
  if (row.TimestampUtc > prev.lastSeen) prev.lastSeen = row.TimestampUtc;
  processByPid.set(pid, prev);
}
const endpoints = new Map();
for (const row of connRows) {
  const pid = Number(row.OwningProcess);
  if (!Number.isInteger(pid)) continue;
  const key = `${pid}|${row.RemoteAddress}|${row.RemotePort}`;
  const prev = endpoints.get(key) ?? { pid, remoteAddress: row.RemoteAddress, remotePort: Number(row.RemotePort), localAddress: row.LocalAddress, localPort: Number(row.LocalPort), samples: 0, firstSeen: row.TimestampUtc, lastSeen: row.TimestampUtc };
  prev.samples++;
  if (row.TimestampUtc < prev.firstSeen) prev.firstSeen = row.TimestampUtc;
  if (row.TimestampUtc > prev.lastSeen) prev.lastSeen = row.TimestampUtc;
  endpoints.set(key, prev);
}

let map = null;
let candidateByFullPath = new Map();
if (mapPath && existsSync(mapPath)) {
  map = JSON.parse(readFileSync(mapPath, 'utf8'));
  for (const row of map.candidates ?? []) {
    const full = norm(join(row.root, ...String(row.relativePath).split('/')));
    candidateByFullPath.set(full, row);
  }
}

const processes = [...processByPid.values()].sort((a, b) => a.pid - b.pid).map(p => {
  const candidate = p.executablePath ? candidateByFullPath.get(norm(p.executablePath)) ?? null : null;
  const conns = [...endpoints.values()].filter(e => e.pid === p.pid);
  return { ...p, connectionCount: conns.length, endpoints: conns, specimenCandidate: candidate ? { score: candidate.score, relativePath: candidate.relativePath, categories: candidate.categories, hitCount: candidate.hitCount } : null };
});

const summary = {
  schemaVersion: 1,
  createdAtUtc: new Date().toISOString(),
  observationDir,
  mapPath,
  processCount: processes.length,
  uniqueEndpointCount: endpoints.size,
  processes,
  unmatchedConnections: [...endpoints.values()].filter(e => !processByPid.has(e.pid)),
  note: 'Endpoint IP/port ownership is evidence of a process connection, not proof of application-layer purpose. Candidate string matches are triage evidence, not ownership proof.'
};
writeFileSync(join(outputDir, 'runtime-summary.json'), JSON.stringify(summary, null, 2));

const lines = ['# CLcode specimen runtime correlation', '', `**Processes observed:** ${summary.processCount}`, `**Unique established remote endpoints:** ${summary.uniqueEndpointCount}`, ''];
lines.push('This correlates PR #3 process/TCP samples with SPECIMEN-MAP-001 candidate files when exact executable paths match. It does not infer network purpose from IP addresses.');
lines.push('', '## Process tree / endpoints', '', '| PID | PPID | Process | Candidate | Connections |', '| ---: | ---: | --- | --- | ---: |');
for (const p of processes) {
  const cand = p.specimenCandidate ? `${p.specimenCandidate.score}: ${p.specimenCandidate.categories.join(', ')}` : '';
  lines.push(`| ${p.pid} | ${p.parentPid ?? ''} | \`${q(p.executablePath || p.name)}\` | ${q(cand)} | ${p.connectionCount} |`);
}
lines.push('');
for (const p of processes.filter(x => x.connectionCount)) {
  lines.push(`## PID ${p.pid} — ${p.name || basename(p.executablePath || '')}`,'');
  if (p.specimenCandidate) lines.push(`Specimen-map candidate: **${p.specimenCandidate.score}** — ${p.specimenCandidate.categories.join(', ')} — \`${p.specimenCandidate.relativePath}\``, '');
  for (const e of p.endpoints) lines.push(`- ${e.remoteAddress}:${e.remotePort} — ${e.samples} samples — ${e.firstSeen} → ${e.lastSeen}`);
  lines.push('');
}
writeFileSync(join(outputDir, 'RUNTIME-REPORT.md'), `${lines.join('\n')}\n`);
process.stdout.write(`${join(outputDir, 'RUNTIME-REPORT.md')}\n`);
