#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { isWithin } from './specimen-path-guard.mjs';
import { createHash } from 'node:crypto';

function parse(argv) {
  const out = { mode: 'utf8-text' };
  for (let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(a==='--root') out.root=argv[++i]; else if(a==='--target') out.target=argv[++i]; else if(a==='--out') out.out=argv[++i]; else if(a==='--mode') out.mode=argv[++i]; else throw new Error(`Unknown argument ${a}`);
  }
  return out;
}
const opts=parse(process.argv.slice(2));
if(!opts.root||!opts.target||!opts.out) throw new Error('Usage: node New-SpecimenPatchSpec.mjs --root PATH --target RELATIVE --out SPEC.json [--mode utf8-text|binary-exact]');
if(!['utf8-text','binary-exact'].includes(opts.mode)) throw new Error('Invalid mode.');
const rootInput=resolve(opts.root); if(!existsSync(rootInput)||!statSync(rootInput).isDirectory()) throw new Error('Invalid root.'); const root=realpathSync(rootInput);
if(isAbsolute(opts.target)) throw new Error('Target must be relative.');
const file=resolve(root,opts.target); if(!isWithin(root,file)) throw new Error('Target escapes root.');
if(!existsSync(file)||!statSync(file).isFile()||lstatSync(file).isSymbolicLink()) throw new Error('Target must be an existing non-symlink file.');
const actual=realpathSync(file); if(!isWithin(root,actual)) throw new Error('Resolved target escapes root through a symbolic link.');
const bytes=readFileSync(actual); const hash=createHash('sha256').update(bytes).digest('hex');
const spec={schemaVersion:1,id:'describe-this-experiment',target:opts.target.split('\\').join('/'),expectedSha256:hash,mode:opts.mode,note:'Describe the single hypothesis this patch tests.',replacements:opts.mode==='utf8-text'?[{old:'EXACT OLD TEXT',new:'EXACT NEW TEXT',expectedCount:1}]:[{oldBase64:'',newBase64:'',expectedCount:1}]};
writeFileSync(resolve(opts.out),JSON.stringify(spec,null,2));
process.stdout.write(`${resolve(opts.out)}\n`);
