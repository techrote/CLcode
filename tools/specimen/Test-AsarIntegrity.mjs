#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FUSE_SENTINEL, readElectronFuses } from './electron-fuses.mjs';
import { readNamedPeResource } from './pe-resources.mjs';
import { inspectAsarIntegrity } from './Check-AsarIntegrity.mjs';
import { readAsarHeader } from './asar-reader.mjs';

function align4(n){ return (n+3)&~3; }
function buildAsar(files){
  let offset=0; const tree={files:{}}; const data=[];
  for(const [path,content] of Object.entries(files)){
    const buf=Buffer.from(content), parts=path.split('/'); let node=tree;
    for(let i=0;i<parts.length-1;i++) node=(node.files[parts[i]]??={files:{}});
    node.files[parts.at(-1)]={size:buf.length,offset:String(offset),integrity:{algorithm:'SHA256',hash:'a'.repeat(64),blockSize:1024,blocks:['b'.repeat(64)]}};
    data.push(buf); offset+=buf.length;
  }
  const json=Buffer.from(JSON.stringify(tree)); const payload=align4(4+json.length); const header=Buffer.alloc(4+payload);
  header.writeUInt32LE(payload,0); header.writeUInt32LE(json.length,4); json.copy(header,8);
  const size=Buffer.alloc(8); size.writeUInt32LE(4,0); size.writeUInt32LE(header.length,4);
  return Buffer.concat([size,header,...data]);
}
function putResourceString(buf,base,rel,text){ buf.writeUInt16LE(text.length,base+rel); Buffer.from(text,'utf16le').copy(buf,base+rel+2); }
function buildPe(resourceJson,{wire='101110011'}={}){
  const headers=Buffer.alloc(0x200), section=Buffer.alloc(0x400), pe=0x80, opt=pe+24, resourceRva=0x1000, raw=0x200;
  headers.write('MZ',0,'ascii'); headers.writeUInt32LE(pe,0x3c); headers.write('PE\0\0',pe,'binary');
  headers.writeUInt16LE(0x8664,pe+4); headers.writeUInt16LE(1,pe+6); headers.writeUInt16LE(0xf0,pe+20);
  headers.writeUInt16LE(0x20b,opt); const dd=opt+112; headers.writeUInt32LE(resourceRva,dd+16); headers.writeUInt32LE(section.length,dd+20);
  const sh=opt+0xf0; headers.write('.rsrc\0\0\0',sh,'binary'); headers.writeUInt32LE(section.length,sh+8); headers.writeUInt32LE(resourceRva,sh+12); headers.writeUInt32LE(section.length,sh+16); headers.writeUInt32LE(raw,sh+20);
  section.writeUInt16LE(1,12); section.writeUInt32LE(0x80000080,0x10); section.writeUInt32LE(0x80000020,0x14);
  section.writeUInt16LE(1,0x20+12); section.writeUInt32LE(0x800000a0,0x30); section.writeUInt32LE(0x80000040,0x34);
  section.writeUInt16LE(0,0x40+12); section.writeUInt16LE(1,0x40+14); section.writeUInt32LE(1033,0x50); section.writeUInt32LE(0x60,0x54);
  const payload=Buffer.from(resourceJson,'utf8'), payloadRel=0xc0;
  section.writeUInt32LE(resourceRva+payloadRel,0x60); section.writeUInt32LE(payload.length,0x64); section.writeUInt32LE(65001,0x68);
  putResourceString(section,0,0x80,'INTEGRITY'); putResourceString(section,0,0xa0,'ELECTRONASAR'); payload.copy(section,payloadRel);
  const parts=[headers,section]; if(wire!==null) parts.push(Buffer.from(FUSE_SENTINEL,'ascii'),Buffer.from([1,wire.length]),Buffer.from(wire,'ascii'));
  return Buffer.concat(parts);
}

const tmp=mkdtempSync(join(tmpdir(),'clcode-asar-integrity-'));
try{
  const app=join(tmp,'app'), resources=join(app,'resources'); mkdirSync(resources,{recursive:true});
  const asar=join(resources,'app.asar'); writeFileSync(asar,buildAsar({'main.js':"const endpoint='https://api.anthropic.com/v1/messages'"}));
  const header=readAsarHeader(asar), expected=header.headerSha256;
  assert.equal(expected.length,64); assert.notEqual(expected,header.headerPickleSha256);
  const resource=JSON.stringify([{file:'resources\\app.asar',alg:'sha256',value:expected}]);
  const exe=join(app,'Claude.exe'); writeFileSync(exe,buildPe(resource));
  const fuses=readElectronFuses(exe); assert.equal(fuses.version,1); assert.equal(fuses.count,9); assert.equal(fuses.fuses.EnableEmbeddedAsarIntegrityValidation.state,'enabled'); assert.equal(fuses.fuses.OnlyLoadAppFromAsar.state,'disabled');
  const pe=readNamedPeResource(exe,'INTEGRITY','ELECTRONASAR'); assert.equal(pe.found,true); assert.deepEqual(JSON.parse(pe.resources[0].bytes.toString('utf8')),[{file:'resources\\app.asar',alg:'sha256',value:expected}]);
  const report=inspectAsarIntegrity({exe,root:app}); assert.equal(report.assessment,'enforced'); assert.equal(report.archives[0].match,true); assert.equal(report.archives[0].actualHeaderSha256,expected); assert.equal(report.archives[0].memberIntegrityCount,1);
  const mismatch=join(app,'Mismatch.exe'); writeFileSync(mismatch,buildPe(JSON.stringify([{file:'resources\\app.asar',alg:'sha256',value:'0'.repeat(64)}]))); const bad=inspectAsarIntegrity({exe:mismatch,root:app}); assert.equal(bad.archives[0].match,false);
  const noFuse=join(app,'NoFuse.exe'); writeFileSync(noFuse,buildPe(resource,{wire:null})); const unknown=inspectAsarIntegrity({exe:noFuse,root:app}); assert.equal(unknown.fuses.found,false); assert.equal(unknown.assessment,'resource-present-fuse-unknown');
  const broken=join(app,'broken.exe'); writeFileSync(broken,Buffer.alloc(128)); assert.throws(()=>readNamedPeResource(broken,'INTEGRITY','ELECTRONASAR'),/missing MZ/);
  console.log('CLcode ASAR integrity self-test: PASS');
} finally { rmSync(tmp,{recursive:true,force:true}); }
