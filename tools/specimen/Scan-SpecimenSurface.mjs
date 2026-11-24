#!/usr/bin/env node
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const here = resolve(fileURLToPath(new URL('.', import.meta.url)));
const DEFAULT_PATTERNS = join(here, 'specimen-patterns.json');
const DEFAULT_MAX_FILE = 128 * 1024 * 1024;
const DEFAULT_CONTEXT = 96;
const DEFAULT_MAX_HITS_PER_FILE = 80;
const SKIP_DIRS = new Set(['cache', 'code cache', 'gpucache', 'shadercache', 'crashpad', 'logs', 'log']);
const SPECIAL_NAMES = [/\.asar$/i, /claude.*\.(exe|dll|node)$/i, /claude-code/i, /resources\.pak$/i, /package\.json$/i, /manifest\.json$/i, /preload/i];

function parseArgs(argv) {
  const out = { roots: [], maxFileBytes: DEFAULT_MAX_FILE, contextChars: DEFAULT_CONTEXT, maxHitsPerFile: DEFAULT_MAX_HITS_PER_FILE };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') out.roots.push(argv[++i]);
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--patterns') out.patterns = argv[++i];
    else if (arg === '--max-file-mb') out.maxFileBytes = Math.round(Number(argv[++i]) * 1024 * 1024);
    else if (arg === '--context') out.contextChars = Number(argv[++i]);
    else if (arg === '--max-hits-per-file') out.maxHitsPerFile = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') out.help = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (!out.help && !out.roots.length) throw new Error('At least one --root PATH is required.');
  if (!(out.maxFileBytes > 0) || !Number.isFinite(out.maxFileBytes)) throw new Error('--max-file-mb must be positive.');
  if (!Number.isInteger(out.contextChars) || out.contextChars < 24 || out.contextChars > 400) throw new Error('--context must be 24..400.');
  if (!Number.isInteger(out.maxHitsPerFile) || out.maxHitsPerFile < 1 || out.maxHitsPerFile > 1000) throw new Error('--max-hits-per-file must be 1..1000.');
  return out;
}

function usage() {
  return `Usage: node scan-specimen-surface.mjs --root PATH [--root PATH2] [--out DIR] [--patterns FILE]\n\n` +
    `Read-only specimen string/surface scanner. Outputs metadata, hashes, ranked candidates and short redacted snippets; never copies source files.\n`;
}

function loadCatalog(path) {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  if (!parsed?.categories || typeof parsed.categories !== 'object') throw new Error('Pattern catalog must contain categories.');
  const entries = [];
  for (const [category, patterns] of Object.entries(parsed.categories)) {
    if (!Array.isArray(patterns)) continue;
    for (const pattern of patterns) {
      const text = String(pattern).trim();
      if (text) entries.push({ category, pattern: text, needle: text.toLowerCase() });
    }
  }
  if (!entries.length) throw new Error('Pattern catalog contains no patterns.');
  return { schemaVersion: parsed.schemaVersion ?? 1, entries, categories: Object.keys(parsed.categories) };
}

function sanitize(text) {
  let out = String(text ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ' ');
  out = out.replace(/Bearer\s+[A-Za-z0-9._~+\/-]{8,}/gi, 'Bearer [redacted]');
  out = out.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-[redacted]');
  out = out.replace(/(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization)["']?\s*[:=]\s*["']?)[^\s,"'}]{6,}/gi, '$1[redacted]');
  return out.replace(/\s+/g, ' ').trim();
}

function isWithin(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep));
}

function enumerate(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (!isWithin(root, full)) continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name.toLowerCase())) stack.push(full);
      } else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

function candidateSpecial(rel) {
  return SPECIAL_NAMES.some(re => re.test(rel));
}

async function hashFile(file) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolveHash(hash.digest('hex')));
  });
}

function findHits(text, entries, encoding, contextChars, seen, limit) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const item of entries) {
    let start = 0;
    while (hits.length < limit) {
      const at = lower.indexOf(item.needle, start);
      if (at < 0) break;
      const before = Math.max(0, at - contextChars);
      const after = Math.min(text.length, at + item.pattern.length + contextChars);
      const snippet = sanitize(text.slice(before, after));
      const key = `${item.category}\u0000${item.pattern.toLowerCase()}\u0000${snippet.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        hits.push({ category: item.category, pattern: item.pattern, encoding, offsetApprox: at, snippet });
      }
      start = at + Math.max(1, item.needle.length);
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

async function scanFile(root, file, catalog, opts) {
  const st = statSync(file);
  const rel = relative(root, file).split(sep).join('/');
  const special = candidateSpecial(rel);
  const base = { root, relativePath: rel, size: st.size, extension: extname(file).toLowerCase(), special, skipped: null, sha256: null, hits: [] };
  if (st.size > opts.maxFileBytes) {
    base.skipped = `size>${opts.maxFileBytes}`;
    return base;
  }
  let buffer;
  try { buffer = readFileSync(file); }
  catch (error) { base.skipped = `read:${error.code ?? 'error'}`; return base; }
  base.sha256 = createHash('sha256').update(buffer).digest('hex');
  const seen = new Set();
  const decodings = [
    ['utf8', buffer.toString('utf8')],
    ['latin1', buffer.toString('latin1')],
  ];
  if (buffer.length >= 4) decodings.push(['utf16le', buffer.subarray(0, buffer.length - (buffer.length % 2)).toString('utf16le')]);
  for (const [encoding, text] of decodings) {
    if (base.hits.length >= opts.maxHitsPerFile) break;
    base.hits.push(...findHits(text, catalog.entries, encoding, opts.contextChars, seen, opts.maxHitsPerFile - base.hits.length));
  }
  return base;
}

function scoreFile(file) {
  const categories = new Set(file.hits.map(h => h.category));
  const patterns = new Set(file.hits.map(h => `${h.category}:${h.pattern.toLowerCase()}`));
  return file.hits.length + categories.size * 4 + patterns.size * 2 + (file.special ? 5 : 0);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(usage()); return; }
  const roots = opts.roots.map(p => resolve(p));
  for (const root of roots) if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error(`Root is not a directory: ${root}`);
  const catalogPath = resolve(opts.patterns ?? DEFAULT_PATTERNS);
  const catalog = loadCatalog(catalogPath);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const outDir = resolve(opts.out ?? join(process.env.USERPROFILE || process.env.HOME || homedir(), 'clcode-specimen-lab', 'maps', `map-${stamp}-${randomBytes(3).toString('hex')}`));
  mkdirSync(outDir, { recursive: true });
  const hitsStream = createWriteStream(join(outDir, 'hits.jsonl'), { encoding: 'utf8' });
  const files = [];
  let totalFiles = 0;
  let scannedFiles = 0;
  let skippedFiles = 0;
  for (const root of roots) {
    for (const file of enumerate(root)) {
      totalFiles++;
      const result = await scanFile(root, file, catalog, opts);
      if (result.skipped) skippedFiles++; else scannedFiles++;
      if (result.special || result.hits.length) {
        result.score = scoreFile(result);
        files.push(result);
        for (const hit of result.hits) hitsStream.write(`${JSON.stringify({ root, relativePath: result.relativePath, sha256: result.sha256, size: result.size, ...hit })}\n`);
      }
    }
  }
  await new Promise(resolveDone => hitsStream.end(resolveDone));
  files.sort((a, b) => b.score - a.score || a.relativePath.localeCompare(b.relativePath));
  const categoryCounts = {};
  for (const category of catalog.categories) categoryCounts[category] = 0;
  for (const file of files) for (const hit of file.hits) categoryCounts[hit.category] = (categoryCounts[hit.category] ?? 0) + 1;
  const map = {
    schemaVersion: 1,
    createdAtUtc: new Date().toISOString(),
    roots,
    patternCatalog: catalogPath,
    maxFileBytes: opts.maxFileBytes,
    contextChars: opts.contextChars,
    totalFiles,
    scannedFiles,
    skippedFiles,
    candidateFiles: files.length,
    categoryCounts,
    candidates: files.map(file => ({
      root: file.root,
      relativePath: file.relativePath,
      size: file.size,
      extension: file.extension,
      special: file.special,
      skipped: file.skipped,
      sha256: file.sha256,
      score: file.score,
      categories: [...new Set(file.hits.map(h => h.category))],
      distinctPatterns: [...new Set(file.hits.map(h => h.pattern))],
      hitCount: file.hits.length,
    })),
    note: 'No specimen files are copied. hits.jsonl contains only short redacted matching snippets plus file metadata/hashes. Do not point this scanner at credential/user-data directories.',
  };
  writeFileSync(join(outDir, 'map.json'), JSON.stringify(map, null, 2));
  const csv = ['score,relativePath,size,sha256,categories,patterns,hitCount,special'];
  const q = value => `"${String(value ?? '').replaceAll('"', '""')}"`;
  for (const row of map.candidates) csv.push([row.score,q(row.relativePath),row.size,row.sha256 ?? '',q(row.categories.join('|')),q(row.distinctPatterns.join('|')),row.hitCount,row.special].join(','));
  writeFileSync(join(outDir, 'candidates.csv'), `${csv.join('\n')}\n`);
  process.stdout.write(`${outDir}\n`);
}

main().catch(error => { process.stderr.write(`${error?.stack ?? error}\n`); process.exit(1); });
