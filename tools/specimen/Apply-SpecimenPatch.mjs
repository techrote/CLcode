#!/usr/bin/env node
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { writeExclusiveSynced, replaceVerified } from './specimen-recovery.mjs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { isWithin as within } from './specimen-path-guard.mjs';
import { homedir } from 'node:os';

const sha256 = data => createHash('sha256').update(data).digest('hex');
const safeId = value => String(value ?? 'patch').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'patch';


function parseArgs(argv) {
  const out = { apply: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') out.root = argv[++i];
    else if (a === '--spec') out.spec = argv[++i];
    else if (a === '--lab') out.lab = argv[++i];
    else if (a === '--apply') out.apply = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument ${a}`);
  }
  return out;
}

function countBuffer(haystack, needle) {
  if (!needle.length) throw new Error('Binary oldBase64 sequence must not be empty.');
  let count = 0, at = 0;
  while ((at = haystack.indexOf(needle, at)) >= 0) { count++; at += needle.length; }
  return count;
}

function replaceBuffer(haystack, needle, replacement) {
  const chunks = [];
  let at = 0, next;
  while ((next = haystack.indexOf(needle, at)) >= 0) {
    chunks.push(haystack.subarray(at, next), replacement);
    at = next + needle.length;
  }
  chunks.push(haystack.subarray(at));
  return Buffer.concat(chunks);
}

function patchUtf8(original, replacements) {
  const text = original.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(original)) throw new Error('Target is not lossless UTF-8; use binary-exact mode or choose a text file.');
  let next = text;
  const results = [];
  for (const [index, item] of replacements.entries()) {
    const oldText = String(item.old ?? '');
    const newText = String(item.new ?? '');
    if (!oldText) throw new Error(`Replacement ${index} old text must be non-empty.`);
    const expectedCount = Number(item.expectedCount ?? 1);
    if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 10000) throw new Error(`Replacement ${index} expectedCount must be 1..10000.`);
    const actualCount = next.split(oldText).length - 1;
    if (actualCount !== expectedCount) throw new Error(`Replacement ${index} expected ${expectedCount} matches but found ${actualCount}.`);
    next = next.split(oldText).join(newText);
    results.push({ index, expectedCount, actualCount, beforeChars: oldText.length, afterChars: newText.length });
  }
  return { buffer: Buffer.from(next, 'utf8'), results };
}

function patchBinary(original, replacements) {
  let next = Buffer.from(original);
  const results = [];
  for (const [index, item] of replacements.entries()) {
    const oldBytes = Buffer.from(String(item.oldBase64 ?? ''), 'base64');
    const newBytes = Buffer.from(String(item.newBase64 ?? ''), 'base64');
    if (!oldBytes.length) throw new Error(`Replacement ${index} oldBase64 decodes to zero bytes.`);
    if (oldBytes.length !== newBytes.length) throw new Error(`Replacement ${index} binary-exact mode requires equal byte lengths.`);
    const expectedCount = Number(item.expectedCount ?? 1);
    if (!Number.isInteger(expectedCount) || expectedCount < 1 || expectedCount > 10000) throw new Error(`Replacement ${index} expectedCount must be 1..10000.`);
    const actualCount = countBuffer(next, oldBytes);
    if (actualCount !== expectedCount) throw new Error(`Replacement ${index} expected ${expectedCount} matches but found ${actualCount}.`);
    next = replaceBuffer(next, oldBytes, newBytes);
    results.push({ index, expectedCount, actualCount, bytes: oldBytes.length });
  }
  return { buffer: next, results };
}

function resolveTarget(root, target) {
  if (typeof target !== 'string' || !target.trim()) throw new Error('Patch spec target must be a non-empty relative path.');
  if (isAbsolute(target) || (process.platform === 'win32' && target.includes(':'))) throw new Error('Patch target must be a safe relative path under --root.');
  const candidate = resolve(root, target);
  if (!within(root, candidate)) throw new Error('Patch target escapes specimen root.');
  if (!existsSync(candidate) || !statSync(candidate).isFile()) throw new Error(`Patch target is not an existing file: ${target}`);
  if (lstatSync(candidate).isSymbolicLink()) throw new Error('Patch target may not be a symbolic link.');
  const realRoot = realpathSync(root);
  const actual = realpathSync(candidate);
  if (!within(realRoot, actual)) throw new Error('Resolved patch target escapes specimen root through a symbolic link.');
  if (statSync(actual).nlink !== 1) throw new Error('Patch target must not have hard-link aliases.');
  return actual;
}

function validateSpec(spec) {
  if (spec?.schemaVersion !== 1) throw new Error('Patch spec schemaVersion must be 1.');
  if (!/^[a-f0-9]{64}$/i.test(String(spec.expectedSha256 ?? ''))) throw new Error('Patch spec expectedSha256 must be a 64-character SHA-256 hex string.');
  if (!['utf8-text', 'binary-exact'].includes(spec.mode)) throw new Error('Patch spec mode must be utf8-text or binary-exact.');
  if (!Array.isArray(spec.replacements) || spec.replacements.length < 1 || spec.replacements.length > 100) throw new Error('Patch spec replacements must contain 1..100 entries.');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write('Usage: node Apply-SpecimenPatch.mjs --root PATH --spec PATCH.json [--lab PATH] [--apply]\nWithout --apply the command is a dry-run.\n');
    return;
  }
  if (!opts.root || !opts.spec) throw new Error('--root and --spec are required.');
  const rootInput = resolve(opts.root);
  if (!existsSync(rootInput) || !statSync(rootInput).isDirectory()) throw new Error(`Specimen root is not a directory: ${rootInput}`);
  const root = realpathSync(rootInput);
  const specPath = resolve(opts.spec);
  const specBytes = readFileSync(specPath);
  const spec = JSON.parse(specBytes.toString('utf8'));
  validateSpec(spec);
  const target = resolveTarget(root, spec.target);
  const original = readFileSync(target);
  const beforeSha256 = sha256(original);
  if (beforeSha256.toLowerCase() !== String(spec.expectedSha256).toLowerCase()) throw new Error(`Target SHA-256 mismatch: expected ${spec.expectedSha256}, got ${beforeSha256}.`);
  const patched = spec.mode === 'utf8-text' ? patchUtf8(original, spec.replacements) : patchBinary(original, spec.replacements);
  const afterSha256 = sha256(patched.buffer);
  if (afterSha256 === beforeSha256) throw new Error('Patch produced no byte change.');
  const plan = {
    schemaVersion: 1,
    patchId: safeId(spec.id ?? basename(specPath, '.json')),
    root,
    target: spec.target,
    targetAbsolute: target,
    mode: spec.mode,
    beforeSha256,
    afterSha256,
    beforeBytes: original.length,
    afterBytes: patched.buffer.length,
    replacements: patched.results,
    note: String(spec.note ?? ''),
    dryRun: !opts.apply,
  };
  if (!opts.apply) {
    process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    return;
  }

  const lab = resolve(opts.lab ?? join(process.env.USERPROFILE || process.env.HOME || homedir(), 'clcode-specimen-lab'));
  if (within(root, lab)) throw new Error('Recovery lab must be outside the specimen root.');
  mkdirSync(lab, { recursive: true });
  const realLab = realpathSync(lab);
  if (within(root, realLab)) throw new Error('Recovery lab resolves inside the specimen root.');
  const parent = join(realLab, 'patches');
  mkdirSync(parent, { recursive: true });
  if (!within(realLab, realpathSync(parent))) throw new Error('Recovery directory resolves outside the lab.');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const patchDir = join(realpathSync(parent), stamp + '-' + plan.patchId + '-' + randomBytes(6).toString('hex'));
  mkdirSync(patchDir);
  const backup = join(patchDir, 'original.bin');
  const receiptPath = join(patchDir, 'receipt.json');
  writeExclusiveSynced(backup, original);
  if (sha256(readFileSync(backup)) !== beforeSha256) throw new Error('Backup verification failed.');
  writeExclusiveSynced(join(patchDir, 'patch-spec.json'), specBytes);
  const receipt = {
    ...plan, dryRun: false, patchDir, backup, specPath, specSha256: sha256(specBytes),
    state: 'prepared', preparedAtUtc: new Date().toISOString(), appliedAtUtc: null, rolledBackAtUtc: null,
  };
  const preparedBytes = Buffer.from(JSON.stringify(receipt, null, 2));
  writeExclusiveSynced(receiptPath, preparedBytes);
  if (!readFileSync(receiptPath).equals(preparedBytes)) throw new Error('Prepared receipt verification failed.');
  if (resolveTarget(root, spec.target) !== target) throw new Error('Patch target identity changed after preparation.');
  replaceVerified(target, beforeSha256, patched.buffer);
  const applied = { ...receipt, state: 'applied', appliedAtUtc: new Date().toISOString() };
  replaceVerified(receiptPath, sha256(preparedBytes), Buffer.from(JSON.stringify(applied, null, 2)));
  process.stdout.write(receiptPath + '\n');
}

main().catch(error => { process.stderr.write(`${error?.stack ?? error}\n`); process.exit(1); });
