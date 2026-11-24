# CLcode specimen lab

This directory contains **repository-owned tooling for the disposable Windows development PC**. It prepares evidence for Desktop Code transplantation without committing the vendor specimen, its user data, or captured runtime state to Git.

Before using the lab against the real specimen, run the local self-test:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Test-SpecimenTooling.ps1
```

It parses all specimen PowerShell files and exercises capture → experiment ledger → modified capture → comparison against a synthetic fake installation. No CI or vendor installation is required.

The intended sequence is deliberately specimen-first:

1. install/pin the target Desktop Code specimen on the disposable PC;
2. capture a cryptographic baseline;
3. record a surgery experiment;
4. observe a normal Code launch/task;
5. make **one bounded modification**;
6. capture again and compare;
7. record what changed before attempting the next modification.

The scripts default to `%USERPROFILE%\clcode-specimen-lab`, outside the CLcode checkout.

## 1. Capture a baseline

```powershell
Set-Location C:\path\to\CLcode
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Capture-SpecimenBaseline.ps1
```

If automatic discovery misses the installation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Capture-SpecimenBaseline.ps1 `
  -InstallRoot 'C:\Path\To\Claude'
```

The capture records OS/hardware/tool metadata, installed Claude/Anthropic AppX package metadata, currently running Claude/Anthropic processes, and SHA-256 + size + relative path for every file under the selected installation roots. It **does not copy those files**.

Use `-SkipFileHashes` only for a quick reconnaissance capture. A surgery baseline should include hashes.

## 2. Create an experiment ledger entry

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\New-SurgeryExperiment.ps1 `
  -Title 'principal model control path' `
  -BaselineCapture "$env:USERPROFILE\clcode-specimen-lab\captures\baseline-..." `
  -Objective 'Find the narrowest point at which Desktop Code chooses or launches its principal model path.' `
  -ExpectedChange 'No product behavior change; instrumentation only.'
```

This creates a local experiment directory containing `experiment.json` and `NOTES.md`. The ledger is intentionally separate from the public repository.

## 3. Observe runtime behavior

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Observe-SpecimenRuntime.ps1 `
  -DurationSeconds 180
```

Optionally launch a known executable as part of the observation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Observe-SpecimenRuntime.ps1 `
  -LaunchPath 'C:\Path\To\Claude.exe' `
  -DurationSeconds 180
```

The observer samples process ancestry and established TCP connections for matching Claude/Anthropic processes and descendants of the optionally launched root process. It records endpoint IP/port and executable paths; it intentionally does **not** collect cookies, request bodies, auth headers or command-line arguments.

## 4. Map likely control surfaces

After the baseline exists, run the read-only control-path mapper before changing the specimen:

```powershell
$mapRoot = Join-Path $env:USERPROFILE 'clcode-specimen-lab\maps\desktop-baseline'
node .\tools\specimen\Scan-SpecimenSurface.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --out $mapRoot

node .\tools\specimen\Summarize-SpecimenMap.mjs `
  (Join-Path $mapRoot 'map.json')
```

Then correlate the map with a runtime observation:

```powershell
node .\tools\specimen\Analyze-RuntimeObservation.mjs `
  'C:\Users\YOU\clcode-specimen-lab\observations\runtime-...' `
  (Join-Path $mapRoot 'map.json')
```

See [SPECIMEN-MAP-001](../../docs/SPECIMEN-MAP-001.md) for the category catalog, outputs and evidence rules. The scanner copies no specimen files and redacts credential-like snippets.

Before using the mapper against the real specimen:

```powershell
node .\tools\specimen\Test-SpecimenMap.mjs
node .\tools\specimen\Test-RuntimeAnalysis.mjs
```

## 5. Apply one hash-guarded reversible modification

Before using the surgery tool against the real specimen:

```powershell
node .\tools\specimen\Test-SpecimenPatch.mjs
```

Create a patch specification from the exact candidate file:

```powershell
node .\tools\specimen\New-SpecimenPatchSpec.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --target 'resources\candidate.js' `
  --out "$env:USERPROFILE\clcode-specimen-lab\experiments\exp-001\patch.json"
```

After editing the generated spec, **dry-run first**:

```powershell
node .\tools\specimen\Apply-SpecimenPatch.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --spec "$env:USERPROFILE\clcode-specimen-lab\experiments\exp-001\patch.json" `
  --lab "$env:USERPROFILE\clcode-specimen-lab"
```

Only then add `--apply`. The tool verifies the exact baseline SHA, exact replacement count, root containment and post-write SHA, and creates an external backup + receipt. Roll back with:

```powershell
node .\tools\specimen\Rollback-SpecimenPatch.mjs PATH_TO_RECEIPT
```

See [SPECIMEN-SURGERY-001](../../docs/SPECIMEN-SURGERY-001.md) for the patch schema and evidence rules.

## 6. Capture after one modification and compare

```powershell
# after the bounded local specimen change
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Capture-SpecimenBaseline.ps1 `
  -InstallRoot 'C:\Path\To\Claude'

powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Compare-SpecimenCaptures.ps1 `
  -Before 'C:\Users\YOU\clcode-specimen-lab\captures\baseline-...' `
  -After  'C:\Users\YOU\clcode-specimen-lab\captures\baseline-...'
```

The comparison emits added/removed/changed file rows and a JSON summary. It does not attempt to interpret proprietary code.

## Evidence discipline

- Record the exact Desktop application version, embedded Code engine version when observable, installer provenance and baseline hashes before modifying anything.
- Keep each experiment narrow and reversible. One modification should answer one architectural question.
- The primary questions are **where principal model ownership lives**, **which process owns the agent/tool loop**, **how Desktop and the embedded engine communicate**, and **which Anthropic auth/quota/service dependencies are actually required for local Code operation**.
- Local research modification and redistribution are separate questions. Do not commit or publish vendor binaries/assets merely because they are on a disposable PC.
- The disposable disk is not a disposable credential boundary. Use scoped test credentials and avoid recording valuable secrets.

## ASAR internal mapping

Electron `app.asar` often contains the JavaScript/module paths that the ordinary surface scanner can only identify as one opaque high-value artifact. SPECIMEN-ASAR-001 adds a dependency-free, read-only internal mapper that keeps the project's Node 20.11+ floor.

Self-test:

```powershell
node .\tools\specimen\Test-AsarMap.mjs
```

Map every ASAR below the pinned Desktop installation root:

```powershell
$asarMap = Join-Path $env:USERPROFILE 'clcode-specimen-lab\maps\desktop-asar'
node .\tools\specimen\Scan-AsarSurface.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --out $asarMap

node .\tools\specimen\Summarize-AsarMap.mjs `
  (Join-Path $asarMap 'asar-map.json')
```

Outputs contain archive/member hashes, internal member paths, category scores and short redacted snippets only; archive members are not extracted to the evidence directory.

Read `docs/SPECIMEN-ASAR-001.md` before any ASAR modification. Electron can enforce an embedded ASAR-header integrity hash, so an internal candidate is **mapping evidence**, not automatic permission or technical viability for a direct `app.asar` patch.


## ASAR integrity qualification

Before a real `app.asar` or Electron-executable surgery, inspect the packaged integrity relationship:

```powershell
node .\tools\specimen\Test-AsarIntegrity.mjs

node .\tools\specimen\Check-AsarIntegrity.mjs `
  --exe 'C:\Path\To\Desktop\Claude.exe' `
  --root 'C:\Path\To\Desktop' `
  --out "$env:USERPROFILE\clcode-specimen-lab\maps\asar-integrity.json"
```

The detector reads Electron's fuse wire plus the Windows `INTEGRITY/ELECTRONASAR` PE resource and compares the packaged expected ASAR JSON-header SHA-256 with the installed archive. It is read-only.

A resource alone does not prove enforcement: `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar` are reported separately. See `docs/SPECIMEN-ASAR-INTEGRITY-001.md`.


## Fuse evidence into surgery hypotheses

After static, ASAR, runtime, launch and integrity collection, combine the available evidence before choosing a first modification:

```powershell
node .\tools\specimen\Test-EvidenceFusion.mjs

$fusion = Join-Path $env:USERPROFILE 'clcode-specimen-lab\maps\fusion'
node .\tools\specimen\Fuse-SpecimenEvidence.mjs `
  --surface 'C:\...\desktop-baseline\map.json' `
  --asar 'C:\...\desktop-asar\asar-map.json' `
  --runtime 'C:\...\runtime-...\runtime-summary.json' `
  --launch 'C:\...\launch-...\summary.json' `
  --integrity 'C:\...\asar-integrity.json' `
  --out $fusion
```

Review `HYPOTHESES.md`. The fusion report separates evidence relevance from surgery suitability and requires multiple behavioral evidence sources for its first-experiment shortlist. An empty shortlist means gather more evidence; it is not a reason to lower the threshold.
