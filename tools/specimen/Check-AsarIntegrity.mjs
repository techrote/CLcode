#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAsarHeader } from './asar-reader.mjs';
import { readElectronFuses } from './electron-fuses.mjs';
import { readNamedPeResource } from './pe-resources.mjs';

function parseArgs(argv){ const o={}; for(let i=0;i<argv.length;i++){const a=argv[i]; if(a==='--exe')o.exe=argv[++i]; else if(a==='--root')o.root=argv[++i]; else if(a==='--out')o.out=argv[++i]; else if(a==='--help'||a==='-h')o.help=true; else throw new Error(`Unknown argument ${a}`);} if(!o.help&&!o.exe)throw new Error('--exe PATH is required.'); return o; }
function within(root,candidate){const r=relative(root,candidate); return r===''||(!r.startsWith('..')&&!r.startsWith(sep));}
function countMemberIntegrity(node){let n=0;if(node?.integrity)n++;if(node?.files)for(const c of Object.values(node.files))n+=countMemberIntegrity(c);return n;}
function statusOf(fuses,resourceFound){ const integrity=fuses.fuses?.EnableEmbeddedAsarIntegrityValidation?.state??'unknown'; const only=fuses.fuses?.OnlyLoadAppFromAsar?.state??'unknown'; if(integrity==='enabled'&&resourceFound)return only==='enabled'?'enforced+asar-only':'enforced'; if(integrity==='enabled'&&!resourceFound)return 'enabled-but-resource-missing'; if(integrity==='disabled')return resourceFound?'resource-present-fuse-disabled':'disabled'; return resourceFound?'resource-present-fuse-unknown':'unknown'; }

export function inspectAsarIntegrity({exe,root}){
  const exePath=resolve(exe); if(!existsSync(exePath))throw new Error(`Executable not found: ${exePath}`); const appRoot=resolve(root??dirname(exePath));
  const fuses=readElectronFuses(exePath); const pe=readNamedPeResource(exePath,'INTEGRITY','ELECTRONASAR');
  let entries=[],parseError=null;
  if(pe.found){ try { const raw=pe.resources[0].bytes.toString('utf8').replace(/\0+$/,''); const parsed=JSON.parse(raw); if(!Array.isArray(parsed))throw new Error('ElectronAsar resource JSON is not an array.'); entries=parsed; } catch(error){parseError=String(error?.message??error);} }
  const archives=[];
  for(const item of entries){ const file=String(item?.file??''); const alg=String(item?.alg??'').toLowerCase(); const expected=String(item?.value??'').toLowerCase(); let resolved=null,error=null,actual=null,memberIntegrityCount=null,match=null; try { const candidate=resolve(appRoot,...file.replaceAll('\\','/').split('/')); if(isAbsolute(file)&&!within(appRoot,candidate))throw new Error('absolute resource path escapes application root'); if(!within(appRoot,candidate))throw new Error('resource path escapes application root'); resolved=candidate; const info=readAsarHeader(candidate); actual=info.headerSha256.toLowerCase(); memberIntegrityCount=countMemberIntegrity(info.header); match=alg==='sha256'&&/^[a-f0-9]{64}$/.test(expected)&&actual===expected; } catch(e){error=String(e?.message??e);} archives.push({file,alg,expectedHeaderSha256:expected,resolvedPath:resolved,actualHeaderSha256:actual,match,memberIntegrityCount,error}); }
  return {schemaVersion:1,exe:exePath,appRoot,fuses,resource:{found:pe.found,type:'INTEGRITY',name:'ELECTRONASAR',resourceCount:pe.resources.length,parseError},archives,assessment:statusOf(fuses,pe.found),note:'Read-only evidence. Resource presence and header-hash match do not by themselves prove runtime enforcement; fuse state is reported separately.'};
}

async function main(){const o=parseArgs(process.argv.slice(2));if(o.help){process.stdout.write('Usage: node Check-AsarIntegrity.mjs --exe PATH [--root APP_ROOT] [--out FILE]\n');return;}const report=inspectAsarIntegrity(o);const text=JSON.stringify(report,null,2)+'\n';if(o.out)writeFileSync(resolve(o.out),text);else process.stdout.write(text);}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(e=>{process.stderr.write(`${e?.stack??e}\n`);process.exit(1);});
