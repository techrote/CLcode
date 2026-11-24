#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';

const HIGH_VALUE = new Set(['principal-model','engine-process','desktop-ipc','auth-quota','tool-policy']);
const BEHAVIOR_SOURCES = new Set(['surface','asar','runtime','launch']);
const clamp = (v,min,max)=>Math.max(min,Math.min(max,Number(v)||0));

function parse(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--surface') out.surface=argv[++i];
    else if(a==='--asar') out.asar=argv[++i];
    else if(a==='--runtime') out.runtime=argv[++i];
    else if(a==='--launch') out.launch=argv[++i];
    else if(a==='--integrity') out.integrity=argv[++i];
    else if(a==='--out') out.out=argv[++i];
    else if(a==='--help'||a==='-h') out.help=true;
    else throw new Error(`Unknown argument ${a}`);
  }
  if(!out.help && !['surface','asar','runtime','launch','integrity'].some(k=>out[k])) throw new Error('Provide at least one evidence source.');
  return out;
}
function usage(){return 'Usage: node Fuse-SpecimenEvidence.mjs [--surface map.json] [--asar asar-map.json] [--runtime runtime-summary.json] [--launch summary.json] [--integrity asar-integrity.json] --out DIR\n';}
function load(path,label){ if(!path)return null; const p=resolve(path); if(!existsSync(p))throw new Error(`${label} file not found: ${p}`); return {path:p,data:JSON.parse(readFileSync(p,'utf8'))}; }
function norm(value){return String(value??'').replaceAll('\\','/').replace(/\/+/g,'/').replace(/\/$/,'').toLowerCase();}
function full(root,rel){return norm(`${String(root??'').replace(/[\\/]$/,'')}/${String(rel??'').replace(/^[\\/]/,'')}`);}
function displayPath(value){return String(value??'').replaceAll('\\','/');}
function esc(value){return String(value??'').replaceAll('|','\\|');}
function short(value,n=120){const s=String(value??'');return s.length<=n?s:`${s.slice(0,n-1)}…`;}

function make(id,kind,path){return {id,kind,path,categories:new Set(),sources:new Set(),evidence:[],rawScore:0,surgeryPenalty:0,cautions:new Set(),archiveKey:null};}
function add(map,id,kind,path){let c=map.get(id);if(!c){c=make(id,kind,path);map.set(id,c);}return c;}
function addCats(c,cats){for(const x of cats??[])if(x)c.categories.add(String(x));}
function evidence(c,source,weight,detail,{behavior=true}={}){c.sources.add(source);c.rawScore+=weight;c.evidence.push({source,weight,detail});if(!behavior)c.nonBehavioral=true;}

function surfaceEvidence(map,src){
  if(!src)return;
  for(const row of src.data.candidates??[]){
    const key=full(row.root,row.relativePath), c=add(map,`file:${key}`,'file',displayPath(row.relativePath));
    c.fullPath=key; c.root=row.root; c.relativePath=row.relativePath; addCats(c,row.categories);
    evidence(c,'surface',clamp(row.score,1,60),{score:row.score,hitCount:row.hitCount,special:Boolean(row.special)});
  }
}
function asarEvidence(map,src){
  if(!src)return;
  for(const row of src.data.candidates??[]){
    const archiveKey=full(row.root,row.archiveRelativePath);
    const member=norm(row.memberPath);
    const c=add(map,`asar:${archiveKey}::${member}`,'asar-member',`${displayPath(row.archiveRelativePath)}::${displayPath(row.memberPath)}`);
    c.archiveKey=archiveKey;c.archiveRelativePath=row.archiveRelativePath;c.memberPath=row.memberPath;c.root=row.root;addCats(c,row.categories);
    evidence(c,'asar',clamp(row.score,1,70),{score:row.score,hitCount:row.hitCount,unpacked:Boolean(row.unpacked),memberSha256:row.memberSha256});
    const archive=map.get(`file:${archiveKey}`);
    if(archive){ c.evidence.push({source:'surface-archive',weight:3,detail:{archiveCandidate:archive.path}});c.rawScore+=3; }
  }
}
function runtimeEvidence(map,src){
  if(!src)return;
  for(const p of src.data.processes??[]){
    if(!p.executablePath)continue;
    const key=norm(p.executablePath), c=add(map,`file:${key}`,'process-file',displayPath(p.executablePath));
    c.fullPath=key; addCats(c,['engine-process',...(p.specimenCandidate?.categories??[])]);
    const weight=22+Math.min(8,Number(p.connectionCount)||0);
    evidence(c,'runtime',weight,{pid:p.pid,parentPid:p.parentPid,connections:p.connectionCount??0,samples:p.samples??0,specimenCandidate:p.specimenCandidate??null});
  }
}
function launchCats(commandLine){
  const text=String(commandLine??'').toLowerCase(), cats=['engine-process'];
  if(/(?:--model\b|anthropic_model|\/v1\/messages|base[_-]?url|gateway|inference.?model)/i.test(text))cats.push('principal-model');
  if(/(?:oauth|login|sign.?in|entitlement|quota|usage.?limit|subscription)/i.test(text))cats.push('auth-quota');
  return cats;
}
function launchEvidence(map,src){
  if(!src)return;
  for(const p of src.data.processes??[]){
    if(!p.executablePath)continue;
    const key=norm(p.executablePath), c=add(map,`file:${key}`,'process-file',displayPath(p.executablePath));
    c.fullPath=key; addCats(c,launchCats(p.commandLine));
    evidence(c,'launch',24,{processId:p.processId,parentProcessId:p.parentProcessId,name:p.name,detailsResolved:Boolean(p.detailsResolved),commandLine:short(p.commandLine,500)});
  }
}
function integrityEvidence(map,src){
  if(!src)return;
  const assessment=String(src.data.assessment??'unknown');
  const integrityFuse=src.data.fuses?.fuses?.EnableEmbeddedAsarIntegrityValidation?.state??'unknown';
  const onlyAsar=src.data.fuses?.fuses?.OnlyLoadAppFromAsar?.state??'unknown';
  for(const a of src.data.archives??[]){
    const key=norm(a.resolvedPath??a.file);
    for(const c of map.values()){
      if(c.kind!=='asar-member')continue;
      const same=c.archiveKey===key || norm(c.archiveRelativePath)===norm(a.file) || key.endsWith(`/${norm(c.archiveRelativePath)}`);
      if(!same)continue;
      c.evidence.push({source:'integrity',weight:0,detail:{assessment,integrityFuse,onlyLoadAppFromAsar:onlyAsar,hashMatch:a.match,memberIntegrityCount:a.memberIntegrityCount??null}});
      c.sources.add('integrity');
      if(integrityFuse==='enabled'){
        c.surgeryPenalty+=35;c.cautions.add('embedded ASAR integrity validation is enabled; direct archive surgery requires explicit integrity handling');
      } else if(integrityFuse==='unknown') {
        c.surgeryPenalty+=10;c.cautions.add('ASAR integrity fuse state is unknown');
      }
      if(onlyAsar==='enabled'){
        c.surgeryPenalty+=10;c.cautions.add('OnlyLoadAppFromAsar is enabled; ordinary unpacked-app fallback is unavailable');
      }
      if(a.match===false){c.surgeryPenalty+=8;c.cautions.add('packaged ASAR hash does not match installed archive');}
    }
  }
}
function crossEvidence(map){
  const live=[...map.values()].filter(c=>c.sources.has('runtime')||c.sources.has('launch'));
  for(const c of map.values()){
    if(c.kind!=='file' && c.kind!=='process-file')continue;
    const same=live.find(x=>x!==c&&x.fullPath&&c.fullPath&&x.fullPath===c.fullPath);
    if(same){for(const src of ['runtime','launch'])if(same.sources.has(src)&&!c.sources.has(src)){c.sources.add(src);c.rawScore+=8;c.evidence.push({source:`${src}-correlation`,weight:8,detail:{path:same.path}});}}
  }
}
function finalize(map){
  const out=[];
  for(const c of map.values()){
    const behavior=[...c.sources].filter(s=>BEHAVIOR_SOURCES.has(s));
    const live=behavior.filter(s=>s==='runtime'||s==='launch');
    const sourceBonus=Math.max(0,behavior.length-1)*8;
    const evidenceScore=Math.round(c.rawScore+sourceBonus);
    let surgeryPenalty=c.surgeryPenalty;
    if(/\.exe$/i.test(c.path)){surgeryPenalty+=18;c.cautions.add('native executable modification carries signing/update risk; prefer an external launch/config seam when it can answer the same question');}
    const surgeryScore=Math.max(0,evidenceScore-surgeryPenalty);
    const high=[...c.categories].filter(x=>HIGH_VALUE.has(x));
    const eligible=high.length>0&&behavior.length>=2&&!(c.kind==='asar-member'&&surgeryPenalty>=35);
    out.push({id:c.id,kind:c.kind,path:c.path,evidenceScore,surgeryScore,categories:[...c.categories].sort(),sources:[...c.sources].sort(),behaviorSourceCount:behavior.length,liveSourceCount:live.length,firstExperimentEligible:eligible,cautions:[...c.cautions],evidence:c.evidence});
  }
  return out.sort((a,b)=>b.evidenceScore-a.evidenceScore||b.surgeryScore-a.surgeryScore||a.path.localeCompare(b.path));
}

function report(result){
  const lines=['# CLcode fused specimen evidence','',`**Created:** ${result.createdAtUtc}`,'',`**Evidence sources loaded:** ${Object.entries(result.sources).filter(([,v])=>v).map(([k])=>k).join(', ')||'none'}.`,''];
  lines.push('This report ranks **evidence relevance** separately from **surgery suitability**. It does not authorize a patch. A first modification should still answer one bounded question and have an explicit rollback.','');
  if(result.integrity)lines.push(`**ASAR integrity assessment:** ${result.integrity.assessment} (validation fuse: ${result.integrity.validationFuse}; ASAR-only fuse: ${result.integrity.onlyLoadAppFromAsar}).`,'');
  lines.push('## First-experiment shortlist','');
  const shortList=result.candidates.filter(c=>c.firstExperimentEligible).slice(0,15);
  if(!shortList.length)lines.push('_No candidate yet has two independent behavioral evidence sources. Gather runtime/launch evidence before choosing a surgery target._','');
  else {lines.push('| Evidence | Surgery | Candidate | Categories | Sources | Cautions |','| ---: | ---: | --- | --- | --- | --- |');for(const c of shortList)lines.push(`| ${c.evidenceScore} | ${c.surgeryScore} | \`${esc(c.path)}\` | ${esc(c.categories.join(', '))} | ${esc(c.sources.join(', '))} | ${esc(c.cautions.join('; '))} |`);lines.push('');}
  lines.push('## Highest evidence candidates','','| Evidence | Surgery | Kind | Candidate | Categories | Sources |','| ---: | ---: | --- | --- | --- | --- |');
  for(const c of result.candidates.slice(0,40))lines.push(`| ${c.evidenceScore} | ${c.surgeryScore} | ${c.kind} | \`${esc(c.path)}\` | ${esc(c.categories.join(', '))} | ${esc(c.sources.join(', '))} |`);
  lines.push('');
  for(const [category,leaders] of Object.entries(result.categoryLeaders)){lines.push(`## ${category}`,'');if(!leaders.length){lines.push('_No candidates._','');continue;}for(const c of leaders)lines.push(`- **${c.evidenceScore} evidence / ${c.surgeryScore} surgery** — \`${c.path}\` — ${c.sources.join(', ')}${c.cautions.length?` — caution: ${c.cautions.join('; ')}`:''}`);lines.push('');}
  lines.push('## Interpretation rules','',
    '- `surface` and `asar` are static evidence; `runtime` and `launch` are live-process evidence.',
    '- A candidate with two static sources is stronger triage evidence, but not the same as a live behavioral correlation.',
    '- ASAR integrity changes patch feasibility, not whether an internal module is architecturally interesting.',
    '- A network-owning process is evidence of connection ownership, not application-layer purpose.',
    '- If the shortlist is empty, gather more evidence rather than lowering the bar for the first surgery.','');
  return `${lines.join('\n')}\n`;
}

function main(){
  const opts=parse(process.argv.slice(2));if(opts.help){process.stdout.write(usage());return;}
  const surface=load(opts.surface,'surface map'),asar=load(opts.asar,'ASAR map'),runtime=load(opts.runtime,'runtime summary'),launch=load(opts.launch,'launch summary'),integrity=load(opts.integrity,'integrity report');
  const map=new Map();surfaceEvidence(map,surface);asarEvidence(map,asar);runtimeEvidence(map,runtime);launchEvidence(map,launch);crossEvidence(map);integrityEvidence(map,integrity);
  const candidates=finalize(map);const categories=new Set();for(const c of candidates)for(const cat of c.categories)categories.add(cat);
  const categoryLeaders=Object.fromEntries([...categories].sort().map(cat=>[cat,candidates.filter(c=>c.categories.includes(cat)).slice(0,12)]));
  const result={schemaVersion:1,createdAtUtc:new Date().toISOString(),sources:{surface:surface?.path??null,asar:asar?.path??null,runtime:runtime?.path??null,launch:launch?.path??null,integrity:integrity?.path??null},integrity:integrity?{assessment:integrity.data.assessment??'unknown',validationFuse:integrity.data.fuses?.fuses?.EnableEmbeddedAsarIntegrityValidation?.state??'unknown',onlyLoadAppFromAsar:integrity.data.fuses?.fuses?.OnlyLoadAppFromAsar?.state??'unknown'}:null,candidateCount:candidates.length,shortlistCount:candidates.filter(c=>c.firstExperimentEligible).length,candidates,categoryLeaders,note:'Evidence fusion is triage only. It does not prove ownership or authorize modification.'};
  const outDir=resolve(opts.out??join(dirname(surface?.path??asar?.path??runtime?.path??launch?.path??integrity?.path??'.'),'fusion'));mkdirSync(outDir,{recursive:true});writeFileSync(join(outDir,'hypotheses.json'),JSON.stringify(result,null,2));writeFileSync(join(outDir,'HYPOTHESES.md'),report(result));process.stdout.write(`${outDir}\n`);
}
main();
