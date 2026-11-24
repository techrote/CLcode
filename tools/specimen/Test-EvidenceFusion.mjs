#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const tmp=mkdtempSync(join(tmpdir(),'clcode-fusion-')), out=join(tmp,'out');
try{
  const surface={candidates:[
    {root:'C:/App',relativePath:'Claude.exe',score:24,categories:['engine-process','services-update'],hitCount:4,special:true},
    {root:'C:/App',relativePath:'resources/app.asar',score:18,categories:['principal-model'],hitCount:3,special:true}
  ]};
  const asar={archives:[{root:'C:/App',archiveRelativePath:'resources/app.asar'}],candidates:[
    {root:'C:/App',archiveRelativePath:'resources/app.asar',memberPath:'main.js',virtualPath:'resources/app.asar::main.js',score:34,categories:['principal-model','engine-process'],hitCount:7,unpacked:false,memberSha256:'a'.repeat(64)},
    {root:'C:/App',archiveRelativePath:'resources/app.asar',memberPath:'renderer/preload.js',virtualPath:'resources/app.asar::renderer/preload.js',score:28,categories:['desktop-ipc'],hitCount:5,unpacked:false,memberSha256:'b'.repeat(64)}
  ]};
  const runtime={processes:[{pid:100,parentPid:50,name:'Claude.exe',executablePath:'C:\\App\\Claude.exe',samples:20,connectionCount:2,endpoints:[{remoteAddress:'1.2.3.4',remotePort:443}],specimenCandidate:{score:24,relativePath:'Claude.exe',categories:['engine-process','services-update'],hitCount:4}}]};
  const launch={processes:[
    {processId:100,parentProcessId:50,name:'Claude.exe',executablePath:'C:\\App\\Claude.exe',detailsResolved:true,commandLine:'"C:\\App\\Claude.exe" --model claude-sonnet'},
    {processId:101,parentProcessId:100,name:'claude-code.exe',executablePath:'C:\\App\\resources\\claude-code.exe',detailsResolved:true,commandLine:'claude-code.exe --model claude-sonnet'}
  ]};
  const integrity={assessment:'enforced',fuses:{fuses:{EnableEmbeddedAsarIntegrityValidation:{state:'enabled'},OnlyLoadAppFromAsar:{state:'disabled'}}},archives:[{file:'resources\\app.asar',resolvedPath:'C:\\App\\resources\\app.asar',match:true,memberIntegrityCount:2}]};
  for(const [name,data] of Object.entries({surface,asar,runtime,launch,integrity}))writeFileSync(join(tmp,`${name}.json`),JSON.stringify(data));
  execFileSync(process.execPath,[join(import.meta.dirname,'Fuse-SpecimenEvidence.mjs'),'--surface',join(tmp,'surface.json'),'--asar',join(tmp,'asar.json'),'--runtime',join(tmp,'runtime.json'),'--launch',join(tmp,'launch.json'),'--integrity',join(tmp,'integrity.json'),'--out',out],{stdio:'pipe'});
  const fused=JSON.parse(readFileSync(join(out,'hypotheses.json'),'utf8'));
  assert.equal(fused.integrity.assessment,'enforced');
  const claude=fused.candidates.find(c=>c.path==='Claude.exe'||c.path==='C:/App/Claude.exe');
  assert(claude);assert(claude.sources.includes('surface'));assert(claude.sources.includes('runtime'));assert(claude.sources.includes('launch'));assert.equal(claude.firstExperimentEligible,true);assert(claude.surgeryScore<claude.evidenceScore);assert(claude.cautions.some(x=>/signing\/update risk/.test(x)));
  const internal=fused.candidates.find(c=>c.path==='resources/app.asar::main.js');
  assert(internal);assert(internal.cautions.some(x=>/integrity validation is enabled/.test(x)));assert(internal.surgeryScore<internal.evidenceScore);assert.equal(internal.firstExperimentEligible,false);
  const code=fused.candidates.find(c=>/claude-code\.exe$/i.test(c.path));assert(code);assert(code.categories.includes('engine-process'));assert(code.categories.includes('principal-model'));
  const report=readFileSync(join(out,'HYPOTHESES.md'),'utf8');assert.match(report,/First-experiment shortlist/);assert.match(report,/ASAR integrity assessment:\*\* enforced/);assert.match(report,/Claude\.exe/);
  console.log('CLcode specimen evidence fusion self-test: PASS');
} finally {rmSync(tmp,{recursive:true,force:true});}
