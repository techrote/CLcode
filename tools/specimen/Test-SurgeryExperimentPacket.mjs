#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const tool=join(dirname(fileURLToPath(import.meta.url)),'Prepare-SurgeryExperiment.mjs');
const tmp=mkdtempSync(join(tmpdir(),'clcode-packet-'));
const specimen=join(tmp,'specimen'), baseline=join(tmp,'baseline'), out=join(tmp,'packet');
const target=join(specimen,'resources','candidate.js');
const q=v=>`"${String(v).replaceAll('"','""')}"`;
try{
  mkdirSync(join(specimen,'resources'),{recursive:true});mkdirSync(baseline,{recursive:true});
  const body="const model='claude-sonnet';\n";writeFileSync(target,body);
  const sha=createHash('sha256').update(body).digest('hex');
  writeFileSync(join(baseline,'manifest.json'),JSON.stringify({captureId:'baseline-test',createdAtUtc:'2026-11-24T00:00:00Z',hashesSkipped:false,filesCsv:'files.csv'}));
  writeFileSync(join(baseline,'files.csv'),['Root,RelativePath,Length,LastWriteTimeUtc,SHA256,HashError',[q(specimen),q('resources/candidate.js'),body.length,q('2026-11-24T00:00:00Z'),sha,q('')].join(',')].join('\n')+'\n');
  const candidate={id:`file:${specimen.toLowerCase().replaceAll('\\','/')}/resources/candidate.js`,kind:'file',path:'resources/candidate.js',root:specimen,relativePath:'resources/candidate.js',fullPath:`${specimen}/resources/candidate.js`,sha256:sha,evidenceScore:88,surgeryScore:80,categories:['principal-model'],sources:['surface','runtime'],behaviorSourceCount:2,liveSourceCount:1,firstExperimentEligible:true,cautions:[],evidence:[{source:'surface'},{source:'runtime'}]};
  const hypotheses={createdAtUtc:'2026-11-24T00:01:00Z',candidates:[candidate]};writeFileSync(join(tmp,'hypotheses.json'),JSON.stringify(hypotheses));
  let p=spawnSync(process.execPath,[tool,'--hypotheses',join(tmp,'hypotheses.json'),'--baseline',baseline,'--objective','Test principal model selection seam','--out',out],{encoding:'utf8'});
  assert.equal(p.status,0,p.stderr);
  const packet=JSON.parse(readFileSync(join(out,'experiment.json'),'utf8'));const patch=JSON.parse(readFileSync(join(out,'patch.json'),'utf8'));const md=readFileSync(join(out,'PACKET.md'),'utf8');
  assert.equal(packet.baseline.captureId,'baseline-test');assert.equal(packet.target.sha256,sha);assert.equal(patch.expectedSha256,sha);assert.equal(patch.target,'resources/candidate.js');assert.match(md,/Test principal model selection seam/);

  const badSha={...hypotheses,candidates:[{...candidate,sha256:'0'.repeat(64)}]};writeFileSync(join(tmp,'badsha.json'),JSON.stringify(badSha));
  p=spawnSync(process.execPath,[tool,'--hypotheses',join(tmp,'badsha.json'),'--baseline',baseline,'--objective','x','--out',join(tmp,'bad')],{encoding:'utf8'});assert.notEqual(p.status,0);assert.match(p.stderr,/differs from baseline/i);

  const ineligible={...hypotheses,candidates:[{...candidate,firstExperimentEligible:false}]};writeFileSync(join(tmp,'ineligible.json'),JSON.stringify(ineligible));
  p=spawnSync(process.execPath,[tool,'--hypotheses',join(tmp,'ineligible.json'),'--baseline',baseline,'--candidate',candidate.id,'--objective','x','--out',join(tmp,'ineligible-out')],{encoding:'utf8'});assert.notEqual(p.status,0);assert.match(p.stderr,/not firstExperimentEligible/i);

  p=spawnSync(process.execPath,[tool,'--hypotheses',join(tmp,'hypotheses.json'),'--baseline',baseline,'--objective','   ','--out',join(tmp,'blank-objective')],{encoding:'utf8'});assert.notEqual(p.status,0);assert.match(p.stderr,/objective must be non-empty/i);

  const asar={...hypotheses,candidates:[{...candidate,id:'asar:x::main.js',kind:'asar-member',path:'resources/app.asar::main.js',firstExperimentEligible:true}]};writeFileSync(join(tmp,'asar.json'),JSON.stringify(asar));
  p=spawnSync(process.execPath,[tool,'--hypotheses',join(tmp,'asar.json'),'--baseline',baseline,'--candidate','resources/app.asar::main.js','--objective','x','--out',join(tmp,'asar-out')],{encoding:'utf8'});assert.notEqual(p.status,0);assert.match(p.stderr,/ASAR-member candidates require an archive-level strategy/i);
  console.log('CLcode surgery experiment packet self-test: PASS');
} finally {rmSync(tmp,{recursive:true,force:true});}
