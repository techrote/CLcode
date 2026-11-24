import { execFile, execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync, statSync, writeFileSync, renameSync, mkdtempSync, rmSync, openSync, closeSync, accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { dirname, isAbsolute, join, relative, resolve, sep, delimiter } from 'node:path';
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

function envValue(env, key) {
  return Object.entries(env ?? {}).find(([name]) => name.toUpperCase() === key.toUpperCase())?.[1] ?? null;
}

export function resolveExecutable(name, env = process.env, { rejectRoot = null } = {}) {
  if (typeof name !== 'string' || !/^[A-Za-z0-9._-]+$/.test(name)) throw new Error('Executable name is invalid.');
  const pathValue = envValue(env, 'PATH');
  if (!pathValue) throw new Error(`Executable ${name} cannot be resolved because PATH is empty.`);
  const blockedRoot = rejectRoot ? realpathSync(rejectRoot) : null;
  const suffixes = process.platform === 'win32' ? ['.exe'] : [''];
  for (let directory of String(pathValue).split(delimiter)) {
    directory = directory.trim();
    if (directory.startsWith('"') && directory.endsWith('"')) directory = directory.slice(1, -1);
    // Empty and relative PATH elements can resolve through the selected project
    // working directory. They are never eligible for privileged runtime tools.
    if (!directory || !isAbsolute(directory)) continue;
    for (const suffix of suffixes) {
      try {
        const candidate = realpathSync(join(directory, name.endsWith(suffix) ? name : name + suffix));
        if (!statSync(candidate).isFile()) continue;
        if (blockedRoot && inside(blockedRoot, candidate)) continue;
        if (process.platform !== 'win32') accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {}
    }
  }
  throw new Error(`Executable ${name} was not found on an absolute PATH entry outside the selected project.`);
}

export function assertNoExternalGitFilters(gitExecutable, cwd, env = childEnv()) {
  const options = { cwd, windowsHide: true, env, maxBuffer: 16_000_000 };
  const tracked = execFileSync(gitExecutable, ['--no-optional-locks', 'ls-files', '-z'], options);
  if (!tracked?.length) return;
  const output = execFileSync(
    gitExecutable,
    ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'check-attr', '-z', 'filter', '--stdin'],
    { ...options, input: tracked, encoding: 'utf8' },
  );
  const parts = String(output).split('\0');
  for (let i = 0; i + 2 < parts.length; i += 3) {
    const [path, attribute, value] = parts.slice(i, i + 3);
    if (attribute !== 'filter') continue;
    if (value && value !== 'unspecified' && value !== 'unset') {
      throw new Error(`External Git filters are not supported during CLcode qualification: ${path} has filter=${value}.`);
    }
  }
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
    const executable = join(process.env.SystemRoot ?? process.env.WINDIR ?? 'C:\\Windows', 'System32', 'taskkill.exe');
    const killer = execFile(executable, plan.args, { windowsHide: true, env: childEnv() }, () => {});
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
    this.gitExecutable = options.gitExecutable ?? resolveExecutable('git', childEnv(), { rejectRoot: root });
    this.touched = new Map();
  }

  static async create(projectRoot, options = {}) {
    // Admission-time Git probes are still subprocesses controlled by repository
    // configuration (for example core.fsmonitor). Never expose provider/cloud
    // credentials before the ordinary tool subprocess boundary is established.
    const env = childEnv();
    const requested = realpathSync(projectRoot);
    const gitExecutable = resolveExecutable('git', env, { rejectRoot: requested });
    const { stdout } = await execFileAsync(gitExecutable, ['rev-parse', '--show-toplevel'], { cwd: requested, timeout: 10_000, windowsHide: true, env });
    const gitRoot = realpathSync(stdout.trim());
    const sameRoot = process.platform === 'win32' ? gitRoot.toLowerCase() === requested.toLowerCase() : gitRoot === requested;
    if (!sameRoot) throw new Error(`Project root must be the Git top-level directory: ${gitRoot}`);
    if (options.requireClean !== false) {
      const flags = await execFileAsync(gitExecutable, ['ls-files', '-v', '-z'], { cwd: gitRoot, timeout: 10_000, windowsHide: true, encoding: 'utf8', env });
      if (flags.stdout.split('\0').some(entry => /^[a-zS] /.test(entry))) throw new Error('Project index flags hide worktree changes; clear assume-unchanged or skip-worktree before admission.');
      assertNoExternalGitFilters(gitExecutable, gitRoot, env);
      const status = await execFileAsync(gitExecutable, ['--no-optional-locks', '-c', 'core.fsmonitor=false', 'status', '--porcelain=v1', '--untracked-files=all'], { cwd: gitRoot, timeout: 10_000, windowsHide: true, encoding: 'utf8', env });
      if (String(status.stdout ?? '').trim()) throw new Error('Project working tree must be clean before an agent run; commit, stash or discard existing changes first.');
    }
    return new ScopedTools(gitRoot, { ...options, gitExecutable });
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
    if (process.platform === 'win32' && raw.includes(':')) throw new Error('Drive-relative and alternate data stream paths are not permitted.');
    const candidate = resolve(this.projectRoot, raw);
    if (!inside(this.projectRoot, candidate)) throw new Error('Path escapes project root.');
    const metadata = file => relative(this.projectRoot, file).split(sep).some(part => part.replace(/[. ]+$/, '').toLowerCase() === '.git');
    if (metadata(candidate)) throw new Error('Git metadata paths are not project files.');
    if (lstatSync(candidate).isSymbolicLink()) throw new Error('Symbolic-link paths are not editable through this tool.');
    const actual = realpathSync(candidate);
    if (!inside(this.projectRoot, actual)) throw new Error('Resolved path escapes project root.');
    if (metadata(actual)) throw new Error('Git metadata paths are not project files.');
    const info = statSync(actual);
    if (!info.isFile() || info.nlink > 1) throw new Error('Only regular, non-hardlinked project files are supported.');
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
    const info = statSync(file);
    if (info.size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes.`);
    const originalBytes = readFileSync(file);
    if (originalBytes.length > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes.`);
    const original = originalBytes.toString('utf8');
    if (!Buffer.from(original, 'utf8').equals(originalBytes)) throw new Error('File is not lossless UTF-8 text.');
    const matches = original.split(old_text).length - 1;
    if (matches === 0) throw new Error('old_text was not found; re-read the file before editing.');
    if (!replace_all && matches !== 1) throw new Error(`old_text occurs ${matches} times; provide a more specific edit or set replace_all.`);
    const next = replace_all ? original.split(old_text).join(new_text) : original.replace(old_text, () => new_text);
    const intended = Buffer.from(next, 'utf8');
    if (intended.length > MAX_FILE_BYTES) throw new Error(`Edited file exceeds ${MAX_FILE_BYTES} bytes.`);
    const tmp = join(dirname(file), `.${randomBytes(5).toString('hex')}.clcode.tmp`);
    let created = false;
    try {
      const fd = openSync(tmp, 'wx', info.mode);
      created = true;
      try { writeFileSync(fd, intended); } finally { closeSync(fd); }
      if (sha256(readFileSync(file)) !== sha256(originalBytes)) throw new Error('File changed during edit; refusing replacement.');
      renameSync(tmp, file);
    } finally { if (created) rmSync(tmp, { force: true }); }
    const rel = relative(this.projectRoot, file).split(sep).join('/');
    // Record the intended bytes, never a concurrent writer's post-rename bytes.
    this.touched.set(rel, sha256(intended));
    return { ok: true, path: rel, replacements: replace_all ? matches : 1 };
  }

  async runTest(signal) {
    return this.exec(process.execPath, ['--test'], { timeout: this.testTimeoutMs, signal, label: 'node --test' });
  }

  async gitExec(args, options) {
    const hooks = mkdtempSync(join(tmpdir(), 'clcode-empty-hooks-'));
    try {
      return await this.exec(this.gitExecutable, ['-c', 'core.fsmonitor=false', '-c', `core.hooksPath=${hooks}`, '-c', 'commit.gpgsign=false', '--literal-pathspecs', ...args], options);
    } finally { rmSync(hooks, { recursive: true, force: true }); }
  }

  async gitLocal({ action, message }, signal) {
    // .gitattributes and .git/info/attributes can change after admission.
    // Re-check before every Git operation so a clean/smudge driver can never
    // become an implicit executable side channel.
    assertNoExternalGitFilters(this.gitExecutable, this.projectRoot, childEnv());
    if (action === 'status') return this.gitExec(['status', '--short', '--branch'], { timeout: this.toolTimeoutMs, signal, label: 'git status' });
    if (action === 'diff') return this.gitExec(['diff', '--no-ext-diff', '--no-textconv', '--'], { timeout: this.toolTimeoutMs, signal, label: 'git diff' });
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
      return this.gitExec(['commit', '--only', '-m', msg, '--', ...paths], { timeout: this.toolTimeoutMs, signal, label: 'git commit' });
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
