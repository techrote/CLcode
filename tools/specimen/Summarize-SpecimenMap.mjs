#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const input = resolve(process.argv[2] ?? '');
if (!input || !existsSync(input)) throw new Error('Usage: node summarize-specimen-map.mjs PATH_TO_map.json [OUTPUT.md]');
const map = JSON.parse(readFileSync(input, 'utf8'));
const output = resolve(process.argv[3] ?? join(dirname(input), 'REPORT.md'));
const lines = [];
lines.push('# CLcode specimen surface map');
lines.push('');
lines.push(`**Created:** ${map.createdAtUtc}`);
lines.push(`**Roots:** ${map.roots.map(x => `\`${x}\``).join(', ')}`);
lines.push(`**Files enumerated:** ${map.totalFiles}; scanned: ${map.scannedFiles}; skipped: ${map.skippedFiles}; candidates: ${map.candidateFiles}.`);
lines.push('');
lines.push('This is a **triage report**, not proof that a hit owns the corresponding behavior. Candidate files are ranked for bounded follow-up experiments.');
lines.push('');
lines.push('## Category counts');
lines.push('');
for (const [category, count] of Object.entries(map.categoryCounts ?? {})) lines.push(`- **${category}:** ${count}`);
lines.push('');
lines.push('## Highest-priority candidate files');
lines.push('');
lines.push('| Score | File | Categories | Distinct patterns | Hits |');
lines.push('| ---: | --- | --- | ---: | ---: |');
for (const row of (map.candidates ?? []).slice(0, 40)) {
  const path = String(row.relativePath).replaceAll('|', '\\|');
  lines.push(`| ${row.score} | \`${path}\` | ${(row.categories ?? []).join(', ')} | ${(row.distinctPatterns ?? []).length} | ${row.hitCount} |`);
}
lines.push('');
for (const category of Object.keys(map.categoryCounts ?? {})) {
  const rows = (map.candidates ?? []).filter(r => r.categories?.includes(category)).slice(0, 12);
  lines.push(`## ${category}`);
  lines.push('');
  if (!rows.length) { lines.push('_No candidates._'); lines.push(''); continue; }
  for (const row of rows) lines.push(`- **${row.score}** — \`${row.relativePath}\` — ${(row.distinctPatterns ?? []).join(', ')}`);
  lines.push('');
}
lines.push('## Recommended next experiment');
lines.push('');
lines.push('Choose the **smallest high-scoring file/process seam** that can answer one question about principal-model ownership, embedded-engine launch, auth/quota gating or Desktop↔engine IPC. Record an exact baseline and rollback path before modifying anything.');
lines.push('');
writeFileSync(output, `${lines.join('\n')}\n`);
process.stdout.write(`${output}\n`);
