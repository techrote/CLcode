import { readFileSync } from 'node:fs';

export const FUSE_SENTINEL = 'dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX';
export const FUSE_V1_NAMES = Object.freeze([
  'RunAsNode',
  'EnableCookieEncryption',
  'EnableNodeOptionsEnvironmentVariable',
  'EnableNodeCliInspectArguments',
  'EnableEmbeddedAsarIntegrityValidation',
  'OnlyLoadAppFromAsar',
  'LoadBrowserProcessSpecificV8Snapshot',
  'GrantFileProtocolExtraPrivileges',
  'WasmTrapHandlers',
]);

function state(byte) {
  if (byte === 0x31 || byte === 0x01) return 'enabled';
  if (byte === 0x30 || byte === 0x00) return 'disabled';
  if (byte === 0x72) return 'removed';
  return `unknown:0x${byte.toString(16).padStart(2,'0')}`;
}

export function readElectronFuses(path) {
  const buffer = readFileSync(path);
  const sentinel = Buffer.from(FUSE_SENTINEL, 'ascii');
  const offsets = [];
  for (let from = 0;;) {
    const at = buffer.indexOf(sentinel, from);
    if (at < 0) break;
    offsets.push(at); from = at + sentinel.length;
  }
  if (!offsets.length) return { found: false, sentinel: FUSE_SENTINEL, occurrences: 0, fuses: {} };
  if (offsets.length !== 1) throw new Error(`Electron fuse sentinel occurs ${offsets.length} times; refusing ambiguous decode.`);
  const at = offsets[0], meta = at + sentinel.length;
  if (meta + 2 > buffer.length) throw new Error('Electron fuse sentinel is truncated before version/count bytes.');
  const version = buffer[meta], count = buffer[meta + 1];
  if (count > 64 || meta + 2 + count > buffer.length) throw new Error(`Invalid Electron fuse wire length ${count}.`);
  const wire = buffer.subarray(meta + 2, meta + 2 + count);
  const fuses = {};
  for (let i = 0; i < wire.length; i++) {
    const name = version === 1 && i < FUSE_V1_NAMES.length ? FUSE_V1_NAMES[i] : `Fuse${i}`;
    fuses[name] = { index: i, byte: wire[i], state: state(wire[i]) };
  }
  return {
    found: true,
    sentinel: FUSE_SENTINEL,
    occurrences: 1,
    offset: at,
    version,
    count,
    wireAscii: wire.toString('latin1'),
    fuses,
  };
}
