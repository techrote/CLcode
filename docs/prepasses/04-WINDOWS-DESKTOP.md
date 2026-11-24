# CLcode PREPASS-04 — Disposable Windows bootstrap and first desktop vertical slice

**Status:** source-researched implementation/acceptance plan; **NOT** a report of a Windows run.  
**Prepared:** 2026-11-23. **Owner test environment:** separate disposable Windows PC, initially with no Claude Code installed, no VM and no assumed remote access.  
**Assignment boundary:** this document only. No executable, installer, fixture, credentials, telemetry or CI has been deployed by this prepass.

## Contents

1. [Evidence and boundaries](#1-evidence-and-boundaries) — pinned source, proven code paths, and what remains untested.
2. [Desktop shell decision](#2-desktop-shell-decision) — compare low-friction Windows shells and choose the first.
3. [Executable Windows bootstrap](#3-executable-windows-bootstrap) — tools, checkout, isolation and version capture.
4. [Fixture repository](#4-fixture-repository) — an intentionally failing Node test requiring genuine model edits.
5. [First runnable architecture](#5-first-runnable-architecture) — the narrow shell, controller and provider/tool boundary.
6. [Desktop screen specification](#6-desktop-screen-specification) — only the controls needed for an inspectable run.
7. [First operator journey](#7-first-operator-journey) — from launch through real edit, test, diff and commit.
8. [GPTopus panel launch](#8-gptopus-panel-launch) — hostless configuration procedure and honest limitations.
9. [Acceptance: E01, E06, E07, E08](#9-acceptance-e01-e06-e07-e08) — reproducible pass/fail evidence and gate dependencies.
10. [Remote versus physical verification](#10-remote-versus-physical-verification) — what Codex can establish without the PC.
11. [Failures and diagnostics](#11-failures-and-diagnostics) — bounded troubleshooting without infrastructure proliferation.
12. [Implementation order and first prototype recommendation](#12-implementation-order-and-first-prototype-recommendation) — the shortest executable handoff.

## 1. Evidence and boundaries

Read alongside [ROADMAP](../ROADMAP.md), [PLAN](../PLAN.md), and [EXPERIMENTS](../EXPERIMENTS.md). The roadmap supplies execution order; experiments is the only authority for actual PASS/FAIL records. This file is preparation, not a substitute for those records.

**Source pinned for research:**

- GPTopus: [`849627463c3e2be660f9d24976320b072c107b34`](https://github.com/techrote/Chlaude-GPTopus/commit/849627463c3e2be660f9d24976320b072c107b34), NOT the moving `ultra/004-integration` tip.
- The [configuration entry point](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/scripts/oai-config.mjs) imports Node built-ins and local modules, exposes `createConfigServer` and `parseArgs`, binds `127.0.0.1`, defaults to a random port, prints a per-launch token URL and has an idle/closed-page shutdown. It has an executable CLI entry point. The plugin's [package.json](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/package.json) specifies Node `>=20.11.0` and no npm runtime dependencies.
- [`oai-config-core.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/scripts/oai-config-core.mjs) selects Windows *user environment variables* by default, but `OAI_CONFIG_STORE` selects a JSON file and `OAI_CONFIG_STATE_DIR` isolates UI state. Use **both** overrides for the first Windows trial.
- [`oai-config.mjs` steering](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/scripts/oai-config.mjs) sends WebSocket tips to `steer.listRuns(..., {includeEnded:false})` and rejects absent targets. [`bridge/steer.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/steer.mjs) has file-backed run/tip records; [`bridge/convo.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/convo.mjs) has editable conversation records. Neither fact establishes **independent run creation**.
- [`hooks/register.js`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/hooks/register.js) uses Claude Code host APIs (`on('session.start')`, `host.info`, `host.model`, native capabilities). Do not mistake those registered commands for a host-independent agent runtime.
- The donor plugin source carries an [MIT license](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/LICENSE); confirm applicable file notices before adapting code. This says nothing about permission to redistribute Anthropic Desktop/Code binaries.

**Inference, not demonstrated:** the Node panel should be runnable without Claude installed, based on its imports and entry point. **Untested here:** actual Windows launch, UI navigation, configuration durability, direct provider inference, worker spawning, tool execution, desktop shell, Windows native dependencies, and network audit. Record these under the proper E-cards after physical execution.

**Hard boundaries:** the product target is Desktop Code, not the standalone Claude Code CLI; do not place proprietary Anthropic binaries in the public CLcode repository; do not provision a VM, hosted desktop, CI matrix, auto-updater or installer yet; do not assume the coding agent can drive the disposable Windows GUI from GitHub. The Desktop Code specimen on that PC may be modified invasively once the specimen track begins.

## 2. Desktop shell decision

The minimum environment is Windows 11 (preferred disposable evaluation target) or a currently supported Windows 10 configuration, Node.js LTS + npm and Git. No dedicated GPU is required for the **shell** or a remote-model run; a local model has separate RAM/VRAM requirements determined by the chosen model, not by CLcode. Confirm the OS build/architecture and hardware on the actual PC rather than inventing a minimum specification.

| Route | Practical prerequisites and upside | Cost/risk for the first slice | Decision |
| --- | --- | --- | --- |
| **Electron** + Node + plain HTML/CSS/JS | Node/npm already needed for GPTopus; native folder dialog, window, DevTools and IPC; Electron obtained as an npm development dependency | Larger download/process footprint and bundled Chromium; enforce renderer isolation | **Choose for first runnable slice** |
| **C# WinForms/WPF + WebView2** | Windows-native window and system WebView2; compact UI; straightforward OS dialogs | Needs .NET SDK, WebView2 SDK bindings and a separate Node controller/IPC bridge | **Viable later**, especially for Windows-only product |
| **Tauri v2** | Small webview-backed Rust host; WebView2 renderer | Rust toolchain + Microsoft C++ Build Tools + additional interop beside the Node/GPTopus reference | **Defer** |
| **Wails v3** | Go application with system WebView2, comparatively lean executable | Go toolchain and a Go ↔ Node boundary, with no current CLcode Go components | **Defer** |
| **`msedge --app` / bare browser** | Useful to preview a web page without compiling a shell | Browser tab/app-window is not a controlled, independent CLcode desktop product | **E01/UX preview only; not E07** |

The [Electron installation](https://www.electronjs.org/docs/latest/tutorial/installation) and [prerequisites](https://www.electronjs.org/docs/latest/tutorial/tutorial-prerequisites) require Node/npm and support `npm install --save-dev electron` / `npx electron .`. Its [security guidance](https://www.electronjs.org/docs/latest/tutorial/security) specifically requires restricted preload IPC, sandbox, `contextIsolation` and no renderer Node integration. [Microsoft's WebView2 distribution guide](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution) says the runtime is preinstalled on Windows 11 but must still be checked on target machines. [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) require Rust, MSVC C++ Build Tools and WebView2 on Windows; [Wails v3](https://wails.io/faq/) uses Go and WebView2. [Node's release schedule](https://nodejs.org/en/about/previous-releases) identifies current LTS lines; prefer a current LTS installer rather than the plugin's older floor.

**Recommendation is for a development window, not shipped packaging.** A repository-local pinned Electron devDependency (with lockfile once implemented), `npm run desktop`, an unbundled Node controller, and static frontend files suffice. No Forge, Vite, React, new design system, native compilation or installer until an actual integration need is demonstrated. Use Electron developer tools for debugging; keep the UI a small DOM application.

## 3. Executable Windows bootstrap

Perform the following **only on the separate disposable Windows PC** in ordinary Windows PowerShell. No Claude Code installation and no main-PC configuration changes. Use a dedicated Windows user if convenient, but a separate account is not a substitute for the process/file capability boundary.

### A. Tool check and install only what is missing

~~~powershell
$PSVersionTable.PSVersion
[System.Environment]::OSVersion.Version
Get-Command git, node, npm.cmd, winget -ErrorAction SilentlyContinue |
  Select-Object Name, Source
git --version
node --version
npm.cmd --version
~~~

If Git or Node is missing and `winget` is available, install only that item:

~~~powershell
winget install --id Git.Git --exact --source winget
winget install --id OpenJS.NodeJS.LTS --exact --source winget
~~~

Open a **new** PowerShell window after installation and re-run the checks; record exact versions. If `winget` is absent, obtain [Git for Windows](https://git-scm.com/install/windows) and [Node LTS Windows MSI](https://nodejs.org/en/download/) from their official sources; do not install a separate package manager for this trial. Windows PowerShell, File Explorer, Task Manager, Resource Monitor (`resmon.exe`) and browser DevTools are sufficient at first. VS Code is optional; no Visual Studio, Python, Rust, Go or C++ build tools in the baseline.

If `npm` runs into PowerShell's `npm.ps1` execution-policy restriction, use **`npm.cmd`**; do **not** relax machine-wide execution policy.

### B. Isolated workspace and source pin

~~~powershell
$lab = Join-Path $env:USERPROFILE 'clcode-lab'
New-Item -ItemType Directory -Force -Path $lab | Out-Null
Set-Location $lab

git clone https://github.com/techrote/CLcode.git
git clone https://github.com/techrote/Chlaude-GPTopus.git

$gpRef = '849627463c3e2be660f9d24976320b072c107b34'
git -C (Join-Path $lab 'Chlaude-GPTopus') checkout --detach $gpRef

git -C (Join-Path $lab 'CLcode') rev-parse HEAD
git -C (Join-Path $lab 'Chlaude-GPTopus') rev-parse HEAD
git -C (Join-Path $lab 'CLcode') status --short
~~~

Check the GPTopus output **exactly equals** `$gpRef`. If checkout fails, stop and investigate the reference instead of substituting a branch head. Do not run GPTopus's host/plugin `install.ps1`: E01 needs only its standalone Node script, not the Claude plugin installation.

Create a segregated data root for the panel, fixture copies and sanitized evidence:

~~~powershell
$state = Join-Path $lab 'state'
New-Item -ItemType Directory -Force -Path $state | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $lab 'evidence') | Out-Null
$env:OAI_CONFIG_STORE = Join-Path $state 'gp-config.json'
$env:OAI_CONFIG_STATE_DIR = Join-Path $state 'gp-ui'
~~~

`OAI_CONFIG_STORE` prevents E01 settings from writing Windows `HKCU\Environment`. `OAI_CONFIG_STATE_DIR` prevents E01 panel state from going to its normal `%LOCALAPPDATA%\ClaudeOpenAIWorkers` directory. These values apply to **this PowerShell process and descendants only**; set them again in each fresh session. No API key is required to prove E01.

### C. Tools, credentials and process boundary

- Obtain a narrowly scoped **authorized non-Claude provider** only for E02/E06 onward (e.g. an existing OpenAI Responses/compatible or NVIDIA provider, or LM Studio if the disposable PC can genuinely host the selected local model). Do not assume a free tier, credit balance or model capability. A provider must be confirmed to support the tool protocol selected by the independent runtime.
- Never place API credentials in source, test fixtures, URL parameters, screenshots or issue/PR comments. Prefer the existing GPTopus Windows DPAPI key-setting scripts (`set-openai-key.ps1` / `set-nvidia-key.ps1`) **after their semantics are reviewed** or an independently implemented OS credential adapter. If an ephemeral process environment variable is used, keep it confined to the controller process and clear it afterward. Do not use `setx`, global environment keys or unrestricted main-account credentials.
- The local workspace is a **tool boundary**: allow only the chosen fixture root, explicit commands, the selected inference endpoint and a bounded step/time/cost budget. A disposable disk does not make external credentials or Git pushes disposable.
- Keep an unredacted access-token URL and all provider keys **on that PC only**. Later CLcode diagnostic logs go to a user-data folder (e.g. `%LOCALAPPDATA%\CLcode\logs`), with secret redaction, and are never committed by default.
- Start in a normal user session. Elevation is only for a specifically approved diagnostic (such as an optional Windows packet capture), never the default CLcode process.

## 4. Fixture repository

Use a separate local Git repository, **not CLcode's own source tree**. The smallest credible test is a deliberately incomplete function plus failing built-in Node tests. It requires no npm packages, database, web server, Python or network access.

~~~text
clcode-lab/
  CLcode/                  # source checkout
  Chlaude-GPTopus/         # donor checkout pinned detached
  state/                   # E01 isolated config and UI state
  evidence/                # private, sanitized records
  fixture-slugger/         # E06 local Git repo
    package.json
    src/slug.mjs
    test/slug.test.mjs
  fixture-e07/             # fresh local clone of baseline fixture
~~~

Run in PowerShell after defining `$lab` above:

~~~powershell
$fx = Join-Path $lab 'fixture-slugger'
New-Item -ItemType Directory -Force -Path (Join-Path $fx 'src'), (Join-Path $fx 'test') | Out-Null

@'
{"name":"clcode-slugger-fixture","private":true,"type":"module","scripts":{"test":"node --test"}}
'@ | Set-Content -LiteralPath (Join-Path $fx 'package.json') -Encoding ascii

@'
export function slugify(value) {
  return String(value).trim().toLowerCase();
}
'@ | Set-Content -LiteralPath (Join-Path $fx 'src/slug.mjs') -Encoding ascii

@'
import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/slug.mjs';

test('normalizes punctuation and whitespace', () => {
  assert.equal(slugify('  Hello,   Windows! '), 'hello-windows');
});
test('joins multiple words', () => {
  assert.equal(slugify('Read / Edit / Test'), 'read-edit-test');
});
'@ | Set-Content -LiteralPath (Join-Path $fx 'test/slug.test.mjs') -Encoding ascii

git -C $fx init -b main
git -C $fx config user.name 'CLcode Fixture'
git -C $fx config user.email 'clcode-fixture@localhost.invalid'

Push-Location $fx
node --test
$initialExit = $LASTEXITCODE
Pop-Location
if ($initialExit -eq 0) { throw 'Fixture unexpectedly passes; inspect setup' }
# Red is expected at baseline. Freeze the broken fixture as a local commit.
git -C $fx add .
git -C $fx commit -m 'fixture: intentionally incomplete slugify'
git -C $fx status --short

$fxE07 = Join-Path $lab 'fixture-e07'
git clone $fx $fxE07
git -C $fxE07 remote remove origin
git -C $fxE07 config user.name 'CLcode Fixture'
git -C $fxE07 config user.email 'clcode-fixture@localhost.invalid'
git -C $fxE07 switch -c e07-run
git -C $fx switch -c e06-run
~~~

Before E06/E07, both working trees should be clean and the test should fail. The agent is explicitly supposed to make the test pass. Compare and retain the baseline commit ID; avoid accidentally testing E07 against E06's already-fixed files. **No remote is configured** for these execution branches.

The runtime's initial policy can expose four narrow real tools: `read_file(relativePath)`, `apply_patch(patch)`, `run_test(['node','--test'])` and `git_local(status/diff/commit)`. Enforce path canonicalization and root containment in the tool executor, not in a model prompt. Allow a new test command only if the owner explicitly broadens the scope. No arbitrary PowerShell command, network tool, package installation or remote `git push` is needed.

## 5. First runnable architecture

~~~text
[Electron BrowserWindow]
  static HTML/CSS/JS: project/session/model/chat/tools/diff/worker views
  contextIsolation: true; nodeIntegration: false; sandbox: true
                |
     [restricted preload IPC]
                |
  [Electron main: folder picker + controller process manager]
                |
    [local Node controller, real run lifecycle]
      journal + session data     provider adapter     scoped tools
      run/steer/cancel/status -> selected non-Claude -> read/edit/test/git
                |
     [optional, separate GPTopus config server]
         browser control panel (E01), NOT an agent host
~~~

**Initial division:** Electron owns the window, project picker and UI IPC. A separate local Node process owns provider requests, run states, tool execution, cancel/steer and event journaling; do not require a Claude process. During development Electron can spawn a known `node` executable from its main process with explicit script arguments, `shell: false`, captured stdout/stderr and bounded shutdown. Its child-process lifecycle must be tested on Windows; packaging/replacement of the system Node binary is a **later** decision. If the controller is implemented as an in-process main-module for the very first static UI, split it before allowing real filesystem/process tools.

**Small contract (not a new orchestration framework):**

~~~text
openProject(selectedFolder) -> canonical projectId + repo status
listModels() -> configured and actually callable principal models
newSession(projectId, modelId) -> sessionId
spawn({sessionId, modelId, prompt, budget}) -> runId
events(runId, cursor) -> ordered events
status(runId) -> phase, active tool, usage, budget
steer(runId, text) -> queued/delivered/rejected (truthful)
cancel(runId) -> requested/terminated and final state
listRuns(projectId) -> active/recent real runs
diff(runId) -> local Git diff relative to baseline
~~~

A run journal (JSONL is enough initially) stores timestamp, run ID, session ID, provider/model, events, tool inputs/results with redaction, exit codes and final status. A small JSON index stores project/session list and last selected model. Store under the app's user-data folder; use atomic writes for the index. On restart, show past conversation and diffs; if an interrupted run cannot be recovered, mark it **interrupted**, not silently `running` or falsely `resumed`. Separate run persistence from GPTopus's provider-conversation store; the latter isn't a substitute for a coding session journal.

The principal model must actually choose the next tool call from observed context; the supervisor may validate and execute calls, but must not contain a hard-coded slug fix or replay a transcript. The initial worker list contains **one real principal worker**; delegated workers appear only once implemented. Steering must be observed by the run on a following turn and labeled `delivered` only after consumption. Stop must actually cancel provider work when supported and terminate/collect the live tool subprocess. No dummy buttons, fabricated usage or cosmetic statuses.

Security minimum: renderer loads local static assets only; no arbitrary website navigation, unrestricted Node globals, generic `exec` IPC, secret exposure or broad filesystem APIs. Electron's [contextBridge pattern](https://www.electronjs.org/docs/latest/tutorial/context-isolation) should expose typed methods rather than raw `ipcRenderer`. The controller enforces realpath-normalized project scope, tool allowlist, output/time caps, and a provider endpoint allowlist. File edits are journaled before/after and shown as a real Git diff. The fixture has no remote Git writes.

## 6. Desktop screen specification

One ordinary resizable desktop window; plain CSS grid is sufficient. Render actual state, not a mock screenshot.

~~~text
+------------------------------------------------------------------------+
| CLcode  [Open folder] [Project: fixture-e07] [New session]  [Settings] |
+--------------------+-----------------------------------+---------------+
| Projects / sessions| Session: active | Model: [select] | Inspector     |
|                    |-----------------------------------| [Diff] [Logs] |
| fixture-e07        | User prompt                       | changed files |
|  - session 001     | Model output / reasoning summary  | line diff     |
|                    | Read file: src/slug.mjs           | test exit     |
|                    | Patch applied: src/slug.mjs      | cost/usage    |
|                    | Test: node --test -> 0           |               |
|                    | Commit: <local SHA>              |               |
|                    |-----------------------------------|               |
|                    | [prompt input] [Run] [Stop]       |               |
|                    | [steer input] [Steer]             |               |
+--------------------+-----------------------------------+---------------+
| Workers: [principal  model  phase  step  budget]       [Inspect]        |
+------------------------------------------------------------------------+
~~~

| Component | Minimum behavior | Exclusions |
| --- | --- | --- |
| Project picker/list | OS folder-selection dialog, selected root, clean/dirty Git status, safe canonical path | Worktrees, multiple editor windows, directory indexing |
| Session list | New/select session; persistent transcript across app restart | Search, compaction UI, cloud sync |
| Model selector | Only validated non-Claude profiles; visible endpoint class and key configured/missing | Unconnected fake models; universal provider-settings rewrite |
| Transcript/prompt | User input, model text, event timestamps, errors | Rich Markdown editor, elaborate message branches |
| Tool event feed | Actual tool name, arguments (redacted), start/end, stdout/stderr, exit code | Collapsing away errors or replacing real tools with animation |
| Diff inspector | `git diff` for edited fixture and committed change (`git show` if already committed); inspect file and patch | Full IDE/editor or invented diff previews |
| Worker strip | Real principal run, status, current tool and budget; inspection link | Artificial subagent tree |
| Run/Stop/Steer | Start/stop state from controller; steer queued/delivered truthfully | Claimed pause/resume without semantics |
| Settings | Open the separate GPTopus E01 panel when running or local CLcode model-profile selection | Treating a settings page as a Code workspace |

On a narrow window, inspector may become a tab rather than a second window. Prefer usable content, keyboard navigation and selectable/copyable tool text over styling and animation.

## 7. First operator journey

1. The owner opens PowerShell **on the disposable PC**, enters the CLcode checkout and launches the prototype with `npm.cmd run desktop` **once Codex has actually added the corresponding project files and script**. This command does not exist at the research baseline; don't present it as already runnable. A normal Electron window opens with a visible connection/status indicator, not a browser tab.
2. Choose `clcode-lab\fixture-e07` using **Open folder**. CLcode shows the project root, local branch `e07-run` and a clean baseline status.
3. Select a **confirmed working non-Claude principal model**. A missing key, unavailable local endpoint or unsupported tool-call protocol must produce an actionable error before starting the run.
4. Start a new session and submit: **“Read `src/slug.mjs` and `test/slug.test.mjs`. Fix `slugify` to pass both existing tests. Run `node --test`. Commit the change on this local branch. Do not touch paths outside this folder, install packages, use the network for tools or push a remote.”**
5. Observe a genuine provider request and model-driven `read_file`; the transcript shows tool calls and returned file contents. The model requests a patch, the scoped executor applies it, and a real diff appears. A model response which simply *describes* an edit fails.
6. Observe `node --test` invoked by the real controller; inspect exact exit status, both test results and stderr/stdout. If the first attempt fails, allow the model to inspect and correct the failure within bounded steps. Confirm the agent makes a **local** commit, with its actual SHA.
7. Inspect the changed-file diff (`git show HEAD` after commit), worker status and end-of-run summary. Stop/steer should not be depicted as successful unless visibly executed; if the run is already ended, steering must reject cleanly.
8. Close and reopen CLcode. Project/session transcript and last diff/commit should still be accessible; never claim a terminated provider call resumed automatically unless that is genuinely implemented.
9. Capture the specific Windows observations required for E07/E08, using local sanitized evidence. Only the owner/PC operator can report actual GUI appearance, keyboard usability, popup/permission behavior, process-tree shutdown and network results.

## 8. GPTopus panel launch

**E01 is independently runnable before CLcode's Electron app exists.** In the disposable PC's PowerShell, after `$lab` and the two `OAI_CONFIG_*` variables from `3` are set:

~~~powershell
$gp = Join-Path $lab 'Chlaude-GPTopus'
Set-Location $gp
node .\plugins\openai-workers\scripts\oai-config.mjs --no-open --port 0 --idle-minutes 30
~~~

The source prints a URL of the form `http://127.0.0.1:<random-port>/?t=<per-launch-token>`. **Use the exact URL shown locally** in the browser on that same PC; never paste it into GitHub. Keep the console open; Ctrl+C terminates the server. If `--no-open` is removed, the script attempts to launch the default browser. The UI's legacy “restart Claude Code” banner is a GPTopus-specific restart hint, **not** evidence that Claude exists or that CLcode picked up settings.

For E01, select a harmless setting such as the global worker step limit (if exposed by the loaded schema), save a valid changed value, refresh, close the tab/server, re-run the same script **with the same isolated store/state variables**, and verify the value persisted. Verify the settings file and state folder exist only under `clcode-lab\state`. Open a tokenless URL or a wrong-token API request and expect rejection; do not test using real secrets. Inspect port ownership if the panel seems inaccessible. Note that closing the browser tab eventually ends the server; restart it to obtain a **new** token URL.

Panel implementation facts to use in Codex work:

- `GET /` checks the query token and serves `oai-config.html` under a restrictive CSP.
- `GET /api/schema` and `GET /api/state` require the `x-oai-token` header; writes (e.g. `POST /api/set`) also require that header and JSON bodies.
- `/ws` checks the token, Host and Origin. The panel provides worker status, steer tips, editable provider conversations and configuration. Do not expose the listener on `0.0.0.0` or forward it over a public tunnel.
- `handleConsoleMessage` targets **live preexisting** `steer` run records. It cannot demonstrate `spawn`. The fact that a conversation file can be edited does not make it the authoritative CLcode session journal.
- A future `Settings` action may open the exact one-time local URL in the user's browser, but token parsing, lifetime and secret-safe logging must be handled. Avoid embedding the existing GPTopus page in the main Code view until its browser/Origin assumptions have been tested.

No `npm install` or proprietary Claude host is indicated by **this pinned server's imports**; a runtime launch remains a required physical experiment before making any stronger claim. The current panel launch proves neither E02 nor E06.

## 9. Acceptance: E01, E06, E07, E08

All four are **NOT RUN at time of writing**. The owner should write dated results into [EXPERIMENTS.md](../EXPERIMENTS.md) using its entry template, with OS, exact CLcode/GPTopus SHAs, model/provider, sanitized logs and **observed versus expected** clearly separated.

| Experiment | Procedure and strict PASS | Evidence to retain | Failure or insufficient result |
| --- | --- | --- | --- |
| **E01 — hostless GPTopus panel** | Fresh Windows user session; no Claude Code installed/process running; run `oai-config.mjs`; open actual tokenized UI; change harmless setting; restart server; persisted value survives; missing/wrong token denied | Node version, donor SHA, sanitized command line, chosen setting before/after, store path, HTTP status codes, actual UI observation | Static code reading, tokenless page, settings only in memory, Claude-host hook invoked |
| **E06 — independent agentic coding** | Independent controller starts a **new** run using an authorized non-Claude model; model truly reads fixture source/test, decides edits and test tool calls; test goes from baseline failure to exit 0; a local commit exists on `e06-run`; diff and tool chronology inspectable | Provider/model + request IDs (redacted), run ID, tool-event trace, exit code, `git status`, `git show --stat`/`git show`, resulting local SHA, bounded cost | Model writes an answer only; scripted patch; Claude-hosted tool execution; tests faked; no commit; unscoped tool access |
| **E07 — interactive CLcode desktop** | From clean `fixture-e07` baseline, owner launches independent **Electron app** and runs E06-equivalent task inside it: folder/session/model selection, live prompts/tool results, worker status, diff/test inspector, stop/steer state, session persistence and real local commit | Screen recording or actual owner observations, app/controller PIDs, selected Git SHA, run + session IDs, test output, diff, restart/reopen result, crash/stop behavior | Electron window with decorative mock data; browser-only config page; CLI-only run; hidden tool execution; stale session or fake status |
| **E08 — zero Anthropic inference** | During the E07 run, verify **no Anthropic/Claude Code executable is required**, no Anthropic credential is provisioned, all principal requests use the selected non-Claude provider, and process/network evidence shows no requests to Anthropic inference endpoints | Provider-router destination/request audit, actual OS process tree, process-owned network capture or controlled egress observation (see below), exact time window, provider response metadata; state method and limits | “No Anthropic key” alone; empty app log; sampled `netstat` only; assuming no network because no Claude is installed |

**Gate order:** E01 independent control-panel proof; E02/E03/E04 (covered in other prepasses) before E06; E06 before E07; E08 measured **during** E07. `CLCODE-BOOT-001` requires E06 + E07 + E08, with E01 independently recorded, not merely the appearance of an Electron app.

### E06 mechanical checks (on the disposable PC)

~~~powershell
$fx = Join-Path $lab 'fixture-slugger'
git -C $fx status --short
git -C $fx log -2 --oneline
git -C $fx show --stat --oneline HEAD
git -C $fx show --format=fuller HEAD
Push-Location $fx
node --test
$testExit = $LASTEXITCODE
Pop-Location
"Post-run test exit: $testExit"
~~~

A clean working tree after commit, `$testExit = 0` and a genuine diff are necessary but not sufficient: the trace must show the **model** issued reading, editing, testing and commit actions through the independent runtime. Retain the baseline fail output separately to prove the test wasn't already passing.

### E08 physical process/network observation

First, implement a **local, redacted provider request ledger** in the independent controller: timestamp, run ID, provider/model, configured destination hostname, request ID, outcome. Reject unexpected inference hostnames in the provider adapter itself. This is ordinary local diagnostic logging, **not** a telemetry service. Record that the test provider actually returned a response; avoid silently falling back to an Anthropic transport.

On Windows, inspect processes and live connections while E07 executes:

~~~powershell
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match '^(node|electron|claude)(\.exe)?$' } |
  Select-Object ProcessId, ParentProcessId, Name, CommandLine
Get-NetTCPConnection -State Established |
  Select-Object OwningProcess, RemoteAddress, RemotePort, State
Get-DnsClientCache |
  Where-Object { $_.Entry -match 'anthropic|claude' }
~~~

These commands provide **supporting clues**, not a rigorous absence proof: short-lived connections can be missed; DNS cache may include unrelated activity; HTTPS hides URL paths. For a high-confidence E08 record, the PC operator can, **with explicit approval and any required elevation**, capture the bounded E07 run using Windows' built-in `netsh trace start capture=yes tracefile=<local-private.etl> report=no persistent=no`, then `netsh trace stop`; analyze destination ownership/hostnames against the controller ledger and the approved-provider egress policy. Trace files may contain sensitive network data: retain privately and share only sanitized findings. Alternatively use an already approved process-aware network monitor/proxy if the PC has one; do not build a bespoke sniffer, cloud traffic collector or telemetry system.

Report `E08 = NOT MEASURED` if full-process/network observation or an enforced egress boundary is not available; an absence of visible errors is not PASS. The network claim concerns **inference**; unrelated permitted OS/browser traffic must be separated by process and endpoint rather than confused with provider calls.

## 10. Remote versus physical verification

| Codex can do from GitHub/source or an available ordinary non-GUI coding environment | Requires the disposable Windows PC/operator |
| --- | --- |
| Pin donor commit, inspect imports and license, document dependency graph | Check that the pinned script actually starts on this Windows build without Claude |
| Implement and test config adapter/controller state transitions with synthetic stores | Navigate the real GPTopus HTML/WS UI, save setting, restart, verify auth and persistence |
| Implement Node test fixture, tool validators, provider protocol contracts, and local smoke tests **where a runtime exists** | Supply an authorized provider/LM Studio endpoint, observe live model behavior, secrets handling and provider costs |
| Review Electron main/preload/renderer, enforce IPC schema, audit that only the assigned source files changed | Confirm native folder picker, usable resizing/text selection, focus/keyboard events and diff inspector |
| Validate simulated event streams, redaction and cancellation edge cases with focused tests | Verify real subprocess tree, restart behavior, Ctrl+C/Stop effects and no orphaned tools |
| Inspect `git diff --check`, file scope and PR review without running CI | Observe actual Windows tool execution, file-system restrictions and complete E06/E07 workflow |
| Check source cannot deliberately route to Anthropic and record configured endpoints | Record actual E08 process/network activity over the bounded real run |

A GitHub review or green unit test **cannot** mark E01, E06, E07 or E08 PASS. Codex must not invent screenshots, user observations, provider responses or Windows console transcripts. If it cannot access the PC, it should deliver runnable source + precise operator instructions and leave physical experiments `NOT RUN`.

**Evidence handoff format:** UTC timestamp, Windows version/build, Node/Electron versions, CLcode/GPTopus SHAs, provider/model, fixture baseline/result SHA, actual command, run/session ID, observed UI and tool events, test exit, redacted network method/results, known limitations, PASS/FAIL/PARTIAL/BLOCKED. Keep screenshots/traces locally until scrubbed. The owner can paste the sanitized record back into `docs/EXPERIMENTS.md` in a separate authorized work slice.

## 11. Failures and diagnostics

| Symptom | First diagnostic | Minimal correction or honest outcome |
| --- | --- | --- |
| `node` / `git` / `npm.cmd` not found | `Get-Command node,git,npm.cmd`; open new terminal | Install only missing signed tools, correct PATH; no global package-manager stack |
| `npm.ps1 cannot be loaded` | Check whether `npm.cmd --version` works | Use `npm.cmd`; do not relax execution policy |
| GPTopus checkout doesn't match pin | `git -C $gp rev-parse HEAD` | Stop; use exact SHA or record blocker; never substitute moving tip |
| Panel server doesn't launch | Run CLI in foreground; inspect first error, `node --version`, path/cwd | Fix missing file/Node version; E01 BLOCKED until physical launch |
| Panel 401/403 or page blank | Use exact printed local URL; verify correct Host/Origin/token and same machine | Restart server for fresh token; do not disable token/CSP/Origin enforcement |
| Port unavailable or wrong process | Use `--port 0`; `Get-NetTCPConnection -State Listen` and process PID | Avoid hard-coded port; stop only the owned process |
| Settings disappear after restart | Print only **paths**, not secret values: `$env:OAI_CONFIG_STORE` and `$env:OAI_CONFIG_STATE_DIR` | Restore same paths in new PowerShell; verify JSON store and UI state under `state` |
| Server exits after tab closes | Confirm source idle/heartbeat rules; rerun CLI | Expected process lifetime; don't implement always-on service to fix E01 |
| Provider says unauthorized/unsupported | Inspect nonsecret model/route name, HTTP status and redacted request ID | Correct scoped credential/adapter; never retry endlessly or secretly switch providers |
| Local model request hangs | Check LM Studio endpoint, model load and machine resources | Use an authorized remote non-Claude model for initial proof; don't invent hardware minimum |
| Tool runs but no file changes | Compare tool events to `git status --short` / `git diff` | Mark E06 FAIL if model did not actually execute edit; inspect tool correlation |
| Patch fails on Windows paths/line endings | Show canonical path, patch target and `git diff --check` | Normalize paths inside executor; don't give model a broader filesystem scope |
| Test passes before model edit | Run baseline `node --test` and compare SHAs | Rebuild fixture from frozen intentionally-failing baseline |
| Git commit fails | `git -C $fx status --short`; local `git config user.name/email` | Configure identity **only inside fixture**; never require a remote push |
| Electron blank window / lost IPC | Open Electron DevTools and main-process console; inspect preload path | Fix local load/IPC/call error; do not replace GUI with terminal-only proof |
| Stop leaves Node/test process running | Inspect process tree (PID/parent) and controller cancel logs | Cancel actively; terminate only owned child tree after bounded grace; mark orphan as failure |
| UI says “steered” but run ignored it | Compare `queued` vs `delivered` event, provider continuation step | Report delivery failure; never claim steering from queue insertion alone |
| E08 shows unexpected host or uncertain egress | Compare transport destination log to OS trace and chosen provider | E08 FAIL or NOT MEASURED; disable unexpected route, do not claim independence |
| Evidence reveals token/content | Check local traces, screenshots and copied command lines | Redact before sharing; rotate affected credential if exposed |

Use one focused reproduction and the console/log that actually failed. Do **not** respond to a setup glitch by adding a standing CI job, installer, VM or generalized monitoring framework.

## 12. Implementation order and first prototype recommendation

**P0 — immediately, in GitHub:** Codex consumes PREPASS-01/02/03/04 as references; source-checks pinned GPTopus imports and the exact E-card criteria; implements a *small* Node controller with one real non-Claude provider and four scoped fixture tools. One real worker, one model at a time. Unit tests only for path containment, event ordering and cancellation; do not multiply integration harnesses.

**P1 — initial hands-on PC:** Owner runs `3` and E01 `8`. Prove hostless panel, isolated persistence and token protections. If E01 fails, fix the exact pinned launch/import/storage issue without installing Claude.

**P2 — agent proof:** Codex wires `spawn/events/steer/cancel` to its independent runtime and E06 fixture. Run it from a minimal local client until the non-Claude model genuinely completes a failing-to-passing Read → Edit → Test → local commit. No fake provider or host-owned worker can satisfy this.

**P3 — first actual desktop:** Add Electron development shell, static HTML/CSS/JS components from `6`, native folder dialog, session journal, real tool-event stream and Git diff inspector. `npm.cmd run desktop` should launch one visible CLcode window on the PC. Connect the **already-proved** controller rather than hiding a headless backend beneath cosmetic UI.

**P4 — physical acceptance:** Owner repeats E06-equivalent task in fresh `fixture-e07` and captures E07 + E08 observations. Reopen UI to verify persistent transcript, inspect model/tool/commit evidence and no Anthropic transport. Record GO/HOLD/STOP honestly in `EXPERIMENTS.md`. Only then consider a packaged Windows build, editor integration or additional workers.

### Exact first runnable artifact to target

A repository checkout from which **`npm.cmd run desktop` opens a Windows Electron Code window** with: Open folder, New session, one real non-Claude model selector, prompt/streamed response, tool chronology, actual Git diff, test output, single-worker status, working Stop/Steer, and persistent session history. A local Node controller executes the four real fixture tools; GPTopus's standalone configuration deck is launched separately and can be linked from Settings. No proprietary binary transplant, Claude installation, CLI-only handoff, generalized frontend framework or installer.

**Kill criterion:** if the UI cannot perform a real non-Claude Read → Edit → Test task with an inspectable diff and local commit, it is a preparatory prototype, **not** `CLCODE-BOOT-001`. If that works but E08 isn't observed, the independent-desktop milestone remains **HOLD**. Successful negative results narrow the next fix; they do not justify expanding infrastructure.
