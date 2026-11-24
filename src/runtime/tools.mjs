import { execFile } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const MAX_FILE_BYTES = 512_000;
const MAX_OUTPUT = 200_000;

// Child tools execute project code and local Git, so they must not inherit the
// runtime/provider credential environment. This is an environment boundary only;
// it is not an OS/network sandbox.
const CHILD_ENV_ALLOWLIST = new Set([
  'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC',
  'TEMP', 'TMP', 'TMPDIR',
  'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH',
  'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM', 'COLORTERM', 'NO_COLOR', 'NODE_ENV',
  'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL',
]);

export function childEnv(env = process.env) {
  const out = {};
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && CHILD_ENV_ALLOWLIST.has(name.toUpperCase())) out[name] = value;
  }
  return out;
}

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

function cleanText(value, max = MAX_OUTPUT) {
  const text = String(value ?? '');
  return text.length <= max ? text : `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

function sha256(data) { return createHash('sha256').update(data).digest('hex'); }

export function terminationPlan(platform, pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) <= 0) return null;
  return platform === 'win32'
    ? { file: 'taskkill', args: ['/PID', String(pid), '/T', '/F'] }
    : { signal: 'SIGTERM' };
}

function terminateProcessTree(child) {
  if (!child?.pid || child.exitCode !== null) return;
  const plan = terminationPlan(process.platform, child.pid);
  if (!plan) return;
  if (plan.file) {
    const killer = execFile(plan.file, plan.args, { windowsHide: true }, () => {});
    killer.once('error', () => { try { child.kill(); } catch {} });
  } else {
    try { child.kill(plan.signal); } catch {}
  }
}

export class ScopedTools {
  constructor(projectRoot, options = {}) {
    if (!projectRoot) throw new Error('projectRoot is required.');
    const root = realpathSync(projectRoot);
    this.projectRoot = root;
    this.testTimeoutMs = options.testTimeoutMs ?? 90_000;
    this.toolTimeoutMs = options.toolTimeoutMs ?? 30_000;
    this.touched = new Map();
  }

  static async create(projectRoot, options = {}) {
    // Admission-time Git probes are still subprocesses controlled by repository
    // configuration (for example core.fsmonitor). Never expose provider/cloud
    // credentials before the ordinary tool subprocess boundary is established.
    const env = childEnv();
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], { cwd: projectRoot, timeout: 10_000, windowsHide: true, env });
    const gitRoot = realpathSync(stdout.trim());
    const requested = realpathSync(projectRoot);
    const sameRoot = process.platform === 'win32' ? gitRoot.toLowerCase() === requested.toLowerCase() : gitRoot === requested;
    if (!sameRoot) throw new Error(`Project root must be the Git top-level directory: ${gitRoot}`);
    if (options.requireClean !== false) {
      const status = await execFileAsync('git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: gitRoot, timeout: 10_000, windowsHide: true, encoding: 'utf8', env });
      if (String(status.stdout ?? '').trim()) throw new Error('Project working tree must be clean before an agent run; commit, stash or discard existing changes first.');
    }
    return new ScopedTools(gitRoot, options);
  }

  schemas() {
    return [
      {
        type: 'function', name: 'read_file', description: 'Read one UTF-8 text file inside the selected project root.',
        parameters: { type: 'object', additionalProperties: false, properties: { path: { type: 'string' } }, required: ['path'] },
      },
      {
        type: 'function', name: 'edit_file', description: 'Replace exact text in one existing project file. By default old_text must occur exactly once.',
        parameters: { type: 'object', additionalProperties: false, properties: {
          path: { type: 'string' }, old_text: { type: 'string' }, new_text: { type: 'string' }, replace_all: { type: 'boolean' },
        }, required: ['path', 'old_text', 'new_text'] },
      },
      {
        type: 'function', name: 'run_test', description: 'Run the fixed project test command: node --test. No arbitrary command is accepted.',
        parameters: { type: 'object', additionalProperties: false, properties: {} },
      },
      {
        type: 'function', name: 'git_local', description: 'Inspect or commit local Git state. No remote operations are available.',
        parameters: { type: 'object', additionalProperties: false, properties: {
          action: { type: 'string', enum: ['status', 'diff', 'commit'] },
          message: { type: 'string', maxLength: 160 },
        }, required: ['action'] },
      },
    ];
  }

  resolveExisting(path) {
    if (typeof path !== 'string' || !path.trim()) throw new Error('path must be non-empty text.');
    const raw = path.trim();
    if (isAbsolute(raw)) throw new Error('Absolute paths are not permitted.');
    const candidate = resolve(this.projectRoot, raw);
    if (!inside(this.projectRoot, candidate)) throw new Error('Path escapes project root.');
    if (lstatSync(candidate).isSymbolicLink()) throw new Error('Symbolic-link paths are not editable through this tool.');
    const actual = realpathSync(candidate);
    if (!inside(this.projectRoot, actual)) throw new Error('Resolved path escapes project root.');
    return actual;
  }

  async execute(name, args = {}, options = {}) {
    switch (name) {
      case 'read_file': return this.readFile(args);
      case 'edit_file': return this.editFile(args);
      case 'run_test': return this.runTest(options.signal);
      case 'git_local': return this.gitLocal(args, options.signal);
      default: throw new Error(`Unknown tool ${String(name).slice(0, 80)}.`);
    }
  }

  readFile({ path }) {
    const file = this.resolveExisting(path);
    const size = statSync(file).size;
    if (size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes.`);
    return { ok: true, path: relative(this.projectRoot, file).split(sep).join('/'), content: readFileSync(file, 'utf8') };
  }

  editFile({ path, old_text, new_text, replace_all = false }) {
    if (typeof old_text !== 'string' || !old_text.length) throw new Error('old_text must be non-empty.');
    if (typeof new_text !== 'string') throw new Error('new_text must be text.');
    const file = this.resolveExisting(path);
    const original = readFileSync(file, 'utf8');
    const matches = original.split(old_text).length - 1;
    if (matches === 0) throw new Error('old_text was not found; re-read the file before editing.');
    if (!replace_all && matches !== 1) throw new Error(`old_text occurs ${matches} times; provide a more specific edit or set replace_all.`);
    const next = replace_all ? original.split(old_text).join(new_text) : original.replace(old_text, new_text);
    const tmp = join(dirname(file), `.${randomBytes(5).toString('hex')}.clcode.tmp`);
    writeFileSync(tmp, next, { encoding: 'utf8', mode: statSync(file).mode });
    renameSync(tmp, file);
    const rel = relative(this.projectRoot, file).split(sep).join('/');
    this.touched.set(rel, sha256(readFileSync(file)));
    return { ok: true, path: rel, replacements: replace_all ? matches : 1 };
  }

  async runTest(signal) {
    return this.exec(process.execPath, ['--test'], { timeout: this.testTimeoutMs, signal, label: 'node --test' });
  }

  async gitLocal({ action, message }, signal) {
    if (action === 'status') return this.exec('git', ['status', '--short', '--branch'], { timeout: this.toolTimeoutMs, signal, label: 'git status' });
    if (action === 'diff') return this.exec('git', ['diff', '--no-ext-diff', '--'], { timeout: this.toolTimeoutMs, signal, label: 'git diff' });
    if (action === 'commit') {
      const msg = String(message ?? '').trim();
      if (!msg || msg.length > 160) throw new Error('commit message must be 1..160 characters.');
      const paths = [...this.touched.keys()];
      if (!paths.length) throw new Error('No CLcode-edited files are available to commit.');
      for (const rel of paths) {
        const file = this.resolveExisting(rel);
        const expected = this.touched.get(rel);
        const current = sha256(readFileSync(file));
        if (current !== expected) throw new Error(`Refusing commit: ${rel} changed after CLcode's last edit.`);
      }
      return this.exec('git', ['commit', '--only', '-m', msg, '--', ...paths], { timeout: this.toolTimeoutMs, signal, label: 'git commit' });
    }
    throw new Error('Unsupported git_local action.');
  }

  async exec(file, args, { timeout, signal, label }) {
    if (signal?.aborted) return { ok: false, command: label, exitCode: null, stdout: '', stderr: '', error: 'Operation aborted before process start.', aborted: true, timedOut: false };
    return new Promise(resolveResult => {
      let aborted = false;
      let timedOut = false;
      let settled = false;
      const child = execFile(file, args, {
        cwd: this.projectRoot, windowsHide: true, maxBuffer: MAX_OUTPUT,
        encoding: 'utf8', env: childEnv(),
      }, (error, stdout, stderr) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener?.('abort', onAbort);
        if (!error) {
          resolveResult({ ok: true, command: label, exitCode: 0, stdout: cleanText(stdout), stderr: cleanText(stderr) });
          return;
        }
        const exitCode = Number.isInteger(error?.code) ? error.code : null;
        resolveResult({
          ok: false, command: label, exitCode,
          stdout: cleanText(stdout ?? error?.stdout), stderr: cleanText(stderr ?? error?.stderr),
          error: String(error?.message ?? error).slice(0, 600),
          aborted, timedOut,
        });
      });
      const onAbort = () => { aborted = true; terminateProcessTree(child); };
      signal?.addEventListener?.('abort', onAbort, { once: true });
      const timer = setTimeout(() => { timedOut = true; terminateProcessTree(child); }, timeout);
      timer.unref?.();
    });
  }
}
