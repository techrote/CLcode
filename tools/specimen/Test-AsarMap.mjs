#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { listAsarEntries, readAsarEntry, readAsarHeader } from './asar-reader.mjs';

function align4(n){ return (n+3)&~3; }
function buildAsar(files){
  let offset=0; const tree={files:{}}; const data=[];
  for(const [path,content] of Object.entries(files)){
    const buf=Buffer.from(content);
    const parts=path.split('/'); let node=tree;
    for(let i=0;i<parts.length-1;i++) node=(node.files[parts[i]]??={files:{}});
    node.files[parts.at(-1)]={size:buf.length,offset:String(offset)};
    data.push(buf); offset+=buf.length;
  }
  const json=Buffer.from(JSON.stringify(tree));
  const payload=align4(4+json.length);
  const header=Buffer.alloc(4+payload);
  header.writeUInt32LE(payload,0); header.writeUInt32LE(json.length,4); json.copy(header,8);
  const sizePickle=Buffer.alloc(8); sizePickle.writeUInt32LE(4,0); sizePickle.writeUInt32LE(header.length,4);
  return Buffer.concat([sizePickle,header,...data]);
}

const tmp=mkdtempSync(join(tmpdir(),'clcode-asar-map-'));
const specimen=join(tmp,'specimen'), resources=join(specimen,'resources'), out=join(tmp,'out');
try{
  mkdirSync(resources,{recursive:true});
  const archive=join(resources,'app.asar');
  writeFileSync(archive,buildAsar({
    'main.js':"const endpoint='https://api.anthropic.com/v1/messages'; const model=process.env.ANTHROPIC_MODEL; function boot(){ return child_process.spawn('claude-code'); }",
    'renderer/preload.js':"const channel='LocalSessions'; contextBridge.exposeInMainWorld('code',{}); const secret='sk-this-should-be-redacted';",
    'config/package.json':JSON.stringify({name:'desktop',inferenceModels:[{id:'claude-sonnet-test',behavesAs:'sonnet'}],quota:'usage limit'}),
    'wide.js':Buffer.from('oauth entitlement'.split('').join('\0')+'\0','latin1'),
    'assets/image.png':Buffer.from([0,1,2,3,4,5]),
  }));
  const info=readAsarHeader(archive); const entries=listAsarEntries(info);
  assert.equal(info.headerSha256, (await import('node:crypto')).createHash('sha256').update(info.headerString).digest('hex'));
  assert.notEqual(info.headerSha256, info.headerPickleSha256);
  assert.equal(entries.filter(e=>e.type==='file').length,5);
  const main=entries.find(e=>e.path==='main.js');
  assert.match(readAsarEntry(info,main).toString('utf8'),/api\.anthropic\.com/);
  execFileSync(process.execPath,[join(import.meta.dirname,'Scan-AsarSurface.mjs'),'--root',specimen,'--out',out,'--patterns',join(import.meta.dirname,'specimen-patterns.json')],{stdio:'pipe'});
  const map=JSON.parse(readFileSync(join(out,'asar-map.json'),'utf8'));
  assert.equal(map.archiveCount,1); assert.equal(map.totalMembers,5); assert(map.scannedMembers>=4);
  const explicitOut=join(tmp,'out-explicit');
  execFileSync(process.execPath,[join(import.meta.dirname,'Scan-AsarSurface.mjs'),'--archive',archive,'--out',explicitOut,'--patterns',join(import.meta.dirname,'specimen-patterns.json')],{stdio:'pipe'});
  const explicitMap=JSON.parse(readFileSync(join(explicitOut,'asar-map.json'),'utf8'));
  assert.equal(explicitMap.archiveCount,1); assert.equal(explicitMap.archives[0].archiveRelativePath,'app.asar');
  assert(map.categoryCounts['principal-model']>=3); assert(map.categoryCounts['desktop-ipc']>=2); assert(map.categoryCounts['auth-quota']>=1);
  assert(map.candidates.some(x=>x.memberPath==='main.js'&&x.categories.includes('engine-process')));
  assert(map.candidates.some(x=>x.memberPath==='renderer/preload.js'&&x.categories.includes('desktop-ipc')));
  assert(map.candidates.some(x=>x.memberPath==='wide.js'&&x.categories.includes('auth-quota')));
  assert(!map.candidates.some(x=>x.memberPath==='assets/image.png'));
  assert.throws(()=>readAsarEntry(info,{...main,offset:'999999999'}),/range exceeds archive/);
  const hits=readFileSync(join(out,'asar-hits.jsonl'),'utf8');
  assert.match(hits,/api\.anthropic\.com/); assert.match(hits,/sk-\[redacted\]/); assert(!hits.includes('sk-this-should-be-redacted'));
  const report=join(out,'ASAR-REPORT.md'); execFileSync(process.execPath,[join(import.meta.dirname,'Summarize-AsarMap.mjs'),join(out,'asar-map.json'),report],{stdio:'pipe'});
  const text=readFileSync(report,'utf8'); assert.match(text,/app\.asar::main\.js/); assert.match(text,/ASAR integrity/);
  const broken=join(resources,'broken.asar'); writeFileSync(broken,Buffer.alloc(16)); assert.throws(()=>readAsarHeader(broken),/header Pickle size|payload/);
  console.log('CLcode ASAR map self-test: PASS');
} finally { rmSync(tmp,{recursive:true,force:true}); }
