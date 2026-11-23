# SPECIMEN-MAP-001 — Desktop Code control-path surface mapping

**Status:** tooling implemented and synthetic self-tests passed; **no real Claude Desktop specimen has been scanned yet**.

This slice is stacked on **SPECIMEN-LAB-001 / PR #3**. It exists to make the first disposable-PC archaeology session evidence-driven rather than a blind search through an installed application.

## Purpose

The target questions are:

1. where the Desktop Code **principal model / "CEO"** selection and invocation path appears to live;
2. which files/processes appear involved in launching or hosting the embedded Code engine;
3. where auth, subscription, usage-limit and quota coupling appears;
4. where Desktop↔engine IPC/process-launch seams appear;
5. which service/update/telemetry dependencies are visible;
6. where tool/permission policy is represented.

The scanner does **not** assert that a matching string owns a behavior. It ranks candidate files for the next bounded experiment.

## Tooling

### Surface scanner

`tools/specimen/Scan-SpecimenSurface.mjs`

Read-only scan of one or more installation roots. It:

- enumerates ordinary files while skipping cache/log directories;
- hashes scanned files with SHA-256;
- scans UTF-8, Latin-1 and UTF-16LE views;
- searches a versioned category catalog in `specimen-patterns.json`;
- flags special artifacts such as `app.asar`, runtime executables, preload files and package/manifest files;
- stores only metadata and **short redacted matching snippets**;
- ranks candidate files by hit/category diversity plus special-artifact weight.

Default maximum scanned file size is 128 MiB; larger files are recorded as skipped rather than loaded.

### Report generator

`tools/specimen/Summarize-SpecimenMap.mjs`

Turns `map.json` into a Markdown triage report with:

- category counts;
- highest-ranked files;
- top candidates per category;
- a reminder to choose the smallest experiment that can answer one control-path question.

### Runtime correlation

`tools/specimen/Analyze-RuntimeObservation.mjs`

Consumes the `process-samples.csv` and `connections.csv` created by PR #3's `Observe-SpecimenRuntime.ps1`.

When supplied a specimen map, it correlates an observed executable's exact path with scanner candidates and produces:

- unique process records;
- parent PID relationships;
- established remote endpoints per process;
- matching candidate score/categories;
- `runtime-summary.json`;
- `RUNTIME-REPORT.md`.

An IP/port connection is treated only as **process/network evidence**, not proof of application-layer purpose.

## Pattern categories

The initial catalog intentionally focuses on high-value seams:

- `principal-model`
- `auth-quota`
- `engine-process`
- `desktop-ipc`
- `services-update`
- `tool-policy`

The catalog is data, not hard-coded scanner logic, so later specimen-specific terms can be added without rewriting the scanner.

## Synthetic verification

Run from the CLcode checkout:

```powershell
node .\tools\specimen\Test-SpecimenMap.mjs
node .\tools\specimen\Test-RuntimeAnalysis.mjs
```

Both self-tests passed in the implementation environment.

The first test creates a fake specimen containing:

- principal-model/API strings;
- Desktop IPC strings;
- quota/auth strings;
- an `app.asar` candidate;
- UTF-16LE strings;
- a credential-like token that **must be redacted**.

It verifies map creation, ranking, category hits, special-artifact detection and redaction.

The second test creates synthetic PR #3 process/TCP observations and verifies exact executable-path correlation, endpoint attribution and Markdown reporting.

## Disposable-PC sequence

Assume the target installation root has already been frozen with PR #3's baseline tooling.

### 1. Self-test first

```powershell
node .\tools\specimen\Test-SpecimenMap.mjs
node .\tools\specimen\Test-RuntimeAnalysis.mjs
```

### 2. Scan the installed specimen

Use the **installation directory**, not credential/profile/user-data directories:

```powershell
$mapRoot = Join-Path $env:USERPROFILE 'clcode-specimen-lab\maps\desktop-baseline'
node .\tools\specimen\Scan-SpecimenSurface.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --out $mapRoot

node .\tools\specimen\Summarize-SpecimenMap.mjs `
  (Join-Path $mapRoot 'map.json')
```

Outputs:

- `map.json`
- `hits.jsonl`
- `candidates.csv`
- `REPORT.md`

Keep them in the local specimen lab. Do not commit them blindly: even redacted snippets should be reviewed before publication.

### 3. Observe one normal Desktop Code task

In one PowerShell window:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Observe-SpecimenRuntime.ps1 `
  -DurationSeconds 180
```

During the observation window, launch/use Desktop Code normally against a disposable fixture.

### 4. Correlate static and live evidence

```powershell
node .\tools\specimen\Analyze-RuntimeObservation.mjs `
  'C:\Users\YOU\clcode-specimen-lab\observations\runtime-...' `
  (Join-Path $mapRoot 'map.json')
```

Review `RUNTIME-REPORT.md` together with `REPORT.md`.

### 5. Choose exactly one first surgery question

Prefer the smallest seam supported by **both** static and runtime evidence.

Examples:

- Which process launches the embedded Code engine?
- Which candidate owns principal-model ID selection?
- Is an auth/quota check performed before local Code session creation?
- Which IPC/preload path carries Code session lifecycle state?
- Which component actually opens the model-provider connection?

Create a PR #3 surgery ledger entry before modifying the specimen.

## Evidence rules

A string hit is **candidate evidence**, not behavioral proof.

A running executable is **runtime evidence**, not proof that every string inside it is active.

A TCP endpoint is **connection evidence**, not proof of why the application contacted it.

A before/after behavior change tied to one reversible specimen modification is substantially stronger evidence and should be recorded through the PR #3 surgery ledger.

## Data handling

- No specimen files are copied into the map output.
- Candidate files are represented by path/size/hash/category metadata.
- `hits.jsonl` stores only short matching contexts.
- Bearer-like values, `sk-`-style keys and common key/token assignments are redacted.
- Do **not** scan account/profile/credential directories merely because the disk is disposable.
- Local research modification and redistribution remain separate questions.
