import path from 'node:path';

// On Windows relative() returns an absolute path when drives/shares differ.
// Checking only the leading separator misses drive-qualified absolute paths.
export function isWithin(root, candidate, paths = path) {
  const rel = paths.relative(root, candidate);
  return rel === '' || (!paths.isAbsolute(rel) && rel !== '..' && !rel.startsWith('..' + paths.sep));
}
