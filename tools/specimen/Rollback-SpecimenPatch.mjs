#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { replaceVerified, writeExclusiveSynced } from './specimen-recovery.mjs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { isWithin as within } from './specimen-path-guard.mjs';

const sha256 = data => createHash('sha256').update(data).digest('hex');

const arg = process.argv[2];
if (!arg) throw new Error('Usage: node Rollback-SpecimenPatch.mjs PATH_TO_RECEIPT_OR_PATCH_DIR');
const input = resolve(arg);
const receiptPath = realpathSync(statSync(input).isDirectory() ? join(input, 'receipt.json') : input);
if (!existsSync(receiptPath)) throw new Error(`Receipt not found: ${receiptPath}`);
const receiptBytes = readFileSync(receiptPath);
const receipt = JSON.parse(receiptBytes.toString('utf8'));
if (receipt.schemaVersion !== 1 || !receipt.targetAbsolute || !receipt.backup) throw new Error('Invalid patch receipt.');
if (receipt.rolledBackAtUtc) throw new Error(`Patch was already rolled back at ${receipt.rolledBackAtUtc}.`);
if (!existsSync(receipt.targetAbsolute) || !existsSync(receipt.backup)) throw new Error('Target or backup is missing.');
const realRoot = realpathSync(receipt.root);
const realTarget = realpathSync(receipt.targetAbsolute);
const realBackup = realpathSync(receipt.backup);
if (!within(realRoot, realTarget) || realTarget !== realpathSync(resolve(realRoot, receipt.target)) || realTarget !== receipt.targetAbsolute || lstatSync(receipt.targetAbsolute).isSymbolicLink() || statSync(realTarget).nlink !== 1) throw new Error('Receipt target identity or containment changed.');
if (!within(dirname(receiptPath), realBackup)) throw new Error('Receipt backup resolves outside patch receipt directory.');
const current = readFileSync(realTarget);
const currentSha = sha256(current);
if (currentSha !== receipt.afterSha256 && currentSha !== receipt.beforeSha256) throw new Error(`Refusing rollback: current target SHA-256 ${currentSha} matches neither recorded state.`);
const original = readFileSync(realBackup);
const originalSha = sha256(original);
if (originalSha !== receipt.beforeSha256) throw new Error(`Backup SHA-256 ${originalSha} does not match receipt beforeSha256 ${receipt.beforeSha256}.`);
if (currentSha === receipt.afterSha256) replaceVerified(realTarget, currentSha, original);
const restoredSha = sha256(readFileSync(realTarget));
if (restoredSha !== receipt.beforeSha256) throw new Error('Rollback verification failed.');
const next = { ...receipt, state: 'rolled_back', rolledBackAtUtc: new Date().toISOString(), rollbackVerifiedSha256: restoredSha };
replaceVerified(receiptPath, sha256(receiptBytes), Buffer.from(JSON.stringify(next, null, 2)));
writeExclusiveSynced(join(dirname(receiptPath), 'rollback.json'), JSON.stringify({ rolledBackAtUtc: next.rolledBackAtUtc, target: receipt.target, restoredSha256: restoredSha }, null, 2));
process.stdout.write(`${receiptPath}\n`);
