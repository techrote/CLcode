#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
const input=resolve(process.argv[2]??''); if(!input||!existsSync(input)) throw new Error('Usage: node Summarize-AsarMap.mjs PATH_TO_asar-map.json [OUTPUT.md]');
const map=JSON.parse(readFileSync(input,'utf8')); const output=resolve(process.argv[3]??join(dirname(input),'ASAR-REPORT.md')); const lines=[];
lines.push('# CLcode ASAR internal surface map','',`**Created:** ${map.createdAtUtc}`,`**Archives:** ${map.archiveCount}; members: ${map.totalMembers}; scanned: ${map.scannedMembers}; skipped: ${map.skippedMembers}; candidates: ${map.candidateMembers}.`,'','This is **candidate evidence**, not proof that an internal module owns a behavior. Member paths are ranked for bounded follow-up experiments.','');
lines.push('## Archives',''); for(const a of map.archives??[]) lines.push(`- \`${a.archiveRelativePath}\` — ${a.memberCount} members; ${a.integrityMembers} with member integrity; ${a.unpackedMembers} unpacked; SHA-256 \`${a.sha256}\`.`); lines.push('');
lines.push('## Category counts',''); for(const [c,n] of Object.entries(map.categoryCounts??{})) lines.push(`- **${c}:** ${n}`); lines.push('','## Highest-priority internal candidates','','| Score | ASAR member | Categories | Patterns | Hits |','| ---: | --- | --- | ---: | ---: |');
for(const r of (map.candidates??[]).slice(0,50)) lines.push(`| ${r.score} | \`${String(r.virtualPath).replaceAll('|','\\|')}\` | ${(r.categories??[]).join(', ')} | ${(r.distinctPatterns??[]).length} | ${r.hitCount} |`);
lines.push('','## Caution before surgery','','Electron can enforce ASAR integrity at startup. A useful internal string match does not imply that directly editing `app.asar` is a viable first patch. Verify the installed specimen\'s integrity behavior and prefer the narrowest reversible seam supported by static + launch/runtime evidence.','');
writeFileSync(output,`${lines.join('\n')}\n`); process.stdout.write(`${output}\n`);
