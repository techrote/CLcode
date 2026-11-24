#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { listAsarEntries, readAsarEntry, readAsarHeader } from './asar-reader.mjs';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DEFAULT_PATTERNS = join(here, 'specimen-patterns.json');
const DEFAULT_MEMBER_MAX = 64 * 1024 * 1024;
const DEFAULT_CONTEXT = 96;
const DEFAULT_MAX_HITS = 80;
const BINARY_EXT = new Set(['.exe','.dll','.node','.pak','.bin','.dat','.png','.jpg','.jpeg','.gif','.webp','.ico','.icns','.pdf','.woff','.woff2','.ttf','.otf','.mp3','.wav','.ogg','.mp4','.webm','.zip','.7z','.gz','.br']);
const SKIP_DIRS = new Set(['cache','code cache','gpucache','shadercache','crashpad','logs','log']);

function parseArgs(argv) {
  const out = { roots: [], archives: [], maxMemberBytes: DEFAULT_MEMBER_MAX, contextChars: DEFAULT_CONTEXT, maxHitsPerMember: DEFAULT_MAX_HITS };
  for (let i=0;i<argv.length;i++) {
    const arg=argv[i];
    if (arg==='--root') out.roots.push(argv[++i]);
    else if (arg==='--archive') out.archives.push(argv[++i]);
    else if (arg==='--out') out.out=argv[++i];
    else if (arg==='--patterns') out.patterns=argv[++i];
    else if (arg==='--max-member-mb') out.maxMemberBytes=Math.round(Number(argv[++i])*1024*1024);
    else if (arg==='--context') out.contextChars=Number(argv[++i]);
    else if (arg==='--max-hits-per-member') out.maxHitsPerMember=Number(argv[++i]);
    else if (arg==='--help'||arg==='-h') out.help=true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!out.help && !out.roots.length && !out.archives.length) throw new Error('Use at least one --root PATH or --archive FILE.');
  if (!(out.maxMemberBytes>0) || !Number.isFinite(out.maxMemberBytes)) throw new Error('--max-member-mb must be positive.');
  if (!Number.isInteger(out.contextChars)||out.contextChars<24||out.contextChars>400) throw new Error('--context must be 24..400.');
  if (!Number.isInteger(out.maxHitsPerMember)||out.maxHitsPerMember<1||out.maxHitsPerMember>1000) throw new Error('--max-hits-per-member must be 1..1000.');
  return out;
}

function usage(){ return 'Usage: node Scan-AsarSurface.mjs [--root INSTALL] [--archive app.asar] [--out DIR]\nRead-only ASAR internal surface mapper; stores metadata and short redacted snippets only.\n'; }

function loadCatalog(path) {
  const parsed=JSON.parse(readFileText(path));
  if(!parsed?.categories||typeof parsed.categories!=='object') throw new Error('Pattern catalog must contain categories.');
  const entries=[];
  for(const [category,patterns] of Object.entries(parsed.categories)) for(const pattern of patterns??[]){ const text=String(pattern).trim(); if(text) entries.push({category,pattern:text,needle:text.toLowerCase()}); }
  return {entries,categories:Object.keys(parsed.categories)};
}
function readFileText(path){ return readFileSync(path,'utf8'); }

function sanitize(text){
  let out=String(text??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g,' ');
  out=out.replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi,'Bearer [redacted]');
  out=out.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g,'sk-[redacted]');
  out=out.replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|cookie|client[_-]?secret)["']?\s*[:=]\s*["']?)[^\s,"'}]{6,}/gi,'$1[redacted]');
  out=out.replace(/([?&](?:token|access_token|api_key|key|auth|code)=)[^&#\s]{6,}/gi,'$1[redacted]');
  return out.replace(/\s+/g,' ').trim();
}

function findHits(text,entries,encoding,contextChars,seen,limit){
  const lower=text.toLowerCase(), hits=[];
  for(const item of entries){
    let start=0;
    while(hits.length<limit){
      const at=lower.indexOf(item.needle,start); if(at<0) break;
      const snippet=sanitize(text.slice(Math.max(0,at-contextChars),Math.min(text.length,at+item.pattern.length+contextChars)));
      const key=`${item.category}\0${item.pattern.toLowerCase()}\0${snippet.toLowerCase()}`;
      if(!seen.has(key)){ seen.add(key); hits.push({category:item.category,pattern:item.pattern,encoding,offsetApprox:at,snippet}); }
      start=at+Math.max(1,item.needle.length);
    }
    if(hits.length>=limit) break;
  }
  return hits;
}

function isWithin(root,candidate){ const rel=relative(root,candidate); return rel===''||(!rel.startsWith('..')&&!rel.startsWith(sep)); }
function enumerateAsars(root){
  const out=[], stack=[root];
  while(stack.length){
    const dir=stack.pop(); let entries; try{entries=readdirSync(dir,{withFileTypes:true});}catch{continue;}
    for(const e of entries){ const full=join(dir,e.name); if(!isWithin(root,full)) continue; if(e.isDirectory()){if(!SKIP_DIRS.has(e.name.toLowerCase())&&!e.name.toLowerCase().endsWith('.asar.unpacked')) stack.push(full);} else if(e.isFile()&&e.name.toLowerCase().endsWith('.asar')) out.push(full); }
  }
  return out;
}
function specialMember(path){ return /(^|\/)(package|manifest)\.json$/i.test(path)||/preload/i.test(path)||/(^|\/)(main|index)\.(c?m?js)$/i.test(path)||/claude|anthropic|code|auth|quota|ipc/i.test(basename(path)); }
function shouldScan(entry,max){ if(entry.type!=='file'||entry.size>max) return false; const ext=extname(entry.path).toLowerCase(); if(BINARY_EXT.has(ext)) return false; if(!ext && entry.size>2*1024*1024) return false; return true; }
function score(row){ const cats=new Set(row.hits.map(h=>h.category)); const pats=new Set(row.hits.map(h=>`${h.category}:${h.pattern.toLowerCase()}`)); return row.hits.length+cats.size*4+pats.size*2+(row.special?4:0); }
async function hashFile(path){ return new Promise((res,rej)=>{ const h=createHash('sha256'); const s=createReadStream(path); s.on('data',c=>h.update(c)); s.on('error',rej); s.on('end',()=>res(h.digest('hex'))); }); }

async function main(){
  const opts=parseArgs(process.argv.slice(2)); if(opts.help){process.stdout.write(usage());return;}
  const roots=opts.roots.map(p=>resolve(p)); for(const r of roots) if(!existsSync(r)||!statSync(r).isDirectory()) throw new Error(`Root is not a directory: ${r}`);
  const archiveSet=new Set(opts.archives.map(p=>resolve(p)));
  for(const root of roots) for(const a of enumerateAsars(root)) archiveSet.add(a);
  if(!archiveSet.size) throw new Error('No ASAR archives found.');
  for(const a of archiveSet) if(!existsSync(a)||!statSync(a).isFile()) throw new Error(`ASAR archive is not a file: ${a}`);
  const catalogPath=resolve(opts.patterns??DEFAULT_PATTERNS), catalog=loadCatalog(catalogPath);
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const outDir=resolve(opts.out??join(process.env.USERPROFILE||process.env.HOME||homedir(),'clcode-specimen-lab','maps',`asar-${stamp}`)); mkdirSync(outDir,{recursive:true});
  const archiveRows=[], candidates=[], hitLines=[]; let totalMembers=0, scannedMembers=0, skippedMembers=0;
  for(const archive of [...archiveSet].sort()){
    const info=readAsarHeader(archive); const entries=listAsarEntries(info); const archiveSha256=await hashFile(archive);
    const root=roots.find(r=>isWithin(r,archive))??dirname(archive); const archiveRelativePath=relative(root,archive).split(sep).join('/');
    let integrityMembers=0, unpackedMembers=0;
    for(const entry of entries){ if(entry.integrity) integrityMembers++; if(entry.unpacked) unpackedMembers++; }
    archiveRows.push({root,archive,archiveRelativePath,size:info.archiveSize,sha256:archiveSha256,headerSha256:info.headerSha256,headerPickleSha256:info.headerPickleSha256,headerPickleSize:info.headerPickleSize,memberCount:entries.length,integrityMembers,unpackedMembers});
    for(const entry of entries){
      totalMembers++;
      if(!shouldScan(entry,opts.maxMemberBytes)){skippedMembers++;continue;}
      let buffer; try{buffer=readAsarEntry(info,entry,{maxBytes:opts.maxMemberBytes});}catch(error){skippedMembers++;continue;}
      scannedMembers++;
      const seen=new Set(), hits=[]; const decodings=[['utf8',buffer.toString('utf8')],['latin1',buffer.toString('latin1')]];
      if(buffer.length>=4) decodings.push(['utf16le',buffer.subarray(0,buffer.length-(buffer.length%2)).toString('utf16le')]);
      for(const [encoding,text] of decodings){ if(hits.length>=opts.maxHitsPerMember) break; hits.push(...findHits(text,catalog.entries,encoding,opts.contextChars,seen,opts.maxHitsPerMember-hits.length)); }
      const special=specialMember(entry.path); if(!special&&!hits.length) continue;
      const memberSha256=createHash('sha256').update(buffer).digest('hex');
      const row={root,archiveRelativePath,memberPath:entry.path,virtualPath:`${archiveRelativePath}::${entry.path}`,size:entry.size,unpacked:entry.unpacked,memberSha256,integrity:entry.integrity??null,special,hits}; row.score=score(row); candidates.push(row);
      for(const hit of hits) hitLines.push(JSON.stringify({root,archiveRelativePath,archiveSha256,memberPath:entry.path,memberSha256,size:entry.size,unpacked:entry.unpacked,...hit}));
    }
  }
  candidates.sort((a,b)=>b.score-a.score||a.virtualPath.localeCompare(b.virtualPath));
  const categoryCounts=Object.fromEntries(catalog.categories.map(c=>[c,0])); for(const c of candidates) for(const h of c.hits) categoryCounts[h.category]=(categoryCounts[h.category]??0)+1;
  const map={schemaVersion:1,createdAtUtc:new Date().toISOString(),roots,patternCatalog:catalogPath,maxMemberBytes:opts.maxMemberBytes,archiveCount:archiveRows.length,totalMembers,scannedMembers,skippedMembers,candidateMembers:candidates.length,categoryCounts,archives:archiveRows,candidates:candidates.map(c=>({root:c.root,archiveRelativePath:c.archiveRelativePath,memberPath:c.memberPath,virtualPath:c.virtualPath,size:c.size,unpacked:c.unpacked,memberSha256:c.memberSha256,integrity:c.integrity,score:c.score,special:c.special,categories:[...new Set(c.hits.map(h=>h.category))],distinctPatterns:[...new Set(c.hits.map(h=>h.pattern))],hitCount:c.hits.length})),note:'Read-only ASAR member map. No archive member is copied to output; hits contain only short redacted snippets. ASAR integrity may make later archive modification fail at application startup and must be evaluated separately.'};
  writeFileSync(join(outDir,'asar-map.json'),JSON.stringify(map,null,2)); writeFileSync(join(outDir,'asar-hits.jsonl'),hitLines.length?`${hitLines.join('\n')}\n`:'');
  const csv=['score,archive,member,size,sha256,categories,patterns,hits,unpacked']; const q=v=>`"${String(v??'').replaceAll('"','""')}"`; for(const c of map.candidates) csv.push([c.score,q(c.archiveRelativePath),q(c.memberPath),c.size,c.memberSha256,q(c.categories.join('|')),q(c.distinctPatterns.join('|')),c.hitCount,c.unpacked].join(',')); writeFileSync(join(outDir,'asar-candidates.csv'),`${csv.join('\n')}\n`);
  process.stdout.write(`${outDir}\n`);
}
main().catch(error=>{process.stderr.write(`${error?.stack??error}\n`);process.exit(1);});
