import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

class View {
  constructor(file) { this.file=resolve(file); this.size=statSync(this.file).size; this.fd=openSync(this.file,'r'); }
  close(){ closeSync(this.fd); }
  read(offset,length){ if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||offset+length>this.size) throw new Error(`PE read out of range at ${offset}+${length}.`); const b=Buffer.alloc(length); if(length&&readSync(this.fd,b,0,length,offset)!==length) throw new Error('Short PE read.'); return b; }
  u16(o){ return this.read(o,2).readUInt16LE(0); }
  u32(o){ return this.read(o,4).readUInt32LE(0); }
}

function parseHeaders(v){
  if(v.read(0,2).toString('ascii')!=='MZ') throw new Error('Not a PE file: missing MZ header.');
  const pe=v.u32(0x3c); if(pe<0x40||pe+24>v.size) throw new Error('Invalid PE header offset.');
  if(v.read(pe,4).toString('binary')!=='PE\0\0') throw new Error('Not a PE file: missing PE signature.');
  const sections=v.u16(pe+6), optionalSize=v.u16(pe+20), opt=pe+24;
  if(sections<1||sections>96||optionalSize<96||opt+optionalSize>v.size) throw new Error('Invalid PE COFF/optional header sizes.');
  const magic=v.u16(opt); const dd=magic===0x10b?opt+96:magic===0x20b?opt+112:null; if(dd===null) throw new Error(`Unsupported PE optional-header magic 0x${magic.toString(16)}.`);
  if(dd+24>opt+optionalSize) throw new Error('PE optional header has no resource data directory.');
  const resourceRva=v.u32(dd+16), resourceSize=v.u32(dd+20); if(!resourceRva||!resourceSize) return {pe,sections:[],resourceRva:0,resourceSize:0};
  const table=opt+optionalSize, list=[];
  for(let i=0;i<sections;i++){ const o=table+i*40; if(o+40>v.size) throw new Error('PE section table is truncated.'); const raw=v.read(o,40); list.push({name:raw.subarray(0,8).toString('ascii').replace(/\0+$/,''),virtualSize:raw.readUInt32LE(8),virtualAddress:raw.readUInt32LE(12),rawSize:raw.readUInt32LE(16),rawOffset:raw.readUInt32LE(20)}); }
  return {pe,sections:list,resourceRva,resourceSize};
}
function rvaToOffset(headers,rva){ for(const s of headers.sections){ const span=Math.max(s.virtualSize,s.rawSize); if(rva>=s.virtualAddress&&rva<s.virtualAddress+span){ const delta=rva-s.virtualAddress; if(delta>=s.rawSize) throw new Error(`RVA 0x${rva.toString(16)} lies beyond section raw data.`); return s.rawOffset+delta; } } throw new Error(`PE RVA 0x${rva.toString(16)} is not mapped by a section.`); }
function inResource(ctx,rel,len=1){ return Number.isInteger(rel)&&rel>=0&&Number.isInteger(len)&&len>=0&&rel+len<=ctx.headers.resourceSize; }
function nameAt(ctx,field){ if((field&0x80000000)===0) return {id:field>>>0,name:null}; const rel=field&0x7fffffff; if(!inResource(ctx,rel,2)) throw new Error('PE resource name offset is out of range.'); const len=ctx.v.u16(ctx.base+rel); if(!inResource(ctx,rel+2,len*2)) throw new Error('PE resource string is out of range.'); return {id:null,name:ctx.v.read(ctx.base+rel+2,len*2).toString('utf16le')}; }
function directory(ctx,rel){ if(!inResource(ctx,rel,16)) throw new Error('PE resource directory is out of range.'); const o=ctx.base+rel, named=ctx.v.u16(o+12), ids=ctx.v.u16(o+14), count=named+ids; if(count>4096||!inResource(ctx,rel+16,count*8)) throw new Error('PE resource directory entries are out of range.'); const out=[]; for(let i=0;i<count;i++){ const e=o+16+i*8, nameField=ctx.v.u32(e), dataField=ctx.v.u32(e+4); out.push({...nameAt(ctx,nameField),directory:Boolean(dataField&0x80000000),offset:dataField&0x7fffffff}); } return out; }
function findNamed(entries,name){ return entries.find(e=>e.name?.toUpperCase()===name.toUpperCase())??null; }
function dataEntry(ctx,rel,language){ if(!inResource(ctx,rel,16)) throw new Error('PE resource data entry is out of range.'); const o=ctx.base+rel, rva=ctx.v.u32(o), size=ctx.v.u32(o+4), codepage=ctx.v.u32(o+8), fileOffset=rvaToOffset(ctx.headers,rva); if(fileOffset+size>ctx.v.size) throw new Error('PE resource payload exceeds file size.'); return {languageId:language?.id??null,languageName:language?.name??null,codepage,size,fileOffset,bytes:ctx.v.read(fileOffset,size)}; }

export function readNamedPeResource(file,typeName,resourceName){
  const v=new View(file); try { const headers=parseHeaders(v); if(!headers.resourceRva) return {file:resolve(file),found:false,resources:[]}; const base=rvaToOffset(headers,headers.resourceRva),ctx={v,headers,base}; const type=findNamed(directory(ctx,0),typeName); if(!type||!type.directory) return {file:resolve(file),found:false,resources:[]}; const name=findNamed(directory(ctx,type.offset),resourceName); if(!name||!name.directory) return {file:resolve(file),found:false,resources:[]}; const langs=directory(ctx,name.offset),resources=[]; for(const lang of langs){ if(lang.directory){ for(const nested of directory(ctx,lang.offset)) if(!nested.directory) resources.push(dataEntry(ctx,nested.offset,lang)); } else resources.push(dataEntry(ctx,lang.offset,lang)); } return {file:resolve(file),found:resources.length>0,type:typeName,name:resourceName,resourceRva:headers.resourceRva,resourceSize:headers.resourceSize,resources}; } finally { v.close(); }
}
