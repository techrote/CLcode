# SPECIMEN-ASAR-INTEGRITY-001 — read-only Electron ASAR enforcement qualification

**Status:** dependency-free read-only tooling implemented and synthetic PE/ASAR self-test passed; **no real Claude Desktop executable has been inspected yet**.

This slice stacks on **SPECIMEN-ASAR-001**. It answers the question that must precede any real `app.asar` surgery: does the installed Electron executable actually enforce embedded ASAR integrity, and does its packaged expected hash match the installed archive?

## Evidence model

Electron exposes two independent pieces of evidence:

1. **Fuse wire** — `EnableEmbeddedAsarIntegrityValidation` controls runtime ASAR validation; `OnlyLoadAppFromAsar` controls whether alternate unpacked app-code search paths are allowed.
2. **Windows PE resource** — resource type `INTEGRITY`, name `ELECTRONASAR`, contains JSON entries with the expected SHA-256 of the ASAR JSON header string.

A resource can exist even when the validation fuse is disabled, so the tool reports fuse state and resource/hash state separately.

Authoritative references:

- Electron Fuses: https://www.electronjs.org/docs/latest/tutorial/fuses
- Electron ASAR Integrity: https://www.electronjs.org/docs/latest/tutorial/asar-integrity
- Electron Packager resource implementation: https://github.com/electron/packager/blob/main/src/resedit.ts
- Fuse schema: https://github.com/electron/fuses/blob/main/src/config.ts

## Tooling

### `electron-fuses.mjs`

Read-only fuse-wire decoder.

It searches for Electron's documented sentinel:

`dL7pKGdnNz796PbbjQWNKmHXBZaB9tsX`

and decodes:

- schema version;
- fuse count;
- V1 fuse indices;
- enabled / disabled / removed state.

The two fields relevant to ASAR transplantation are:

- index 4 — `EnableEmbeddedAsarIntegrityValidation`;
- index 5 — `OnlyLoadAppFromAsar`.

### `pe-resources.mjs`

Minimal dependency-free PE resource reader for named resources. It:

- validates DOS and PE headers;
- parses PE32/PE32+ data directories and section mappings;
- walks named resource directories;
- resolves resource RVAs to file offsets;
- bounds-checks directory/string/data reads;
- returns the exact resource bytes without modifying the executable.

### `Check-AsarIntegrity.mjs`

Combines fuse, PE-resource and ASAR evidence:

```powershell
node .\tools\specimen\Check-AsarIntegrity.mjs `
  --exe 'C:\Path\To\Desktop\Claude.exe' `
  --root 'C:\Path\To\Desktop' `
  --out "$env:USERPROFILE\clcode-specimen-lab\maps\asar-integrity.json"
```

For every packaged `ElectronAsar` entry it reports:

- resource file path;
- algorithm;
- expected header SHA-256;
- resolved ASAR path;
- actual Electron-compatible ASAR JSON-header SHA-256;
- match / mismatch;
- count of ASAR members carrying integrity metadata;
- any read/parse error.

It also reports a high-level assessment such as:

- `enforced+asar-only`
- `enforced`
- `enabled-but-resource-missing`
- `resource-present-fuse-disabled`
- `resource-present-fuse-unknown`
- `disabled`
- `unknown`

These labels are evidence summaries, not permission to modify the binary or archive.

## Synthetic verification

Run:

```powershell
node .\tools\specimen\Test-AsarIntegrity.mjs
```

The test constructs:

- a valid synthetic ASAR with member integrity metadata;
- a minimal PE32+ executable image with a `.rsrc` section;
- named `INTEGRITY/ELECTRONASAR` resource JSON;
- an Electron V1 fuse wire.

It verifies:

- fuse sentinel/version/count decoding;
- ASAR-integrity and only-load-ASAR fuse indices;
- named PE resource traversal;
- packaged resource JSON decoding;
- exact ASAR JSON-header SHA match;
- member-integrity counting;
- mismatch detection;
- resource-present / fuse-absent distinction;
- malformed PE rejection.

Local implementation result: **PASS**.

## Disposable-PC use

Run this **after** the normal specimen baseline and ASAR internal map, but **before** generating a patch spec for `app.asar` or the Electron executable.

Interpretation:

- **Fuse disabled:** direct archive edits may not be blocked by embedded integrity, but ordinary code signing/update behavior and application logic still need separate qualification.
- **Fuse enabled + matching resource:** direct `app.asar` edits are expected to fail validation unless the integrity relationship is handled; do not perform a blind archive patch.
- **Fuse enabled + missing/mismatched resource:** record as a high-value anomaly; do not guess around it.
- **OnlyLoadAppFromAsar enabled:** an alternate unpacked `app/` route is intentionally unavailable through Electron's normal app search path.
- **Fuse/resource unknown:** keep the first surgery outside ASAR where possible and improve observation before patching.

## Evidence boundary

No real Desktop executable or ASAR was inspected by this implementation environment.

The detector is read-only. It does not flip Electron fuses, rewrite PE resources, modify code signatures or patch ASAR archives.
