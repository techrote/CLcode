# SPECIMEN-ASAR-001 — Electron ASAR internal control-path mapping

**Status:** dependency-free read-only tooling implemented and synthetic self-test passed; **no real Desktop specimen archive has been scanned yet**.

This slice extends **SPECIMEN-MAP-001 / PR #6**. The ordinary surface mapper can identify `app.asar` as a high-value artifact, but treating the archive as one opaque file hides the internal JavaScript/module paths that are likely to contain Desktop startup, engine launch, model selection, auth/quota and IPC code.

## Purpose

Map Electron ASAR internals without extracting proprietary application files into the repository or requiring a new package dependency.

The tooling answers:

- Which internal ASAR members contain principal-model/provider strings?
- Which members mention embedded Code engine launch/process control?
- Which preload/renderer/main modules contain Desktop IPC terms?
- Which members contain auth/quota/entitlement or tool-policy strings?
- Which files are unpacked versus stored in the archive?
- Which members carry ASAR integrity metadata?

A string hit remains **candidate evidence**, not behavioral proof.

## Why a dependency-free parser

Electron ASAR archives use a JSON file tree stored in Chromium Pickle framing followed by uncompressed file bytes. File offsets therefore support direct random access without extracting the whole archive.

Reference format:

- https://github.com/electron/asar#format
- https://www.electronjs.org/docs/latest/tutorial/asar-archives

As of 2026-11-24, the current `@electron/asar` package requires Node 22.12+, while CLcode's current runtime floor is Node 20.11. This slice therefore implements only the narrow read-only parsing needed for mapping and keeps CLcode's existing Node floor.

## Tooling

### `asar-reader.mjs`

Dependency-free reader that:

- validates the 8-byte size Pickle;
- validates and parses the JSON-header Pickle;
- enumerates nested files, links and unpacked members;
- performs bounded random-access reads of packed members;
- resolves unpacked members only within `app.asar.unpacked`;
- rejects invalid offsets, ranges and unsafe paths;
- records a SHA-256 of the raw header Pickle for evidence correlation.

It never rewrites an archive.

### `Scan-AsarSurface.mjs`

Accepts one or more installation roots and/or explicit ASAR paths.

It:

- discovers `.asar` files below installation roots;
- enumerates internal members without extracting them;
- skips obvious binary asset extensions;
- scans UTF-8, Latin-1 and UTF-16LE views of bounded members;
- reuses `specimen-patterns.json` from SPECIMEN-MAP-001;
- stores archive/member hashes, internal paths, categories and scores;
- persists only short redacted hit snippets;
- records member integrity metadata when present.

Outputs:

- `asar-map.json`
- `asar-hits.jsonl`
- `asar-candidates.csv`

### `Summarize-AsarMap.mjs`

Produces `ASAR-REPORT.md` with:

- archive/member counts;
- member-integrity/unpacked counts;
- category counts;
- highest-ranked internal paths;
- a warning that archive patchability is a separate question.

## Synthetic verification

Run:

```powershell
node .\tools\specimen\Test-AsarMap.mjs
```

The test constructs a valid synthetic ASAR archive with:

- principal-model/API strings;
- embedded-engine launch strings;
- preload/Desktop IPC strings;
- quota/auth strings;
- UTF-16LE text;
- a credential-like `sk-...` token that must be redacted;
- an obvious binary asset that must not become a text candidate.

It verifies:

- ASAR header parsing;
- member enumeration;
- direct member reads;
- invalid member-range refusal;
- malformed archive refusal;
- ASCII and UTF-16LE pattern discovery;
- category scoring;
- binary skipping;
- snippet redaction;
- report generation.

Local implementation result: **PASS**.

## Disposable-PC sequence

After the normal SPECIMEN-MAP-001 installation scan:

```powershell
$asarMap = Join-Path $env:USERPROFILE 'clcode-specimen-lab\maps\desktop-asar'
node .\tools\specimen\Scan-AsarSurface.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --out $asarMap

node .\tools\specimen\Summarize-AsarMap.mjs `
  (Join-Path $asarMap 'asar-map.json')
```

Review `ASAR-REPORT.md` beside:

- SPECIMEN-MAP-001 `REPORT.md`;
- runtime correlation report;
- SPECIMEN-LAUNCH-001 launch ancestry report.

Prefer internal paths supported by more than one evidence source before choosing a surgery experiment.

## ASAR integrity caveat

Electron can optionally validate an ASAR header hash at application startup. On Windows, the expected ASAR header hash can be embedded in the executable resource table. If that validation is enabled, modifying `app.asar` without updating the expected integrity value can cause the application to terminate at startup.

Reference:

- https://www.electronjs.org/docs/latest/tutorial/asar-integrity

Therefore:

- **mapping an ASAR member does not mean `app.asar` should be the first patch target**;
- inspect launch/runtime evidence and integrity behavior first;
- prefer an external configuration/launch seam where it answers the same architectural question;
- if ASAR surgery becomes necessary, add explicit integrity detection/handling to the guarded-surgery path before applying a real patch.

## Evidence boundary

No real Claude Desktop ASAR has been read by this implementation environment.

No proprietary archive member is copied into repository output. The mapping output contains only metadata/hashes and short redacted matching contexts.
