# FIRST-WINDOWS-001 — disposable-PC evaluator sequence

**Purpose:** one checkout for the first physical CLcode feasibility session. This is an **evaluation/HOLD composition**, not a replacement for the individual review PRs.

The evaluator combines the current specimen lab/mapping/surgery/launch tooling with the hardened hostless runtime and Desktop client. Its job is to collect honest evidence quickly, not to claim Desktop transplantation before it happens.

## Contents

1. Preflight — verify the combined checkout before touching a real specimen.
2. Donor and fixture setup — freeze the exact GPTopus donor and local coding fixture.
3. Specimen baseline — identify and hash the Desktop installation before modification.
4. Static + runtime archaeology — map likely control seams and observe process/network/launch behavior.
5. Hostless model acceptance — execute E01, E02 and E06 without Claude Code hosting the work.
6. First Desktop surgery — choose one evidence-backed principal-control hypothesis and modify one target reversibly.
7. Evidence to return — the minimal sanitized artifacts needed for the next engineering step.

## 1. Preflight

Use a normal Windows user session. Install only Git and a current Node LTS if missing. Do not install the standalone Claude Code CLI merely for this experiment.

From the CLcode evaluator checkout:

```powershell
node .\scripts\first-windows-check.mjs
```

Expected before proceeding:

- runtime/Desktop Node tests PASS;
- specimen map self-test PASS;
- runtime-correlation self-test PASS;
- guarded patch apply/rollback self-test PASS;
- launch-redaction/filter self-test PASS;
- PowerShell specimen-lab self-test PASS.

A failure here is a development blocker, not something to work around manually.

## 2. Donor and fixture setup

Clone GPTopus separately and freeze the exact donor used by HOSTLESS-RUN-001:

```powershell
$lab = Join-Path $env:USERPROFILE 'clcode-lab'
New-Item -ItemType Directory -Force $lab | Out-Null

git clone https://github.com/techrote/Chlaude-GPTopus.git (Join-Path $lab 'Chlaude-GPTopus')
git -C (Join-Path $lab 'Chlaude-GPTopus') checkout --detach 849627463c3e2be660f9d24976320b072c107b34
git -C (Join-Path $lab 'Chlaude-GPTopus') rev-parse HEAD
```

Create the deterministic local E06 fixture:

```powershell
node .\scripts\create-fixture.mjs (Join-Path $lab 'fixture-e06')
git -C (Join-Path $lab 'fixture-e06') status --short --branch
git -C (Join-Path $lab 'fixture-e06') remote -v
```

The fixture should be on `e06-run`, clean, intentionally failing, and have no remote.

## 3. Specimen baseline

Install the target Desktop application specimen on this disposable PC. Record installer provenance and the visible Desktop/embedded Code version if available.

Run the baseline capture:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Capture-SpecimenBaseline.ps1
```

If automatic discovery misses it, supply `-InstallRoot` explicitly.

Keep the resulting `%USERPROFILE%\clcode-specimen-lab` evidence local. Do not add captured specimen metadata/snippets to Git without review.

## 4. Static + runtime archaeology

Create a static control-surface map of the **installation directory**, not account/profile/credential folders:

```powershell
$mapRoot = Join-Path $env:USERPROFILE 'clcode-specimen-lab\maps\desktop-baseline'
node .\tools\specimen\Scan-SpecimenSurface.mjs --root 'C:\Path\To\Desktop\Install' --out $mapRoot
node .\tools\specimen\Summarize-SpecimenMap.mjs (Join-Path $mapRoot 'map.json')
```

Before launching a normal Code session, start both runtime observers in separate terminals:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Observe-SpecimenRuntime.ps1 -DurationSeconds 180
```

```powershell
node .\tools\specimen\Observe-SpecimenLaunch.mjs --duration 180 --lab "$env:USERPROFILE\clcode-specimen-lab"
```

During that window, open Desktop Code and perform one small disposable local task. Then correlate the periodic observation with the static map:

```powershell
node .\tools\specimen\Analyze-RuntimeObservation.mjs `
  'C:\Users\YOU\clcode-specimen-lab\observations\runtime-...' `
  (Join-Path $mapRoot 'map.json')
```

The useful output is a ranked hypothesis map: principal-model/control candidates, process ancestry, embedded-engine launch structure, auth/quota candidates, IPC candidates, and which processes owned outbound connections. None of those facts alone prove behavioral ownership.

## 5. Hostless model acceptance

### E01 — standalone GPTopus panel

Use isolated config/state paths and launch the panel directly with Node. Verify a harmless setting persists across restart and wrong/missing access token is rejected. This proves the control panel is independent of Claude inference; it does not prove the coding loop.

### E02 — real provider call without Claude Code

List available workers through the CLcode adapter:

```powershell
node .\src\cli.mjs workers `
  --gptopus (Join-Path $lab 'Chlaude-GPTopus') `
  --state (Join-Path $lab 'state')
```

Configure only an authorized test provider/key. Execute a real hostless request and record the provider/model/request identifiers and usage without recording the key.

### E06 — real Read → Edit → Test → local commit

Run the real principal against the deterministic fixture:

```powershell
node .\src\cli.mjs run `
  --gptopus (Join-Path $lab 'Chlaude-GPTopus') `
  --state (Join-Path $lab 'state') `
  --project (Join-Path $lab 'fixture-e06') `
  --worker WORKER_NAME `
  --task "Read src/slug.mjs and test/slug.test.mjs. Fix slugify to pass the existing tests. Run the tests, inspect the diff, and commit locally."
```

Required evidence:

- model genuinely requests reads/edits/test rather than merely describing them;
- baseline test fails and post-edit test exits 0;
- local commit exists;
- unrelated changes are not included;
- event journal and provider IDs are inspectable;
- no Claude Code process is required to own the run.

Also perform one cancellation test with a child process and verify the complete Windows process tree is gone after Stop/cancel.

## 6. First Desktop surgery

Do not choose a patch merely because a string looks interesting. Select one hypothesis supported by at least two evidence sources: static map, process/runtime observation, launch ancestry, or network ownership.

Create a surgery ledger entry, then generate a hash-pinned patch template:

```powershell
node .\tools\specimen\New-SpecimenPatchSpec.mjs `
  --root 'C:\Path\To\Desktop\Install' `
  --target 'relative\candidate.file' `
  --out "$env:USERPROFILE\clcode-specimen-lab\experiments\exp-001\patch.json"
```

After filling one exact replacement, **dry-run first**:

```powershell
node .\tools\specimen\Apply-SpecimenPatch.mjs `
  --root 'C:\Path\To\Desktop\Install' `
  --spec "$env:USERPROFILE\clcode-specimen-lab\experiments\exp-001\patch.json" `
  --lab "$env:USERPROFILE\clcode-specimen-lab"
```

Only apply after reviewing the predicted hash/replacement counts. Run one controlled before/after behavioral observation, recapture the specimen, compare it, record the finding, then rollback unless the next experiment deliberately depends on the modified state.

The first surgery question should preferably target the narrowest seam toward replacing Claude as the principal Desktop Code controller, not cosmetic UI changes.

## 7. Evidence to return

Do **not** upload provider keys, token-bearing localhost URLs, cookies, account data, proprietary app binaries, or unreviewed full captures.

Useful sanitized return material is:

- `FIRST-WINDOWS-001` preflight output;
- exact CLcode evaluator SHA and GPTopus donor SHA;
- baseline manifest summary and install-root/version facts;
- static `REPORT.md` / candidate summary after reviewing snippets;
- runtime and launch reports after reviewing redaction;
- E01/E02/E06 PASS/FAIL entries with real vs mock clearly labelled;
- E06 run/event summary, test exit code, Git diff/stat and local commit SHA;
- first surgery experiment notes, patch receipt hashes and before/after behavior;
- exact blockers/negative results.

The first session is successful even if the Desktop surgery result is negative, provided it narrows the control path with reproducible evidence.
