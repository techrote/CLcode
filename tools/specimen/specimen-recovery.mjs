import { closeSync, fsyncSync, lstatSync, openSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
export const hashBytes = bytes => createHash('sha256').update(bytes).digest('hex');
export function writeExclusiveSynced(file, bytes, mode = 0o600) {
  const fd = openSync(file, 'wx', mode);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
}
// Quiescent disposable specimen only. This is not an OS transaction or ACL backup.
export function replaceVerified(file, expectedHash, bytes) {
  if (lstatSync(file).isSymbolicLink() || realpathSync(file) !== file) throw new Error('Replacement target identity changed.');
  const info = statSync(file);
  if (!info.isFile() || info.nlink !== 1) throw new Error('Replacement requires a regular non-hardlinked file.');
  if (hashBytes(readFileSync(file)) !== expectedHash) throw new Error('Replacement target bytes changed.');
  const temp = join(dirname(file), '.clcode-replace-' + randomBytes(12).toString('hex'));
  let created = false;
  try {
    const fd = openSync(temp, 'wx', info.mode);
    created = true;
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    const current = statSync(file);
    if (lstatSync(file).isSymbolicLink() || realpathSync(file) !== file || current.dev !== info.dev || current.ino !== info.ino || current.nlink !== 1 || hashBytes(readFileSync(file)) !== expectedHash) throw new Error('Replacement target changed before publication.');
    renameSync(temp, file);
    if (hashBytes(readFileSync(file)) !== hashBytes(bytes)) throw new Error('Replacement post-write verification failed; preserve the recovery receipt.');
  } finally { if (created) rmSync(temp, { force: true }); }
}
