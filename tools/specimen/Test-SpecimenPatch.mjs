#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, win32 } from 'node:path';
import { isWithin } from './specimen-path-guard.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here=dirname(fileURLToPath(import.meta.url));
const sha=data=>createHash('sha256').update(data).digest('hex');
const run=(file,args,opts={})=>execFileSync(process.execPath,[join(here,file),...args],{encoding:'utf8',stdio:['ignore','pipe','pipe'],...opts});
assert.equal(isWithin('C:\specimen', 'D:\outside\file', win32), false);
assert.equal(isWithin('C:\specimen', 'C:\other\file', win32), false);
assert.equal(isWithin('C:\specimen', 'c:\SPECIMEN\inside.js', win32), true);
assert.equal(isWithin('C:\specimen', 'C:\specimen\..legitimate', win32), true);
assert.equal(isWithin('\\\\server\share\specimen', '\\\\server\other\file', win32), false);
const tmp=mkdtempSync(join(tmpdir(),'clcode-patch-'));
try{
 const root=join(tmp,'specimen'); const lab=join(tmp,'lab'); mkdirSync(root); mkdirSync(lab);
 const target=join(root,'app.js'); const original=Buffer.from("const model='claude';\nconst quota=true;\n"); writeFileSync(target,original);
 const spec=join(tmp,'patch.json'); writeFileSync(spec,JSON.stringify({schemaVersion:1,id:'principal-model-test',target:'app.js',expectedSha256:sha(original),mode:'utf8-text',replacements:[{old:"model='claude'",new:"model='clcode'",expectedCount:1}]}));
 const dry=JSON.parse(run('Apply-SpecimenPatch.mjs',['--root',root,'--spec',spec,'--lab',lab])); assert.equal(dry.dryRun,true); assert.deepEqual(readFileSync(target),original);
 const receiptPath=run('Apply-SpecimenPatch.mjs',['--root',root,'--spec',spec,'--lab',lab,'--apply']).trim(); assert(existsSync(receiptPath));
 const changed=readFileSync(target); assert.match(changed.toString('utf8'),/model='clcode'/); const receipt=JSON.parse(readFileSync(receiptPath,'utf8')); assert.equal(sha(changed),receipt.afterSha256); assert.equal(sha(readFileSync(receipt.backup)),receipt.beforeSha256);
 run('Rollback-SpecimenPatch.mjs',[receiptPath]); assert.deepEqual(readFileSync(target),original); assert(JSON.parse(readFileSync(receiptPath,'utf8')).rolledBackAtUtc);
 const wrong=join(tmp,'wrong.json'); writeFileSync(wrong,JSON.stringify({...JSON.parse(readFileSync(spec,'utf8')),expectedSha256:'0'.repeat(64)})); const bad=spawnSync(process.execPath,[join(here,'Apply-SpecimenPatch.mjs'),'--root',root,'--spec',wrong],{encoding:'utf8'}); assert.notEqual(bad.status,0); assert.match(bad.stderr,/SHA-256 mismatch/);
 const escape=join(tmp,'escape.json'); writeFileSync(escape,JSON.stringify({...JSON.parse(readFileSync(spec,'utf8')),target:'../outside.txt'})); const escaped=spawnSync(process.execPath,[join(here,'Apply-SpecimenPatch.mjs'),'--root',root,'--spec',escape],{encoding:'utf8'}); assert.notEqual(escaped.status,0); assert.match(escaped.stderr,/escapes specimen root/);
 writeFileSync(target,original); const dup=join(tmp,'dup.json'); writeFileSync(dup,JSON.stringify({schemaVersion:1,id:'dup',target:'app.js',expectedSha256:sha(original),mode:'utf8-text',replacements:[{old:'const',new:'let',expectedCount:1}]})); const dupRun=spawnSync(process.execPath,[join(here,'Apply-SpecimenPatch.mjs'),'--root',root,'--spec',dup],{encoding:'utf8'}); assert.notEqual(dupRun.status,0); assert.match(dupRun.stderr,/expected 1 matches but found 2/);
 const bin=join(root,'flag.bin'); const b0=Buffer.from([1,2,3,4,1,2,3,4]); writeFileSync(bin,b0); const bspec=join(tmp,'bin.json'); writeFileSync(bspec,JSON.stringify({schemaVersion:1,id:'binary',target:'flag.bin',expectedSha256:sha(b0),mode:'binary-exact',replacements:[{oldBase64:Buffer.from([1,2]).toString('base64'),newBase64:Buffer.from([9,9]).toString('base64'),expectedCount:2}]})); const breceipt=run('Apply-SpecimenPatch.mjs',['--root',root,'--spec',bspec,'--lab',lab,'--apply']).trim(); assert.deepEqual([...readFileSync(bin)],[9,9,3,4,9,9,3,4]); run('Rollback-SpecimenPatch.mjs',[breceipt]); assert.deepEqual(readFileSync(bin),b0);
 const template=join(tmp,'template.json'); run('New-SpecimenPatchSpec.mjs',['--root',root,'--target','app.js','--out',template]); assert.equal(JSON.parse(readFileSync(template,'utf8')).expectedSha256,sha(original));
 console.log('CLcode specimen patch self-test: PASS');
} finally { rmSync(tmp,{recursive:true,force:true}); }
