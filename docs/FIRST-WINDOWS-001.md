# FIRST-WINDOWS-001 — gated disposable-PC evaluation

This is a research evaluator, not a production distribution or a completed Desktop transplant. The source of truth for selected component heads is FIRST-WINDOWS-COMPONENTS.json; the exact evaluator SHA must be taken from the approved integration PR. Do not substitute a moving branch tip.

## 1. Phase A — uncredentialed native preflight

Use ordinary-user PowerShell 5.1 and Node 22.16.0 (the qualified version), with Git for Windows. Use a full-history checkout of the approved exact evaluator SHA; no shallow clone. No live API credentials or real specimen changes during preflight.

```powershell
$ErrorActionPreference = 'Stop'
$lab = Join-Path $env:USERPROFILE 'clcode-lab'
New-Item -ItemType Directory -Force -Path $lab | Out-Null
node --version
git --version
$PSVersionTable.PSVersion.ToString()
git rev-parse HEAD
git status --porcelain=v1 --untracked-files=all
node .\scripts\first-windows-check.mjs
if ($LASTEXITCODE -ne 0) { throw 'Preflight failed; stop.' }
```

Compare HEAD to the owner-approved evaluator pin and require a clean checkout. Preflight must show each component ancestry and every test PASS, including PowerShell specimen-lab and surgery-packet tests. A synthetic or Linux-only PASS does not establish native physical acceptance. If any new adversarial test is red, do not select an older green snapshot to avoid it.

## 2. Phase B — donor setup and isolated E01

Continue only after the approved evaluator and native preflight gates pass. Use a fresh lab with no valuable state. The donor pin is intentional; never force-reset an existing donor checkout.

```powershell
$donor = Join-Path $lab 'Chlaude-GPTopus'
if (Test-Path -LiteralPath $donor) { throw 'Use a new lab or inspect the existing donor separately.' }
git clone https://github.com/techrote/Chlaude-GPTopus.git $donor
if ($LASTEXITCODE -ne 0) { throw 'Donor clone failed' }
git -C $donor checkout --detach 849627463c3e2be660f9d24976320b072c107b34
if ($LASTEXITCODE -ne 0) { throw 'Donor checkout failed' }
git -C $donor rev-parse HEAD
git -C $donor status --porcelain=v1 --untracked-files=all
```

For E01 use a **separate PowerShell session** and a fresh isolated panel store. Do not configure API keys for E01. A JSON panel setting is not automatically exported into another runtime's environment.

```powershell
$lab = Join-Path $env:USERPROFILE 'clcode-lab'
$donor = Join-Path $lab 'Chlaude-GPTopus'
$e01 = Join-Path $lab 'e01-panel'
New-Item -ItemType Directory -Path $e01 -ErrorAction Stop | Out-Null
$env:OAI_CONFIG_STORE = Join-Path $e01 'config.json'
$env:OAI_CONFIG_STATE_DIR = Join-Path $e01 'ui'
$env:OPENAI_WORKER_USAGE_DIR = Join-Path $e01 'usage'
$env:OAI_STEER_DIR = Join-Path $e01 'steer'
$env:OAI_TRACE_DIR = Join-Path $e01 'trace'
Remove-Item Env:OAI_TRACE -ErrorAction SilentlyContinue
node (Join-Path $donor 'plugins\openai-workers\scripts\oai-config.mjs') --no-open --port 18646
```

If that port is already occupied, stop and choose another unused loopback port. The console prints a token-bearing URL: use it locally, never share it or put it in logs. Open it in a local browser. Change a harmless setting, such as global MAX STEPS, restart the same command with the same isolated store, and confirm persistence. Check in another local terminal that missing/wrong page tokens return 403 and missing/wrong API tokens return 401. For example:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:18646/
curl.exe -s -o NUL -w "%{http_code}" "http://127.0.0.1:18646/?t=wrong"
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:18646/api/schema
curl.exe -s -o NUL -w "%{http_code}" -H "x-oai-token: wrong" http://127.0.0.1:18646/api/schema
```

Record the status codes, setting persistence and that no Claude Code host was needed. Do not export the token or raw configuration. Stop the panel and close this shell.

## 3. Phase C — E02, then E06

**Gate:** the current exact runtime qualification must be green, the provider account/worker explicitly authorized, and no unresolved earlier request or worktree lease may exist. Use separate fresh fixtures for E02 and E06, and a fresh local state directory outside either project. Do not use a valuable project. Use one run at a time, no retries on an unknown remote outcome.

In a new terminal, configure only the explicitly authorized test provider using the provider's normal secure setup; do not put keys in commands, logs, fixture files or source. Use an isolated usage directory and conservative provider-side/account budget approved by the owner. No Claude Code host, no unrelated API calls.

```powershell
$lab = Join-Path $env:USERPROFILE 'clcode-lab'
$donor = Join-Path $lab 'Chlaude-GPTopus'
$state = Join-Path $lab 'state-hostless'
$fixture02 = Join-Path $lab 'fixture-e02'
$fixture06 = Join-Path $lab 'fixture-e06'
$env:OPENAI_WORKER_USAGE_DIR = Join-Path $state 'gptopus'
$env:OAI_CONFIG_STATE_DIR = Join-Path $state 'gptopus-ui'
$env:OAI_STEER_DIR = Join-Path $state 'steer'
$env:OAI_TRACE_DIR = Join-Path $state 'trace'
Remove-Item Env:OAI_TRACE -ErrorAction SilentlyContinue
node .\src\cli.mjs workers --gptopus $donor --state $state
if ($LASTEXITCODE -ne 0) { throw 'Donor/worker setup failed' }
$worker = Read-Host 'Enter an explicitly authorized worker from the list'
node .\scripts\create-fixture.mjs $fixture02
if ($LASTEXITCODE -ne 0) { throw 'E02 fixture creation failed' }
node .\src\cli.mjs run --gptopus $donor --state $state --project $fixture02 --worker $worker --max-steps 1 --max-minutes 3 --task 'Reply exactly E02_OK without invoking tools.'
if ($LASTEXITCODE -ne 0) { throw 'E02 did not complete; inspect the original run/provider before any retry' }
git -C $fixture02 status --porcelain=v1 --untracked-files=all
```

E02 PASS requires a real completed provider response, observed model/request/response identity, usage status, E02_OK, no tools or project mutations, and no Claude Code hosting. Worker listing alone does not count. A provider-unknown outcome is a stop condition, not permission to retry or use another fixture to replay the request.

After E02 is adjudicated PASS:

```powershell
node .\scripts\create-fixture.mjs $fixture06
if ($LASTEXITCODE -ne 0) { throw 'E06 fixture creation failed' }
git -C $fixture06 status --short --branch
git -C $fixture06 remote -v
git -C $fixture06 rev-parse HEAD
Push-Location $fixture06
try {
  node --test
  if ($LASTEXITCODE -eq 0) { throw 'Expected initial fixture failure; stop' }
} finally { Pop-Location }
node .\src\cli.mjs run --gptopus $donor --state $state --project $fixture06 --worker $worker --max-steps 16 --max-minutes 15 --task 'Read src/slug.mjs and test/slug.test.mjs. Fix slugify to pass the existing tests. Run tests, inspect diff, and commit locally.'
if ($LASTEXITCODE -ne 0) { throw 'E06 did not complete; preserve and reconcile the original run' }
git -C $fixture06 log -1 --format='%H %s'
git -C $fixture06 show --stat --oneline HEAD
git -C $fixture06 status --porcelain=v1 --untracked-files=all
Push-Location $fixture06
try {
  node --test
  if ($LASTEXITCODE -ne 0) { throw 'E06 final test failed' }
} finally { Pop-Location }
```

E06 requires the genuine model-initiated read/edit/test/local commit, actual baseline failure and final PASS, expected changed path only, inspectable event history, actual request identity, no unrelated edits or remote. Do not infer successful coding from a final model message or exit code. Before escalating beyond the disposable fixture, exercise actual Windows descendant-tree cancellation, ambiguous provider outcomes and restart/ownership with no automatic replay. Any unknown upstream outcome is HOLD; reconcile the original response/request and ledger using the authorized provider's normal controls.

## 4. Phase D — read-only Desktop baseline and archaeology

Use a pinned, authorized Desktop research specimen on the disposable PC. Record installer provenance and exact visible version. Do not modify access controls, signing or AppX permissions. Keep the installation isolated from the hostless provider credentials. Exit the credentialed terminal before beginning. Do not copy proprietary files to Git.

```powershell
$specimenLab = Join-Path $env:USERPROFILE 'clcode-specimen-lab'
$installRoot = Read-Host 'Enter exact installed specimen directory'
$exe = Read-Host 'Enter exact installed Desktop executable path'
$session = Join-Path $specimenLab ('session-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $session -ErrorAction Stop | Out-Null
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Capture-SpecimenBaseline.ps1 -LabRoot $session -InstallRoot $installRoot -DisableAutoDiscovery
if ($LASTEXITCODE -ne 0) { throw 'Baseline failed' }
$baseline = @(Get-ChildItem -LiteralPath (Join-Path $session 'captures') -Directory)
if ($baseline.Count -ne 1) { throw 'Expected exactly one baseline capture' }
$baseline = $baseline[0].FullName
$mapRoot = Join-Path $session 'surface'
$asarMap = Join-Path $session 'asar'
$integrity = Join-Path $session 'asar-integrity.json'
node .\tools\specimen\Scan-SpecimenSurface.mjs --root $installRoot --out $mapRoot
if ($LASTEXITCODE -ne 0) { throw 'Static map failed' }
node .\tools\specimen\Summarize-SpecimenMap.mjs (Join-Path $mapRoot 'map.json')
if ($LASTEXITCODE -ne 0) { throw 'Static summary failed' }
node .\tools\specimen\Scan-AsarSurface.mjs --root $installRoot --out $asarMap
if ($LASTEXITCODE -ne 0) { throw 'ASAR scan failed; record a negative result, do not guess' }
node .\tools\specimen\Summarize-AsarMap.mjs (Join-Path $asarMap 'asar-map.json')
if ($LASTEXITCODE -ne 0) { throw 'ASAR summary failed' }
node .\tools\specimen\Check-AsarIntegrity.mjs --exe $exe --root $installRoot --out $integrity
if ($LASTEXITCODE -ne 0) { throw 'Integrity inspection failed' }
```

Review the baseline coverage, especially inaccessible paths and hash errors. Do not treat missing observations as absence of behavior. Start the following observers in two separate ordinary-user terminals, with the exact same $session path set in each terminal:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\specimen\Observe-SpecimenRuntime.ps1 -LabRoot $session -DurationSeconds 180
```

```powershell
node .\tools\specimen\Observe-SpecimenLaunch.mjs --duration 180 --lab $session
```

During the observation interval perform one small authorized local Desktop task. Wait for both observers to complete. From the same evaluator checkout:

```powershell
$runtimeDirs = @(Get-ChildItem -LiteralPath (Join-Path $session 'observations') -Directory)
$launchDirs = @(Get-ChildItem -LiteralPath (Join-Path $session 'launches') -Directory)
if ($runtimeDirs.Count -ne 1 -or $launchDirs.Count -ne 1) { throw 'Ambiguous observation selection' }
$runtimeDir = $runtimeDirs[0].FullName
$launchDir = $launchDirs[0].FullName
node .\tools\specimen\Analyze-RuntimeObservation.mjs $runtimeDir (Join-Path $mapRoot 'map.json')
if ($LASTEXITCODE -ne 0) { throw 'Runtime correlation failed' }
$fusion = Join-Path $session 'fusion'
node .\tools\specimen\Fuse-SpecimenEvidence.mjs --surface (Join-Path $mapRoot 'map.json') --asar (Join-Path $asarMap 'asar-map.json') --runtime (Join-Path $runtimeDir 'runtime-summary.json') --launch (Join-Path $launchDir 'summary.json') --integrity $integrity --out $fusion
if ($LASTEXITCODE -ne 0) { throw 'Evidence fusion failed' }
```

Treat correlation and rankings as triage, not proof of application-layer traffic purpose, inference or tool ownership. Do not export unreviewed reports or command-line captures. If the shortlist is empty, record that result.

## 5. Phase E — bounded experiment packet and recovery gate

This phase is independently gated. Do not apply to an installed vendor specimen until the owner explicitly approves one bounded lawful research experiment and native recovery is demonstrated on a **synthetic scratch copy**. AppX/ACL/signing, live updater or unknown integrity behavior is a stop condition; do not bypass them. A read-only negative result is useful. The current packet generator does not authorize patch application.

Use a reviewed eligible candidate with an exact baseline SHA and at least two relevant evidence sources, including live evidence. Use the packet tool, not a hand-generated replacement spec that bypasses baseline binding:

```powershell
$packet = Join-Path $session 'first-experiment'
node .\tools\specimen\Prepare-SurgeryExperiment.mjs --hypotheses (Join-Path $fusion 'hypotheses.json') --baseline $baseline --rank 1 --objective 'Test one bounded, authorized behavioral hypothesis' --out $packet
if ($LASTEXITCODE -ne 0) { throw 'Packet refused; do not weaken the gate' }
```

Review PACKET.md and verify the exact identity and baseline before authoring any replacement. A prepared receipt is not proof of a successful patch. The recovery tool writes verified backup and prepared receipt before modification, uses staged replacement, and refuses unknown target bytes. A real experiment requires a quiescent scratch specimen, verified recovery and a controlled before/after observation. No direct ASAR-member patch or alteration of protection mechanisms. Stop on unexpected bytes, unresolved receipt, access denial, or uncertain integrity. Never publish proprietary bytes or backups.

## 6. Evidence return and stopping rules

Return the exact evaluator/donor SHAs, native preflight result, explicit E01/E02/E06 decisions, selected authorized provider identity and usage disposition (not key), baseline coverage/version, reviewed evidence summary, and any negative result. No token-bearing URLs, raw journals, proprietary code, binary backups, account data or unreviewed full captures. E07/E08 require genuine graphical CLcode operation and measured independence; nothing in preflight promotes those gates.

A failure of any independent gate is recorded as FAIL/BLOCKED/NOT RUN; do not proceed into a later risky phase just to fill the checklist.
