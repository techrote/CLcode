import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/first-windows-check.mjs', import.meta.url));

test('preflight invokes the canonical Node runner directly and propagates its failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'clcode preflight '));
  const write = (rel, text) => {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    git(['init']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost.invalid', 'commit', '--allow-empty', '-m', 'fixture']);
    const sha = git(['rev-parse', 'HEAD']).trim();
    write('docs/FIRST-WINDOWS-COMPONENTS.json', JSON.stringify({ schemaVersion: 1, components: [{ pr: 1, name: 'fixture', sha }] }));
    // No package.json or npm is required to run the canonical Node test script.
    write('scripts/run-tests.mjs', 'process.exit(0);');
    for (const name of ['Test-SpecimenMap', 'Test-AsarMap', 'Test-AsarIntegrity', 'Test-EvidenceFusion', 'Test-RuntimeAnalysis', 'Test-SpecimenPatch', 'Test-LaunchRedaction']) {
      write('tools/specimen/' + name + '.mjs', 'process.exit(0);');
    }
    write('tools/specimen/Test-SpecimenTooling.ps1', 'exit 0');
    const run = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    const passed = run();
    assert.equal(passed.status, 0, passed.stdout + passed.stderr);
    assert.match(passed.stdout, /PASS  Node runtime\/desktop tests/);
    write('scripts/run-tests.mjs', 'process.exit(7);');
    const failed = run();
    assert.equal(failed.status, 1, failed.stdout + failed.stderr);
    assert.match(failed.stdout, /FAIL  Node runtime\/desktop tests/);
    assert.match(failed.stdout, /preflight: FAIL/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
