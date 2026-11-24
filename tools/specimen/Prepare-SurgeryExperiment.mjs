#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

function parse(argv) {
  const out = { rank: 1, mode: 'utf8-text' };
  for (let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(a==='--hypotheses') out.hypotheses=argv[++i];
    else if(a==='--baseline') out.baseline=argv[++i];
    else if(a==='--candidate') out.candidate=argv[++i];
    else if(a==='--rank') out.rank=Number(argv[++i]);
    else if(a==='--objective') out.objective=argv[++i];
    else if(a==='--out') out.out=argv[++i];
    else if(a==='--mode') out.mode=argv[++i];
    else if(a==='--help'||a==='-h') out.help=true;
    else throw new Error(`Unknown argument ${a}`);
  }
  return out;
}
function usage(){return 'Usage: node Prepare-SurgeryExperiment.mjs --hypotheses hypotheses.json --baseline CAPTURE_DIR|manifest.json --objective TEXT --out DIR [--candidate ID_OR_PATH|--rank N] [--mode utf8-text|binary-exact]\n';}
function norm(value){return String(value??'').replaceAll('\\','/').replace(/\/+/g,'/').replace(/\/$/,'').toLowerCase();}
function safeId(value){return String(value??'experiment').toLowerCase().replace(/[^a-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,72)||'experiment';}
function ps(value){return `'${String(value??'').replaceAll("'", "''")}'`;}
function parseCsv(text){
  const rows=[]; let row=[], field='', quoted=false;
  const pushField=()=>{row.push(field);field='';};
  const pushRow=()=>{if(row.length||field.length){pushField();rows.push(row);row=[];}};
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){
      if(ch==='"'&&text[i+1]==='"'){field+='"';i++;}
      else if(ch==='"') quoted=false;
      else field+=ch;
    } else if(ch==='"') quoted=true;
    else if(ch===',') pushField();
    else if(ch==='\n') pushRow();
    else if(ch!=='\r') field+=ch;
  }
  pushRow();
  if(!rows.length)return[];
  const headers=rows[0];
  return rows.slice(1).filter(r=>r.some(x=>x!=='')) .map(r=>Object.fromEntries(headers.map((h,i)=>[h,r[i]??''])));
}
function loadBaseline(input){
  const resolved=resolve(input); let dir=resolved, manifestPath;
  if(existsSync(resolved)&&statSync(resolved).isFile()){manifestPath=resolved;dir=dirname(resolved);} else manifestPath=join(resolved,'manifest.json');
  if(!existsSync(manifestPath))throw new Error(`Baseline manifest not found: ${manifestPath}`);
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  if(manifest.hashesSkipped)throw new Error('Baseline capture skipped file hashes; cannot bind a surgery packet safely.');
  const csvPath=join(dir,manifest.filesCsv??'files.csv');
  if(!existsSync(csvPath))throw new Error(`Baseline file inventory not found: ${csvPath}`);
  return {dir,manifest,rows:parseCsv(readFileSync(csvPath,'utf8'))};
}
function selectCandidate(hypotheses, opts){
  const all=hypotheses.candidates??[];
  let c;
  if(opts.candidate){const needle=norm(opts.candidate);c=all.find(x=>norm(x.id)===needle||norm(x.path)===needle||norm(x.fullPath)===needle);if(!c)throw new Error(`Candidate not found: ${opts.candidate}`);}
  else {const eligible=all.filter(x=>x.firstExperimentEligible);if(!Number.isInteger(opts.rank)||opts.rank<1)throw new Error('--rank must be a positive integer.');c=eligible[opts.rank-1];if(!c)throw new Error(`Eligible candidate rank ${opts.rank} does not exist; shortlist contains ${eligible.length}.`);}
  if(!c.firstExperimentEligible)throw new Error('Selected candidate is not firstExperimentEligible; gather more evidence or choose another candidate.');
  if(c.kind==='asar-member')throw new Error('ASAR-member candidates require an archive-level strategy and are not eligible for ordinary file patch-spec generation.');
  return c;
}
function bindCandidate(candidate, baseline){
  const validSha=x=>/^[a-f0-9]{64}$/i.test(String(x??''));
  let matches=[];
  if(candidate.root&&candidate.relativePath){
    matches=baseline.rows.filter(r=>norm(r.Root)===norm(candidate.root)&&norm(r.RelativePath)===norm(candidate.relativePath));
  }
  if(!matches.length&&candidate.fullPath){
    matches=baseline.rows.filter(r=>norm(`${String(r.Root??'').replace(/[\\/]$/,'')}/${String(r.RelativePath??'').replace(/^[\\/]/,'')}`)===norm(candidate.fullPath));
  }
  if(matches.length!==1)throw new Error(`Baseline binding is ambiguous or absent for candidate ${candidate.path}: found ${matches.length} matching file rows.`);
  const row=matches[0];
  if(row.HashError)throw new Error(`Baseline hash error for target: ${row.HashError}`);
  if(!validSha(row.SHA256))throw new Error('Baseline target has no valid SHA-256.');
  if(candidate.sha256&&norm(candidate.sha256)!==norm(row.SHA256))throw new Error(`Fused candidate SHA-256 differs from baseline capture: ${candidate.sha256} vs ${row.SHA256}.`);
  const root=row.Root, rel=row.RelativePath.replaceAll('\\','/');
  if(isAbsolute(rel)||rel.split('/').includes('..'))throw new Error('Baseline relative target is unsafe.');
  return {root,relativePath:rel,sha256:row.SHA256.toLowerCase(),length:Number(row.Length)||null,lastWriteTimeUtc:row.LastWriteTimeUtc||null};
}
function main(){
  const opts=parse(process.argv.slice(2));if(opts.help){process.stdout.write(usage());return;}
  if(!opts.hypotheses||!opts.baseline||!String(opts.objective??'').trim()||!opts.out)throw new Error('--hypotheses, --baseline, --objective and --out are required; objective must be non-empty.');
  if(!['utf8-text','binary-exact'].includes(opts.mode))throw new Error('--mode must be utf8-text or binary-exact.');
  const hypothesesPath=resolve(opts.hypotheses);if(!existsSync(hypothesesPath))throw new Error('Hypotheses file not found.');
  const hypotheses=JSON.parse(readFileSync(hypothesesPath,'utf8'));
  const candidate=selectCandidate(hypotheses,opts), baseline=loadBaseline(opts.baseline), target=bindCandidate(candidate,baseline);
  const outDir=resolve(opts.out);mkdirSync(outDir,{recursive:true});
  const stamp=new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
  const id=safeId(`exp-${stamp}-${basename(candidate.path).replace(/\.[^.]+$/,'')}`);
  const packet={schemaVersion:1,id,createdAtUtc:new Date().toISOString(),objective:String(opts.objective).trim(),hypothesesFile:hypothesesPath,hypothesesCreatedAtUtc:hypotheses.createdAtUtc??null,candidate:{id:candidate.id,kind:candidate.kind,path:candidate.path,evidenceScore:candidate.evidenceScore,surgeryScore:candidate.surgeryScore,categories:candidate.categories??[],sources:candidate.sources??[],behaviorSourceCount:candidate.behaviorSourceCount??null,liveSourceCount:candidate.liveSourceCount??null,cautions:candidate.cautions??[],evidence:candidate.evidence??[]},baseline:{captureId:baseline.manifest.captureId??null,directory:baseline.dir,createdAtUtc:baseline.manifest.createdAtUtc??null},target,readyForPatchAuthoring:true,note:'This packet binds evidence to a captured target hash. It does not authorize applying a patch.'};
  const patch={schemaVersion:1,id,target:target.relativePath,expectedSha256:target.sha256,mode:opts.mode,note:packet.objective,replacements:opts.mode==='utf8-text'?[{old:'REVIEW_AND_REPLACE_EXACT_OLD_TEXT',new:'REVIEW_AND_REPLACE_EXACT_NEW_TEXT',expectedCount:1}]:[{oldBase64:'UkVWSUVXX0FORF9SRVBMQUNFX01F',newBase64:'UkVWSUVXX0FORF9SRVBMQUNFX01F',expectedCount:1}]};
  writeFileSync(join(outDir,'experiment.json'),JSON.stringify(packet,null,2));
  writeFileSync(join(outDir,'patch.json'),JSON.stringify(patch,null,2));
  const lines=[`# ${id}`,'',`**Objective:** ${packet.objective}`,'',`**Candidate:** \`${candidate.path}\``,'',`**Evidence score:** ${candidate.evidenceScore}; **surgery score:** ${candidate.surgeryScore}.`,`**Sources:** ${(candidate.sources??[]).join(', ')}.`,`**Categories:** ${(candidate.categories??[]).join(', ')}.`,`**Baseline capture:** ${packet.baseline.captureId??'unknown'}.`,`**Target:** \`${target.relativePath}\``,`**Expected SHA-256:** \`${target.sha256}\``,'',...(candidate.cautions?.length?['## Cautions','',...candidate.cautions.map(x=>`- ${x}`),'']:[]),'## Procedure','',`1. Reconfirm the live target still belongs to the same pinned specimen/build.`,`2. Edit \`patch.json\` so the replacement expresses exactly one hypothesis. Do not leave placeholder values.`,`3. Dry-run the guarded patch and review replacement counts plus predicted output hash.`,`4. Apply only after the dry-run is understood.`,`5. Run one controlled before/after observation tied to this objective.`,`6. Recapture/compare the specimen and record the result.`,`7. Roll back unless the next experiment deliberately depends on the modified state.`,'','## Commands','',`
\`\`\`powershell\nnode .\\tools\\specimen\\Apply-SpecimenPatch.mjs --root ${ps(target.root)} --spec ${ps(join(outDir,'patch.json'))}\n# add --apply only after reviewing the dry-run\n\`\`\`\n`];
  writeFileSync(join(outDir,'PACKET.md'),`${lines.join('\n')}\n`);
  process.stdout.write(`${outDir}\n`);
}
try{main();}catch(error){process.stderr.write(`${error?.stack??error}\n`);process.exit(1);}
