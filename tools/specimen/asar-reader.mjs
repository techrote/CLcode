import { closeSync, openSync, readFileSync, readSync, realpathSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

const MAX_HEADER_BYTES = 64 * 1024 * 1024;

function inside(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep));
}

export function readAsarHeader(archive) {
  const file = resolve(archive);
  const st = statSync(file);
  if (!st.isFile()) throw new Error(`ASAR path is not a file: ${file}`);
  if (st.size < 16) throw new Error('ASAR archive is too small to contain a Pickle header.');
  const fd = openSync(file, 'r');
  try {
    const sizePickle = Buffer.alloc(8);
    if (readSync(fd, sizePickle, 0, 8, 0) !== 8) throw new Error('Unable to read ASAR size Pickle.');
    const sizePayload = sizePickle.readUInt32LE(0);
    const headerPickleSize = sizePickle.readUInt32LE(4);
    if (sizePayload < 4 || sizePayload > 64) throw new Error(`Unexpected ASAR size Pickle payload: ${sizePayload}.`);
    if (headerPickleSize < 8 || headerPickleSize > MAX_HEADER_BYTES || headerPickleSize > st.size - 8) {
      throw new Error(`Invalid ASAR header Pickle size: ${headerPickleSize}.`);
    }
    const rawHeader = Buffer.alloc(headerPickleSize);
    if (readSync(fd, rawHeader, 0, headerPickleSize, 8) !== headerPickleSize) throw new Error('Unable to read complete ASAR header Pickle.');
    const payloadSize = rawHeader.readUInt32LE(0);
    const jsonLength = rawHeader.readUInt32LE(4);
    if (payloadSize < 4 || payloadSize > headerPickleSize - 4) throw new Error(`Invalid ASAR header payload size: ${payloadSize}.`);
    if (jsonLength < 2 || jsonLength > payloadSize - 4 || 8 + jsonLength > rawHeader.length) throw new Error(`Invalid ASAR JSON header length: ${jsonLength}.`);
    const jsonText = rawHeader.subarray(8, 8 + jsonLength).toString('utf8');
    let header;
    try { header = JSON.parse(jsonText); }
    catch (error) { throw new Error(`Invalid ASAR JSON header: ${error.message}`); }
    if (!header || typeof header !== 'object' || !header.files || typeof header.files !== 'object') throw new Error('ASAR header does not contain a files tree.');
    return {
      archive: file,
      archiveSize: st.size,
      headerPickleSize,
      dataOffset: 8 + headerPickleSize,
      headerSha256: createHash('sha256').update(rawHeader).digest('hex'),
      header,
    };
  } finally { closeSync(fd); }
}

function walkNode(node, path, out) {
  if (node?.files && typeof node.files === 'object') {
    for (const [name, child] of Object.entries(node.files)) {
      const next = path ? `${path}/${name}` : name;
      walkNode(child, next, out);
    }
    return;
  }
  if (node?.link !== undefined) {
    out.push({ path, type: 'link', link: String(node.link), size: 0, unpacked: false, offset: null, integrity: node.integrity ?? null });
    return;
  }
  if (node?.size !== undefined) {
    const size = Number(node.size);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`Invalid ASAR member size for ${path}.`);
    const offset = node.unpacked ? null : String(node.offset ?? '');
    if (!node.unpacked && !/^\d+$/.test(offset)) throw new Error(`Invalid ASAR member offset for ${path}.`);
    out.push({ path, type: 'file', size, unpacked: Boolean(node.unpacked), offset, integrity: node.integrity ?? null, executable: Boolean(node.executable) });
  }
}

export function listAsarEntries(headerInfo) {
  const out = [];
  walkNode({ files: headerInfo.header.files }, '', out);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export function readAsarEntry(headerInfo, entry, { maxBytes = 64 * 1024 * 1024 } = {}) {
  if (!entry || entry.type !== 'file') throw new Error('Only ASAR file entries can be read.');
  if (entry.size > maxBytes) throw new Error(`ASAR member exceeds read bound (${entry.size} > ${maxBytes}): ${entry.path}`);
  if (entry.unpacked) {
    const root = realpathSync(`${headerInfo.archive}.unpacked`);
    const candidate = resolve(root, ...entry.path.split('/'));
    if (!inside(root, candidate)) throw new Error(`ASAR unpacked member escapes root: ${entry.path}`);
    const actual = realpathSync(candidate);
    if (!inside(root, actual)) throw new Error(`ASAR unpacked member resolves outside root: ${entry.path}`);
    return readFileSync(actual);
  }
  const offsetBig = BigInt(entry.offset);
  if (offsetBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`ASAR member offset is too large for Node random access: ${entry.path}`);
  const absolute = headerInfo.dataOffset + Number(offsetBig);
  if (absolute < headerInfo.dataOffset || absolute + entry.size > headerInfo.archiveSize) throw new Error(`ASAR member range exceeds archive: ${entry.path}`);
  const fd = openSync(headerInfo.archive, 'r');
  try {
    const buffer = Buffer.alloc(entry.size);
    if (entry.size && readSync(fd, buffer, 0, entry.size, absolute) !== entry.size) throw new Error(`Unable to read complete ASAR member: ${entry.path}`);
    return buffer;
  } finally { closeSync(fd); }
}
