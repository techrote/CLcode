# SPECIMEN-LAUNCH-001 — redacted Desktop process-launch tracing

**Status:** Node redaction/filter logic self-test passes; Windows WMI process-start capture is **NOT RUN** in this environment.

This slice is stacked on **SPECIMEN-MAP-001 / PR #6** and complements the periodic process/TCP sampling in **SPECIMEN-LAB-001 / PR #3**.

## Why this exists

Periodic process sampling can miss a short-lived launcher or bootstrap process. For CLcode, one of the highest-value early questions is:

> Which Desktop process launches the embedded Code engine, with what executable and argument structure?

The launch tracer watches Windows process-start events, resolves the new process immediately where possible, follows matching process descendants, and persists only **sanitized** command-line data.

## Capture

Run on the disposable Windows PC before launching the Desktop specimen:

```powershell
node .\tools\specimen\Observe-SpecimenLaunch.mjs `
  --duration 180 `
  --lab "$env:USERPROFILE\clcode-specimen-lab"
```

Default process-name/path matcher:

```text
claude|anthropic
```

If the relevant Desktop root PID is already known, include it so descendants with generic names are retained:

```powershell
node .\tools\specimen\Observe-SpecimenLaunch.mjs `
  --duration 180 `
  --root-pid 12345
```

The tool writes:

- `launches.jsonl`
- `summary.json`
- `REPORT.md`

under the local specimen lab.

## Data boundary

The internal Windows watcher uses `Win32_ProcessStartTrace`, then attempts to resolve the new PID through `Win32_Process` to obtain executable path and command-line structure.

Raw watcher JSON flows only through the observer process pipe. The Node wrapper sanitizes the command line **before it is persisted**.

The sanitizer redacts common forms including:

- Bearer-like credentials;
- `sk-...` keys;
- `--api-key`, `--token`, `--access-token`, authorization/password/cookie/client-secret variants;
- key/token assignments;
- credential-like URL query parameters such as `?t=`, `token=`, `access_token=`, `api_key=`.

Do not treat this as a proof that every possible future credential syntax is covered. Review local evidence before sharing it.

The tracer intentionally does **not** collect:

- process memory;
- environment blocks;
- cookies;
- request bodies;
- auth headers;
- filesystem contents.

## Relevance filtering

A launch event is retained when:

1. its process name/path matches the configured regex; or
2. its parent PID was already retained; or
3. it is the explicitly supplied root PID.

This lets a generic helper/engine executable remain in the observed chain once it descends from a known Desktop process.

## Mechanical self-test

```powershell
node .\tools\specimen\Test-LaunchRedaction.mjs
```

The self-test passes in the implementation environment and verifies:

- normal model/process arguments survive;
- API-key/token/query-token values are redacted;
- structured launch events contain numeric PID/PPID;
- a matching Desktop process is retained;
- a generically named child of that process is retained;
- an unrelated process is rejected.

All Node modules pass `node --check`.

## Windows validation still required

`process-start-watch.ps1` requires Windows PowerShell 5.1 and WMI process-start events. It has not been executed by this development environment.

First physical validation should establish:

- subscription to `Win32_ProcessStartTrace` succeeds for a normal user;
- a Desktop launch generates process-start records;
- executable/command-line resolution succeeds often enough to identify the engine boundary;
- no raw secret-bearing command line is written to disk;
- descendants of the Desktop process are retained;
- watcher shutdown removes its event subscription cleanly.

A negative result is acceptable; if command-line resolution misses a short-lived engine process, record that and switch to a stronger Windows-native tracing method rather than inventing evidence.

## How to use the result

Combine three evidence sets:

1. PR #6 static candidate map;
2. PR #3 periodic runtime/TCP process evidence;
3. this launch/parent/command-line evidence.

The strongest first surgery target is a seam supported by more than one of those sources.

Example outcome:

- static map finds a candidate engine launcher;
- launch trace shows Desktop spawning that executable with a session/config path;
- runtime observation shows the child owns the long-lived Code session;
- then PR #7 can apply one hash-pinned reversible instrumentation patch to test ownership.

## Evidence boundary

A launch command proves that one process started another with a particular sanitized argument structure. It does not by itself prove which process owns inference, auth, tools or session state.

No real Desktop specimen has been traced by this PR.
