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

## 4. Capture after one modification and compare

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
