import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/create-fixture.mjs', import.meta.url));

test('fixture creation refuses an existing destination without deleting its contents', () => {
  const root = mkdtempSync(join(tmpdir(), 'clcode-fixture-guard-'));
  try {
    const dest = join(root, 'existing fixture');
    mkdirSync(dest);
    const marker = join(dest, 'keep.txt');
    writeFileSync(marker, 'preserve me');
    const result = spawnSync(process.execPath, [script, dest], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(marker, 'utf8'), 'preserve me');
    const fresh = join(root, 'fresh fixture');
    const created = spawnSync(process.execPath, [script, fresh], { encoding: 'utf8' });
    assert.equal(created.status, 0, created.stderr);
    const rerun = spawnSync(process.execPath, [script, fresh], { encoding: 'utf8' });
    assert.notEqual(rerun.status, 0);
    assert.match(readFileSync(join(fresh, 'src', 'slug.mjs'), 'utf8'), /slugify/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
