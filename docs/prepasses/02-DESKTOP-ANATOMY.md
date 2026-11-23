# CLcode PREPASS-02 — Desktop Application Anatomy and Transplant Feasibility

**Research date:** 2026-11-23 (UTC)  
**Scope:** Claude **Desktop's Code experience**, not the stand-alone Claude Code CLI.  
**CLcode repository:** https://github.com/techrote/CLcode  
**GPTopus pinned reference:** https://github.com/techrote/Chlaude-GPTopus/commit/849627463c3e2be660f9d24976320b072c107b34  
**Research fidelity:** Review of official product documentation, version-qualified third-party observations, and pinned GPTopus source. **No live Claude Desktop specimen, independent CLcode application, gateway, or Windows acceptance test was run.**  
**Change scope:** This file only. No binaries, app patches, scripts, test infrastructure, or CI.

## Contents

1. [Executive decision and evidence discipline](#1-executive-decision-and-evidence-discipline) — ranked conclusion and the boundary between proof and conjecture.
2. [Claude Desktop anatomy](#2-claude-desktop-anatomy) — shell, remotely delivered renderer, embedded Code engine, IPC, updates, and services.
3. [Code workflows and data ownership](#3-code-workflows-and-data-ownership) — projects, sessions, transcripts, edits, diffs, terminals, tool runs, and agent state.
4. [Architectural diagrams](#4-architectural-diagrams) — present product versus a feasible independently owned CLcode.
5. [Actual interfaces and service dependencies](#5-actual-interfaces-and-service-dependencies) — public extension seams, the gateway boundary, auth, and egress.
6. [Component-level disposition](#6-component-level-disposition) — KEEP / ADAPT / REPLACE / REIMPLEMENT decisions with pinned GPTopus anchors.
7. [Three-strategy comparison](#7-three-strategy-comparison) — technical, legal, maintenance, credentials, and distribution trade-offs.
8. [Minimal disposable-Windows experiments](#8-minimal-disposable-windows-experiments) — evidence collection and smallest worthwhile UI proof.
9. [Codex's first question and implementation handoff](#9-codexs-first-question-and-implementation-handoff) — the time-saving critical path.
10. [Explicit unknowns and source index](#10-explicit-unknowns-and-source-index) — unresolved issues, falsification tests, and precise references.

---

## 1. Executive decision and evidence discipline

**Rank: C > B > A. Recommend Strategy C: independently implement a small CLcode graphical desktop shell over a CLcode-owned agent supervisor, reusing proven provider/control-plane elements from GPTopus.**

Reasoning:

1. Anthropic officially describes Desktop Code as a **graphical interface to an embedded Claude Code engine**, with settings passed to a separately launched engine process. That gives useful functional decomposition, **not** permission or a public protocol for replacing its backend. [Desktop Code 3P](https://claude.com/docs/third-party/claude-desktop/code).
2. The Desktop application **loads its application code and user content from Anthropic CDN hosts**. Retaining that frontend is not equivalent to owning it, nor to being operationally independent of Anthropic. [Desktop network access](https://code.claude.com/docs/en/desktop#network-access-requirements).
3. Official 3P model gateways are designed to serve **Claude models** via a Messages-compatible API. Anthropic explicitly does **not support non-Claude models through Claude Code gateways**. An alias or working response would be an unsupported experiment, not a general agent-substitution contract. [Desktop gateway](https://claude.com/docs/third-party/claude-desktop/gateway); [Code gateway policy](https://code.claude.com/docs/en/gateways).
4. A non-Claude principal must still own **agent orchestration, model turns, tools, permissions, session state and recovery**. Merely swapping inference does not do this. All truly independent strategies incur this engineering cost.
5. An independent React/Electron shell can display **real Git diffs, local terminals, file editing, session navigation and run events** using distributable software without reproducing private IPC, assets or update machinery.

This is an **architecture recommendation, not an implemented or accepted system**. As of this research, CLcode's [EXPERIMENTS.md](../EXPERIMENTS.md) still lists E01–E10 as NOT RUN.

### Evidence classifications used consistently below

| Label | Meaning | What it cannot prove |
| --- | --- | --- |
| **DOCUMENTED (D)** | A statement explicitly supported by official Anthropic documentation, independent protocol documentation, or a published component's own documentation. | A private wire format or current installed release unless specified. |
| **OBSERVED-SOURCE (O-S)** | Source code read at a named GPTopus SHA; or **third-party published observations** from a named Desktop version. The latter are not CLcode reproductions. | Behavior of a different current Windows build. |
| **HYPOTHESIZED (H)** | Architectural inference or an implementation option to be tested. | That it actually runs or that Anthropic licenses it. |
| **NOT RUN (N)** | No practical application/Windows/provider experiment carried out. | A PASS in any E01–E10 gate. |

**Version discipline:** official documentation was consulted **2026-11-23** and may update. A February 2026 reverse-engineering report about one macOS release is **not** a November 2026 Windows implementation measurement. Record Desktop About version, Code engine version, installer provenance, and binary SHA-256 for any future legal specimen observation before naming private interfaces or exact Electron/React versions.

**Important negative finding:** No **documented, stable, public Desktop Code renderer-to-arbitrary-backend API** has been identified. This is *not* proof that an undocumented private seam is absent; it is evidence that betting CLcode on such a seam would have a severe maintenance and permission burden.

## 2. Claude Desktop anatomy

### Components and confidence

| Component or concern | Finding | Evidence | Implication |
| --- | --- | --- | --- |
| **Outer application shell** | An unrelated independent inspection of macOS **@ant/desktop 1.1.4088**, build **2026-02-23**, reports **Electron 40.4.1**, Chromium **144.0.7559.173**, native addons and bundled app code. | **O-S, old macOS only:** [claude_echo research overview](https://github.com/Kotrotsos/claude_echo/blob/main/docs/00-OVERVIEW.md). | Electron is a well-motivated CLcode candidate, but do **not** assert this exact version or native module graph for today's Windows product. |
| **Frontend** | The same old report attributes the UI to **React 18.3.1** and web-delivered application views. A separate unofficial Code-tab extension reports a Code page under a **claude.ai/claude-code-desktop/** route. | **O-S, third party:** [claude_echo](https://github.com/Kotrotsos/claude_echo/blob/main/docs/00-OVERVIEW.md); [CCDEX](https://github.com/Saqoosha/CCDEX#how-it-works). **D:** [official CDN dependency](https://code.claude.com/docs/en/desktop#network-access-requirements). | No established stand-alone, distributable Code UI module. Do not depend on a remote proprietary page or scrape its DOM. |
| **Code agent engine** | Desktop Code runs the **same Claude Code engine** as terminal Code with a graphical session manager, but uses a **separately downloaded/updated embedded copy**. It can differ in version from a separately installed CLI. | **D:** [3P Code](https://claude.com/docs/third-party/claude-desktop/code), [Desktop reference](https://code.claude.com/docs/en/desktop#claude-code-version-in-the-code-tab). | The engine performs the consequential coding work; CLcode needs a genuinely independent substitute. |
| **Application-to-engine launch** | When launching Code, the Desktop app translates 3P configuration into Claude Code settings and sends keys as **environment variables or launch options**; other settings are managed policy. | **D:** [3P configuration propagation](https://claude.com/docs/third-party/claude-desktop/code#how-configuration-propagates). | A *configuration* interface, not an engine-plugin API. Actual process args, transports and RPC schema for current Windows are not publicly specified. |
| **Desktop-to-frontend IPC** | Unofficial CCDEX research describes private Electron preload/IPC behavior including **LocalSessions** events; there is **no verified public supported Desktop Code IPC schema**. | **O-S** [CCDEX methodology](https://github.com/Saqoosha/CCDEX#how-it-works); **H** exact current messages/dispatcher. | Do not anchor CLcode to private event names, session UUID schemas, injected scripts, Electron internals or vendor DOM. |
| **Services/background tasks** | Local Claude Code handles local file, terminal and tool actions; desktop tracks sessions, diffs, background tasks, integrated terminal, browser preview and possible GitHub PR operations; separately there are cloud, SSH, and Cowork paths. | **D:** [Desktop user-facing reference](https://code.claude.com/docs/en/desktop). Internal division among processes is not fully published. | Bootstrap should implement **local Code only**. Cowork's VM and cloud/SSH paths are **not** prerequisites for local editing/test/diff. |
| **Updates/distribution** | Windows has official installer/MSIX paths; Desktop updates on launch and maintains its **own embedded engine version/update stream**. | **D:** [Desktop troubleshooting and deployment](https://code.claude.com/docs/en/desktop). | The app/renderer/engine can change at different cadences. Private transplant patches imply constant requalification; CLcode's original shell has none of that proprietary dependency. |
| **Exact update plumbing** | A native Electron updater API exists in general, but a current Windows Desktop updater feed, signing method, Electron fuses, and patched-resource rejection mechanism were **not independently verified**. | **H** for Anthropic internals; [Electron generic autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater). | Do not claim Anthropic uses a specific updater implementation. No shell patching in this mission. |
| **Authentication/networking** | 3P deployment can run without a Claude account sign-in in MDM/local/bootstrap modes. The application nevertheless documents CDN access and may send telemetry and use other services. | **D:** [3P identity](https://claude.com/docs/third-party/claude-desktop/data-storage), [Desktop network](https://code.claude.com/docs/en/desktop#network-access-requirements). | **No Anthropic credentials** and **no Anthropic infrastructure** are distinct promises. Only a fully owned shell can aim for both. |

### A careful view of actual data/control boundaries

The *documented* sequence is: **Desktop Code GUI selects session/project/model/permissions → desktop launches an embedded Claude Code process with settings → Code engine conducts model/tool turns → the UI presents session/chat/tool/diff/terminal state.** A precise private IPC trace between those boxes was **not observed**. In particular:

- A frontend may render a tool card; that does **not** imply it executes the tool.
- A file editor may save a file; that does **not** imply the editor owns the agent edit operation.
- Git worktrees and working-directory diffs are standard Git/filesystem functionality, not proprietary data types.
- Claude account plan entitlements are not equivalent to a provider-issued API credential; each may have separate checking/billing and may depend on deployment mode.
- The *Claude Code CLI* is useful source of conceptual harness and tool behavior but is **not** CLcode's end-user product. Do not replace Desktop acceptance with a terminal demo.

### Renderer framework versus deployment mechanism

One may be tempted to call Desktop "Electron + React, therefore easily transplantable". This is invalid reasoning. Even if the exact current build were confirmed as Electron + React, webviews, preload scripts, engine process and authenticated remotely served content can be tightly coupled to a proprietary protocol. React renders UI; Electron provides hosting/IPC; neither constitutes a free-standing licensing grant or stable backend contract. The required decoupling is not achieved by replacing one API base URL.

## 3. Code workflows and data ownership

Separate **application metadata**, **engine transcript**, **live run state**, **Git/filesystem** and **provider/account** state. These have different ownership and durability even when the UI shows them together.

| User-facing workflow | Supported behavior or storage | Likely responsibility and classification | CLcode independent representation |
| --- | --- | --- | --- |
| **Project selection** | Select working folder/local repository, model, environment and permission mode in Desktop Code. | **D** UX; **H** exact folder-picker and launch RPC internals. | Project table: projectId, canonical root, Git metadata, capability profile, timestamps; own OS file picker. |
| **Session list** | App can display, organize, resume/archive sessions and locate individual project work. | **D** session UX and app metadata; **H** precise live IPC. | Session table: sessionId, projectId, title, creation/update time, runId, status; no dependency on Claude data dir. |
| **Transcript** | Claude Code transcript files under **~/.claude/projects/** as session JSONL; Desktop **claude-code-sessions/** records working folder/settings/title/summary. | **D:** [3P local data](https://claude.com/docs/third-party/claude-desktop/data-storage), [session storage](https://code.claude.com/docs/en/sessions). | Own append-only **events / turns** and session index, with schemas versioned independently; neither overwrite nor copy Claude transcript stores. |
| **Different surfaces sharing transcripts** | Official documentation says terminal, 3P Desktop and standard Desktop may use the same transcript folder despite separate Code session index lists. | **D:** [3P data sharing](https://claude.com/docs/third-party/claude-desktop/data-storage). | A critical reason not to treat vendor JSONL as a safely mutable CLcode database. Import/export (if any) requires explicit future design. |
| **File navigation/edit** | Desktop has file viewer/editor panes; local changes can be saved. | **D** UI; **H** precise save broker and file watch mechanism. | Monaco editor, a bounded main-process file API, stale-file detection, atomic save; separate model tool edits from operator edits. |
| **Diff** | Review changes in UI; uncommitted and branch differences trace back to local Git state. | **D** UX; **H** precise diff producer. | Git diff/status, Monaco DiffEditor, identify base commit and changes per worktree. |
| **Worktrees** | Per-session worktree mode; documented path **<project>/.claude/worktrees/** for Desktop; not default for every session. | **D:** [Desktop worktree reference](https://code.claude.com/docs/en/desktop#run-a-session-in-its-own-worktree). | Native Git worktree under a CLcode-owned path; initial fixture may use its own disposable checkout. |
| **Agent tools** | The Claude Code harness makes model requests, interprets tool calls, runs tools, returns observations, and iterates. | **D:** [How Code works](https://code.claude.com/docs/en/how-claude-code-works). | Independent supervisor plus model request adapter and restricted tool broker; **not** an inference proxy masquerading as a supervisor. |
| **Terminal/test** | Desktop Code integrated terminal runs in session working directory with local commands. | **D** UX; **H** exact current Windows PTY stack. | xterm.js terminal UI + node-pty/Windows ConPTY later; first test result can be streamed subprocess output. |
| **Background/agent state** | Desktop background tasks interface, tool outputs, and subagents. | **D** UX; **H** internal event topology. | Run graph, parentRunId, toolCallId, statuses, heartbeat, cancel acknowledgement, actual process supervision, event replay. |
| **Preview/browser** | HTML/PDF/dev-server preview and external browsing supported by Desktop. | **D** user feature; internal agent/browser broker **H**. | Explicitly defer until real local Code loop. Do not embed vendor pages. |
| **Permissions** | Desktop Code exposes permission modes and managed settings; Code harness enforces tool policies. | **D** product behavior. | CLcode main-process capability boundary; renderer never receives unscoped Node APIs, secrets or arbitrary shell privileges. |
| **Context/usage** | Desktop shows context and usage; gateway/provider returns model usage; subscriptions are separately administered. | **D** UI, **H** exact entitlement flow in current build. | GPTopus usage ledger + provider-reported billing; local budget guardrails, never pretend to own Anthropic subscription entitlement state. |
| **PR monitoring** | Desktop PR status integrates GitHub/gh according to documentation. | **D** UX; **H** private polling API. | Defer; later gh/GitHub connector as separate authorised capability. |
| **Session deletion/recovery** | App may delete session records and related transcripts/worktrees; some data shared with other modes. | **D:** [3P retention/deletion](https://claude.com/docs/third-party/claude-desktop/data-storage). | Explicit non-destructive archive semantics and separate worktree clean-up; never remove a user's Claude transcript. |

**Key design consequence:** CLcode needs distinct identifiers and records: Project, Session, Run, Turn, ModelRequest, ToolCall, FileEffect, CapabilityDecision and provider Usage. A run can terminate while session history survives; a conversation edit can change the next request without altering Git state; a filesystem edit may occur without a corresponding model turn. A frontend showing all these as one "chat session" should not obscure their durability/authority differences.

## 4. Architectural diagrams

### 4.1 Anthropic Desktop Code: evidence-grounded product map

~~~mermaid
flowchart TD
    U["Operator"] --> UI["Code UI: project/session/chat/terminal/diff (D)"]
    CDN["Anthropic CDN: application code/content (D)"] --> UI
    UI <--> APP["Claude Desktop app/session coordinator (D)"]
    APP -->|"launch options + env + policy (D, 3P)"| ENG["Embedded, separately versioned Claude Code engine (D)"]
    ENG <--> TOOL["Local shell/files/MCP and agent tools (D)"]
    ENG <--> FILE["Project files and Git worktrees (D)"]
    ENG <--> TRANS["Claude Code transcript store: ~/.claude/projects (D)"]
    APP <--> INDEX["Desktop session index: claude-code-sessions (D, 3P)"]
    ENG -->|"Messages API inference (D)"| MODEL["Claude serving: Anthropic or Claude-serving 3P/gateway (D)"]
    APP <--> SVC["Anthropic services: CDN, optional auth/cloud/telemetry (D, mode-dependent)"]
    APP -.->|"private eIPC details unverified (O-S/H)"| UI
~~~

The **solid** edges describe relationships documented by Anthropic, not a verified process-level trace or exact socket/IPC schema. The **dashed** arrow is the only publicly described third-party/private Electron IPC possibility: no supported stable application API was found. Do not read the diagram as a dependency map of a specific Windows installer.

### 4.2 Independent CLcode: proposed, **not implemented**

~~~mermaid
flowchart TD
    USER["Operator"] --> REACT["CLcode desktop UI: projects / sessions / chat / diff / terminal (PROPOSED)"]
    REACT <-->|"typed owned IPC"| BROKER["CLcode Electron main / capability broker (PROPOSED)"]
    BROKER <--> SESSION["Session index + append-only run event journal (PROPOSED)"]
    BROKER <--> FS["Scoped filesystem, Git and PTY interfaces (PROPOSED)"]
    BROKER <--> CTRL["Independent run supervisor (NOT PROVEN)"]
    CTRL <--> LOOP["Real non-Claude agent/tool loop (NOT PROVEN)"]
    LOOP --> GP["GPTopus-derived provider adapters and usage (SOURCE REVIEW ONLY)"]
    GP --> PR["Non-Anthropic providers: GPT/Qwen/KAT/local etc. (provider-dependent)"]
    LOOP <--> TOOL2["Approved read / patch / test tools (TO PROVE)"]
~~~

**The defining boundary** is the supervisor. It must create a new run without Claude Code present, own worker state, execute tool actions under a host capability policy, stream real events and support steer/cancel. A backend sending an isolated model completion is not an agent; an Electron window showing fake events is not Desktop acceptance.

### Minimal CLcode-owned control contract

~~~text
spawn({ projectScope, model, task, budget, permissionProfile }) -> runId
listRuns() -> active and recent run summaries
status(runId) -> state, progress, usage, tool state, lastSequence
steer({ runId, text }) -> accepted|rejected, acknowledgement identity
cancel(runId) -> cancellation requested; separately report terminal outcome
subscribe({ runId, afterSequence }) -> ordered run/tool/model/file events
~~~

Proposed event types: run.started, model.requested, model.delta, tool.requested, capability.approved, capability.denied, tool.started, tool.output, tool.completed, tool.failed, file.changed, run.steer_ack, run.cancel_requested, run.cancelled, run.completed, run.failed and run.interrupted. Every record needs runId, monotonic sequence, timestamp and a typed payload. **Requesting cancellation is not the same as observing a terminated child**. A stale run is not proof a process is alive. Recovery is never claimed merely because a JSON record exists.

## 5. Actual interfaces and service dependencies

### Public/documented interface inventory

| Interface | Documented contract / source | Reuse scope and warning |
| --- | --- | --- |
| **Desktop 3P gateway** | Gateway must implement **POST /v1/messages** including **streaming and tool use**; **GET /v1/models** is optional. [Official specification](https://claude.com/docs/third-party/claude-desktop/gateway). | Useful **compatibility probe only**. It does not offer agent runtime ownership, renderer extraction, or guaranteed non-Claude support. |
| **Model discovery/aliases** | Automatic model discovery only lists recognizable Claude identifiers. Explicit **inferenceModels** and **behavesAs** can configure aliases/tier semantics with version-dependent behavior. [Gateway model docs](https://claude.com/docs/third-party/claude-desktop/gateway#models). | An unknown model ID can be listed, but **display in picker is not proof of valid reasoning/tool/stream/compaction semantics**. |
| **Claude Code gateway support policy** | Explicit statement that non-Claude routing is **not supported through any gateway**. [Official gateways](https://code.claude.com/docs/en/gateways). | A translated Qwen/GPT/KAT gateway experiment is unsupported; **do not** make it a CLcode prerequisite. |
| **Desktop third-party configuration** | 3P configuration keys passed through launch options/env or managed settings; Windows location includes **%LOCALAPPDATA%/Claude-3p/configLibrary** for configured 3P profile. [Code propagation](https://claude.com/docs/third-party/claude-desktop/code); [config format](https://claude.com/docs/third-party/claude-desktop/configuration-format). | A supported *configuration* seam, not a backend replacement or window hosting contract. Leave the stock profile untouched. |
| **MCP** | Public tool/data integration protocol. [MCP specification](https://modelcontextprotocol.io/specification); [Desktop configuration](https://code.claude.com/docs/en/desktop). | Open interface for tools when useful. **Not principal model or agent controller replacement**. |
| **Files, shell, Git** | Ordinary OS files and processes; Git status/diff/worktree commands. [Git worktree docs](https://git-scm.com/docs/git-worktree). | Reuse independent standards directly; don't adapt Claude's private file handlers. |
| **CLI transcript storage** | ~/.claude/projects/ JSONL and session/resume semantics. [Code sessions](https://code.claude.com/docs/en/sessions); [3P data](https://claude.com/docs/third-party/claude-desktop/data-storage). | Reference for UX, **not** a guaranteed public Desktop live-event protocol or an owned storage format. |
| **Desktop private LocalSessions IPC** | An unaffiliated CCDEX project reports preload/IPC events; no Anthropic public contract identified. [Third-party CCDEX](https://github.com/Saqoosha/CCDEX#how-it-works). | **Do not** build on this or modify app binaries. Version fragility + provenance/licensing. |
| **Independent shell IPC** | Electron public main/preload/renderer IPC, context isolation and security guidance. [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc); [security](https://www.electronjs.org/docs/latest/tutorial/security). | Suitable for a **CLcode-owned** API exposing only explicitly authorised operations. |
| **Agent Client Protocol (optional)** | [ACP](https://agentclientprotocol.com/) provides a candidate public interface for agent clients. | Evaluate later for editor interoperability, not as Anthropic's internal IPC and not a bootstrap requirement. |
| **Monaco / xterm / ConPTY** | [Monaco editor](https://github.com/microsoft/monaco-editor), [xterm.js](https://github.com/xtermjs/xterm.js), [node-pty](https://github.com/microsoft/node-pty). | Candidate independent editor/diff, terminal viewport and Windows PTY support. Verify exact package versions/licenses when implementing. |

### Auth, entitlements and infrastructure: do not conflate

**DOCUMENTED:** When Desktop 3P obtains configuration through MDM, local config or bootstrap, the user **does not sign in to Anthropic** and Anthropic has no per-user state. An Enterprise Admin Console deployment is different and involves sign-in. [3P identity](https://claude.com/docs/third-party/claude-desktop/data-storage). The 3P app still documents CDN delivery for application code/content and possible telemetry and other services. [Network requirements](https://code.claude.com/docs/en/desktop#network-access-requirements).

This yields four distinct questions:

1. **Can a Desktop Code session authenticate to a configured Claude-serving provider without a Claude account?** Yes, in documented 3P configurations (D).
2. **Can a stock unmodified app run a foreign model as the principal?** Unsupported officially, unproven empirically (D policy; N behavior).
3. **Can a stock Desktop Code GUI launch and work with no Anthropic-owned *infrastructure*?** Not established; public docs state CDN dependency (D).
4. **Can CLcode run a non-Claude principal with no Anthropic credentials or services?** Yes **as an architectural objective**, provided independent supervisor/provider, original shell and an actual E07/E08 verification (H, N).

The services potentially involved in stock desktop include: account sign-in/entitlements for standard modes, application CDN, build/update distribution, optional telemetry, cloud Code session hosting, and model inference (Anthropic by default or a configured Claude-serving 3P). **None** should be silently assumed unnecessary because 3P inference uses a gateway. Do not attempt to bypass account billing, auth, or product access controls.

## 6. Component-level disposition

Definitions: **KEEP** retain independent standards or already owned code where legally reusable; **ADAPT** change a boundary of owned source; **REPLACE** remove dependency on proprietary functionality; **REIMPLEMENT** write CLcode's equivalent from public behavior/requirements.

| Component | Action | Evidence and concrete work |
| --- | --- | --- |
| Anthropic Desktop executable, Electron/preload bundle, update/signature machinery | **REPLACE** | Proprietary app and separately updated engine; no identified redistributable shell API. Create a clean CLcode Electron app. |
| Anthropic-served Code renderer/assets/styles | **REIMPLEMENT** | Official CDN dependency; proprietary assets and private runtime coupling. Reproduce essential **behavior**, not source/branding/pixel-for-pixel copies. |
| Desktop project/session navigation and chat pane | **REIMPLEMENT** | React state and CLcode-owned session index/event journal, model selector, steer/cancel controls. |
| Editors and diff viewer | **KEEP + ADAPT** | Use Monaco editor and DiffEditor over Git diff and scoped file I/O. Honor external file changes/unsaved buffers. |
| Interactive terminal | **KEEP + ADAPT** | xterm.js renderer; node-pty/ConPTY process broker. Initial test log pane can precede full PTY, but don't call it a terminal feature before it is interactive. |
| Git and worktree isolation | **KEEP + ADAPT** | Standard Git, owned path naming and disposal rules, no writes into user Claude workspace state. |
| Embedded Claude Code binary and main model/agent loop | **REPLACE** | Independent agent scheduler, turn state, tool loop, permissions, provider semantics and cancellation. Core feasibility gap. |
| Private Electron LocalSessions / renderer IPC | **REPLACE** | Own narrow versioned CLcode IPC and normalized run events; no reliance on private hooks. |
| Anthropic model credentials / cloud sessions / quota entitlement | **REPLACE** | CLcode provider credentials, cost ledger, budgets and capabilities. No fake Anthropic entitlements or quota bypass. |
| 3P gateway / Anthropic Messages adapter | **ADAPT (optional diagnostic)** | Useful to evaluate compatibility, **not** a supported non-Claude final architecture. |
| MCP server ecosystem | **KEEP/ADAPT later** | Optional public tool interface; does not solve primary orchestration. |
| GPTopus **web configuration** | **KEEP/ADAPT** | **O-S pinned** [oai-config.mjs](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/scripts/oai-config.mjs): Node local HTTP UI, token + origin/host checks, usage, presets and control views. **E01 NOT RUN** in this work. |
| GPTopus **steering registry** | **KEEP/ADAPT** | **O-S pinned** [bridge/steer.mjs](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/steer.mjs): steer/runs/*.json, steer/inbox/<agentId>/*.json, log.jsonl and queued tips. **Not a worker spawning API.** |
| GPTopus **conversation store** | **KEEP/ADAPT** | **O-S pinned** [bridge/convo.mjs](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/convo.mjs): tool/message history, revisions, atomic conversation edits and pending stream previews. Does **not** by itself own Desktop sessions or processes. |
| GPTopus **native Claude host hooks** | **REPLACE boundary, ADAPT reusable helpers** | **O-S pinned** [hooks/register.js](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/hooks/register.js): invokes host tools, session/model/version and signed native channels; protected path checks **Claude Code 2.1.326+**. This cannot be run as hostless orchestration merely by importing it. |
| GPTopus provider router/model clients | **ADAPT after PREPASS-01** | Identify self-contained transport and usage helpers, then prove live requests outside Claude process; avoid duplicate replacement clients. |
| CLcode worker lifecycle, transcript journal and permission broker | **REIMPLEMENT minimal** | Spawn/observe/steer/cancel, real model/tool turns, ordered events and restricted file/shell access. Separate run and session lifetimes. |
| CLcode installer/signing/updater | **REIMPLEMENT later** | Not required for an interactive dev-mode desktop bootstrap. Do not grow CI now. |

### Pinned GPTopus observations that actually matter

1. **oai-config.mjs** imports Node HTTP, local filesystem, WebSocket helper, GPTopus steer/convo/usage modules; it exposes a locally served configuration interface with token/Host/Origin protection. It is a plausible independent **control-plane foothold**. Running the server independently, persisting config and validating all transitive dependencies still requires **E01**, not a deduction from source.
2. **bridge/steer.mjs** is a shared file-based registry/queue. Runs are entries written by participants; sending a tip to an existing run does **not** create or control a living independent worker. CLcode must supply the supervisor and consumer.
3. **bridge/convo.mjs** persists provider-worker dialogue including roles and tool calls and can replay revisions; it is not a standalone Code app, agent or authority to execute tools.
4. **hooks/register.js** mediates Claude-owned command/tool dispatch, host information and protected bridge channels. Its host dependency is a **transplant blocker**, not a reason to rewrite GPTopus's working provider internals.

If PREPASS-01 finds newer GPTopus changes, record the new **exact SHA and impact** instead of silently moving the reference.

## 7. Three-strategy comparison

Ratings are **HYPOTHESIZED architectural judgments** informed by documented product constraints, *not* measured prototype results.

| Criterion | **A — Adapt separate Desktop specimen** | **B — Vendor desktop, owned backend** | **C — Independent CLcode desktop shell** |
| --- | --- | --- | --- |
| Technical feasibility | **Moderate for documented configuration/MCP only; low for replacement principal/worker ownership.** | **Low** for retaining exact proprietary frontend; requires undocumented renderer/engine protocol or official licensed interface. | **High for small UX**, dependent on proving E02–E06 non-Claude run loop. |
| Licensability / distributability | **High restriction risk**; no identified permission to ship patched binaries/renderer. | **High restriction risk** if proprietary renderer/engine shipped, mirrored or modified. | **Best controlled** if clean implementation with independently licensed parts. Audit dependency licenses/notices. |
| Initial implementation complexity | Low for a gateway spike, very high if shell patches start. | High/unknown: emulate moving vendor IPC, sessions, tool events, app service links. | Moderate original GUI + intrinsically difficult independent runtime (needed anyway). |
| Long-term maintenance | Very high: vendor releases, private IPC, signatures, CDN behavior. | Very high: vendor frontend and engine protocol drift, hosted assets. | Low *vendor-specific* exposure; standard Electron/React/provider upkeep. |
| GPTopus fit | Can run separate config/provider but independent worker lifecycle unproven; host hooks remain. | Requires a bridge from own controller events into a closed frontend. | **Best direct fit:** Node/ESM provider and control-plane code with a native owned event protocol. |
| No Anthropic credentials | Official 3P mode may allow it; not a general guarantee. | May be possible 3P; unrelated to frontend redistribution rights. | Designed for this; must demonstrate it. |
| No Anthropic-operated services | **Not established**; official CDN dependency. | **Not established**; same remote frontend risk. | Possible by design with local shell and independent provider; **E08 still NOT RUN**. |
| Proprietary update dependence | Very high. | Very high. | None as a core runtime dependency. |
| Rank | **3** | **2** | **1** |

### Strategy A — separate installed specimen with external seams

**What may be retained for evaluation:** stock official app; documented 3P gateway configuration, MCP tool extensions, normal user-facing UX; completely separate experiment-machine deployment. A meaningful result is a **bounded compatibility finding**, not a ship target. If a supported new documented plugin exists later, reassess.

**What is not established:** any right to alter/rebundle the executable, any supported arbitrary agent engine plug-in, independent UI delivery, unsupported foreign-model semantics, use without remote app content. A stable working shell transplant is **not** demonstrated by an externally supplied inference URL.

### Strategy B — preserve existing frontend but replace backend

Most visually attractive; most likely to consume substantial speculative effort. Claude Desktop's UI does not just forward natural language to a model: the embedded Claude Code engine owns model/tool iterations, sessions, permissions and file effects; the proprietary frontend is documented as remotely delivered application code. Replacing the engine while keeping the UI entails a **private protocol emulator and service stand-in** of uncertain scope, and may require vendor consent. **Only acceptable if Anthropic publishes/licenses a supported backend protocol and frontend embedding route.** If "preserve experience" instead means implement equivalent panes and workflows, that is Strategy C.

### Strategy C — original desktop shell over owned agent runner

**Recommendation:** Windows-first original Electron + React process, Node/ESM backend reusing GPTopus provider components. A tiny usable window must offer project/session selection, principal model choice, typed streaming tool/chat state, real Git diff and actual test results. Monaco gives editor/diff, xterm.js + ConPTY add a terminal, normal Git handles worktrees. Keep Code usability as the product; do not spend the first engineering budget chasing skin/theme parity, Cowork, cloud, CI or installer infrastructure.

**Potential optimization:** If a supported existing open-source agent client protocol such as ACP naturally fits the independent supervisor, add an adapter later. Do not let standards integration replace an actual test of a live worker and tool broker.

### Legal/licensing distinction — technical feasibility is not shipping permission

**DOCUMENTED:**

- The Claude Code [legal and compliance](https://code.claude.com/docs/en/legal-and-compliance) document says customer product deployments must use an **unmodified published binary** and may not remove/disable built-in authentication methods without special agreement; it also constrains logo/name use.
- [Claude Desktop on 3P legal](https://claude.com/docs/third-party/claude-desktop/legal) says the Desktop application is governed by Anthropic **Commercial Terms**, even when inference is billed through another provider.
- [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms), especially restrictions in section D, and [Consumer Terms](https://www.anthropic.com/legal/consumer-terms) contain limits on certain competitive-product, duplication and reverse-engineering uses. Exact application can depend on the contracting party, law and activity; consult qualified counsel before any contested use.
- No legal permission to distribute a patched Desktop executable, copied proprietary UI bundle, private asset derivative or disabled-auth Code runtime was found.

**Conclusion:** A **lawfully installed unmodified specimen** may be evaluated only within applicable licence terms; a disposable PC is not a license waiver. This research did not patch or inspect protected executables and is **not legal advice**. CLcode should preserve observable functional *ideas* while implementing its own code and respecting independently licensed components.

## 8. Minimal disposable-Windows experiments

**PROPOSED / NOT RUN.** These are **future** instructions for Codex/owner on a dedicated Windows machine, not a claim that a current agent can use the owner's GUI. Do not touch the main machine's stock Claude Desktop, settings or sessions. Do not install a CLI merely to fake Desktop acceptance.

### Experiment D0 — optional, read-only official specimen observation

**Goal:** resolve version-sensitive shell/UI/process questions only if terms permit and the insight changes an actual engineering decision.

1. On disposable Windows only, optionally install a **separate official, unmodified** Desktop application; record installed version via About, embedded Code engine version via supported UI (/status if accessible), Windows build, installer provenance and SHA-256. Never commit binaries or user data.
2. Capture **ordinary UI behavior** for selecting a folder, opening/archiving a session, visible tool cards, viewing a diff, running terminal command, changing permission mode and observing background state. Compare Code with Chat/Cowork without conflation.
3. Use standard OS tools **read-only** (Task Manager / Process Explorer / Resource Monitor, sanitized firewall/DNS observations) to identify processes and which *documented service domains* are contacted while Code loads; differentiate application/CDN, authentication, inference, telemetry and optional cloud routes. Do not collect cookies, auth headers, per-user session records or provider keys.
4. Note whether offline cached UI still loads, but never infer a portable redistributable renderer from a cached response. Do **not** patch ASAR, disable signatures, inject preload or mimic authenticated private endpoints.
5. **Stop** if further research needs proprietary disassembly, binary modification or unapproved access. A current vendor-hosted frontend is **not** a prerequisite to implement Strategy C.

**Record:** exact build, observed UI/process facts, uncertainty, sanitary evidence references and a STOP/GO statement. **Do not call private IPC understood without trace or vendor contract.**

### Experiment D1 — first owned desktop feasibility proof

**Goal:** demonstrate that the minimum desired Code *experience* is practical as an independently launched desktop window. The independent agent/controller remains the gating backend.

- **Prerequisite:** the PREPASS-01/E01–E03 work establishes hostless GPTopus configuration, a real non-Claude provider request, and **new run creation** outside Claude hooks. An intentionally marked fixture event source may help early UI layout work but cannot pass E03/E06/E07.
- **Environment:** dedicated Windows PC, Node LTS, Git, a deliberately tiny local fixture repository, **scoped test credentials**, no installed Claude Code requirement, CLcode/GPTopus pinned SHAs. Run in dev mode; no installer or CI.
- **Minimal original UI:** Electron window with project folder picker and visible path; left session rail with one created session; a main transcript/tool-event pane; file/diff pane with Monaco; model picker and independent spawn/steer/cancel; bounded real shell/test output.
- **First actual task:** a non-Claude model chooses to inspect fixture file, edit it and execute a local test. The independent supervisor handles tool calls, not scripted hard-coded edit outcomes. Show the **real** working-tree Git diff and test exit code.
- **Permission test:** an attempted read outside the selected fixture root is denied by the host capability broker while an allowed file action succeeds. Never demonstrate against real user secrets. Remote Git pushes forbidden.
- **Run lifecycle test:** cancel a running task, verify worker termination rather than merely button response; restart CLcode and replay journal. If a task is interrupted rather than resumable, show **interrupted**, not false recovered status.
- **Network test:** observe outbound destinations/processes during a completed UI run. **E08 requires zero Anthropic inference calls observed**, with documented observation method. It does not mean the whole PC had zero networking; silence in application logs is insufficient.
- **Acceptance split:** UI with fake events = component prototype; a standalone provider response = E02; independent worker with steer = E03/E04; real Read → Edit → Test = E06; that same loop **inside interactive CLcode desktop** = E07; observed no Anthropic inference = E08.

A disposable test Git repository can be created without any CLcode app scaffolding:

~~~powershell
New-Item -ItemType Directory -Force C:\CLcode-Disposable | Out-Null
Set-Location C:\CLcode-Disposable
git init fixture
Set-Location .\fixture
git config user.name "CLcode Test"
git config user.email "clcode-test@example.invalid"
Set-Content hello.txt "alpha"
git add hello.txt
git commit -m "fixture baseline"
~~~

Suggested model instruction: **"Read hello.txt; append a second line beta; run a command/test that checks both lines, and report the actual diff."** An allowed model-origin tool cycle must decide to read/edit/test; do not replace with a scripted patch. Record process/tool events and honest error outcomes.

### Hard stop conditions

- Do not redistribute, patch, repack, commit or ship Anthropic proprietary code/assets.
- Do not modify stock app user state or reuse Claude credential files in CLcode.
- No private-session token capture, entitlement/account bypass, service spoofing or unapproved remote Git actions.
- Do not convert a gateway compatibility experiment into the final architecture.
- Do not add CI/VM/broad test frameworks; one local fixture and a reproducible command log suffice.
- If blocked, record precise negative evidence in [EXPERIMENTS.md](../EXPERIMENTS.md) **in a later authorised implementation task**; this prepass must modify **no other file**.

## 9. Codex's first question and implementation handoff

### The single best first technical question

> **At GPTopus SHA 849627463c3e2be660f9d24976320b072c107b34, what is the smallest host-independent adapter that can create a new live non-Claude worker, conduct Read → Edit → Test, and emit ordered model/tool/usage/steer/cancel events for an original desktop UI, without Claude Code processes, host hooks or Anthropic services?**

This is the *critical-path uncertainty*. The desktop UI can be recreated with ordinary components; a model router is partially present; the actual challenge is owning **real agent execution** and its event stream. This is where Codex should spend its initial implementation budget, coordinating with PREPASS-01 rather than duplicating that investigation.

**Recommended handoff sequence** (align with [ROADMAP](../ROADMAP.md)):

1. Freeze GPTopus SHA and test true Node/ESM host-independent imports. Prove E01 then live E02. Understand which functions in register.js belong to Claude hooks and must be replaced. **Do not rewrite the providers wholesale.**
2. Own a minimal worker supervisor with the spawn/status/steer/cancel protocol and authoritative event log; prove it can create and control a worker **when Claude does not exist** (E03/E04). Explicit cancel acknowledgment and terminal outcomes.
3. Prove a real provider-directed Read → Edit → Test cycle inside a throwaway Git repository (E06) with enforced project boundaries and captured test/diff output.
4. Build **one original Electron desktop window**, not a web settings panel masquerading as a desktop product. Bind it to the **same worker/event stream**, add project/session chat/tool/diff and minimal terminal, observe E07 and E08.
5. Owner GO/HOLD/STOP at actual Desktop viability gate. Only then expand UI and address distribution/signing, broader tools, worktrees, teams and more advanced functionality.

### Chosen minimal technology (proposal, not a mandated complete stack)

- **Desktop shell:** Electron main process + context-isolated preload + React renderer. Explicit small IPC API, no raw Electron/Node access in renderer.
- **Editor/diff:** Monaco; Git CLI/library for real status/diff/worktree. Do not add elaborate editor-framework abstractions early.
- **Terminal:** xterm.js + node-pty/ConPTY if true interactive terminal needed for first proof; test capture through a spawned subprocess for the first minimal fixture otherwise.
- **Data:** simple owned index + append-only JSONL or SQLite events as justified by implementation. Keep it small, ordered, replayable, and truthful about interrupted runs.
- **Backend:** GPTopus-derived provider clients/config/steering/conversation as independently verified; one bounded controller and capability broker. Avoid a second redundant model router.
- **Security:** canonicalize project root; per-run allowed files/tools; provider credentials outside UI state; prevent renderer arbitrary file/shell/network access; redact logs.
- **Deliberate omissions:** Desktop proprietary UI transplant, Claude Code CLI as product, Cowork VM, SSH/cloud, PR monitoring, comprehensive skins, packaging/updater and CI.

**First deliverable is a *working desktop Code flow*, not another design document.** This prepass's file is the decision support for that executable mission.

## 10. Explicit unknowns and source index

### Falsifiable open questions

| Unresolved point | Status | Action that would resolve it / why it matters |
| --- | --- | --- |
| Current **Windows** Desktop exact app version, Electron/React/native addon versions | **N**; only old macOS O-S. | Read installed official specimen About, process version and signed file hashes if permitted. **Not a blocker to C**. |
| Actual current Windows app↔engine IPC/stdio protocol and launch flags | **H/N**, undocumented private contract. | Only if a **supported legal public interface** appears; otherwise do not reverse engineer as a CLcode core dependency. |
| What part of current Code UI is bundled vs loaded dynamically from Anthropic CDN | **D** remote app-code dependency; detailed partition **H**. | Ordinary network observation, only if useful. No copying proprietary bundles. |
| Whether stock Desktop 3P can display Code offline after cache warm-up | **N**. | Controlled legitimate use if needed; do not infer redistributability or long-run offline support from caching. |
| Exact current app updater/signing architecture | **N/H** beyond documented MSIX/updating. | Nonessential for C; no patch-stack research. |
| Foreign-model gateway validity for tool use, streaming, thinking, compaction, subagents | **N** and **officially unsupported**. | Optional bounded disposable-PC compatibility probe; stop on unsupported boundary; don't delay C. |
| No-Anthropic-sign-in vs no-Anthropic-traffic in 3P Desktop | Documented distinction; zero traffic **N**. | Network observation if evaluating A; not required for owned-shell strategy. |
| Legal right to redistribute/modify app or renderer assets | **Not established**. | Specific written license/permission and legal review before any proposed distribution. Default: do not. |
| GPTopus standalone HTTP panel E01, real request E02, worker E03/E04 | **N**. | PREPASS-01 and actual local runs with pinned SHA, sanitisations and exact failure logs. |
| Renderer/editor/terminal integration on disposable Windows | **N**. | D1 original window, one honest Read/Edit/Test task. |
| Event persistence, cancellation, reconnect, process death | **H/N**. | E04/E05 observed process outcomes, journal and replay. |
| Zero Anthropic inference calls during independent Desktop E07 | **N**. | E08 correlated network/process observation rather than a code-level assertion. |
| Distribution licenses of selected open components and GPTopus-derived code | Review required. | Audit exact package versions, LICENSE files and notices before any distributable CLcode. |

### Primary product and policy references (checked 2026-11-23)

1. [Claude Desktop application / Code reference](https://code.claude.com/docs/en/desktop) — tabs, sessions, diffs, terminals, worktrees, background tasks, embedded engine and CDN/update constraints.
2. [Desktop 3P Code](https://claude.com/docs/third-party/claude-desktop/code) — embedded Claude Code engine, app-to-engine settings and launch configuration.
3. [Desktop 3P inference gateways](https://claude.com/docs/third-party/claude-desktop/gateway) — Claude-serving Messages API, model discovery, alias/tier semantics, tool/stream requirements.
4. [Claude Code gateways](https://code.claude.com/docs/en/gateways) — unsupported non-Claude routing statement.
5. [Claude Code third-party deployment comparison](https://code.claude.com/docs/en/third-party-integrations) — providers primarily supply Claude, not arbitrary model families.
6. [Desktop 3P identity and local data](https://claude.com/docs/third-party/claude-desktop/data-storage) — sign-in modes, Code session record vs transcript stores and shared-state pitfalls.
7. [Desktop 3P configuration format](https://claude.com/docs/third-party/claude-desktop/configuration-format) — Windows config/deployment mechanisms.
8. [Claude Code session storage](https://code.claude.com/docs/en/sessions) and [Claude Code agent harness](https://code.claude.com/docs/en/how-claude-code-works) — transcript, tool-loop semantics.
9. [Claude Code legal/compliance](https://code.claude.com/docs/en/legal-and-compliance), [Desktop 3P legal/compliance](https://claude.com/docs/third-party/claude-desktop/legal), [Commercial Terms](https://www.anthropic.com/legal/commercial-terms), [Consumer Terms](https://www.anthropic.com/legal/consumer-terms).

### Third-party *version-qualified* observations, not endorsed interfaces

- [Kotrotsos/claude_echo overview](https://github.com/Kotrotsos/claude_echo/blob/main/docs/00-OVERVIEW.md) — researcher-reported **macOS** v1.1.4088 / build **2026-02-23**, Electron **40.4.1**, Chromium **144.0.7559.173**, React **18.3.1**. Do **not** label these the current Windows versions.
- [Saqoosha/CCDEX](https://github.com/Saqoosha/CCDEX#how-it-works) — researcher-reported remote Code route and proprietary/private **LocalSessions** Electron IPC. Its modification technique is **outside scope**, not a recommended CLcode implementation.
- [Windows bundled Claude process third-party issue report](https://github.com/anthropics/claude-code/issues/95489) — independent reported process evidence, **not** an Anthropic-supported API.

### Open, independently licensable technical references

- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc), [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)
- [Monaco editor](https://github.com/microsoft/monaco-editor), [xterm.js](https://github.com/xtermjs/xterm.js), [node-pty](https://github.com/microsoft/node-pty)
- [Git worktree](https://git-scm.com/docs/git-worktree), [Model Context Protocol](https://modelcontextprotocol.io/specification), [Agent Client Protocol](https://agentclientprotocol.com/)

### Pinned project source anchors (read directly)

- [GPTopus configuration server](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/scripts/oai-config.mjs)
- [GPTopus steering store](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/steer.mjs)
- [GPTopus conversation store](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/convo.mjs)
- [GPTopus host-bound hook registration](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/hooks/register.js)
- [CLcode roadmap](../ROADMAP.md), [CLcode long plan](../PLAN.md), [acceptance experiment record](../EXPERIMENTS.md)

**Final prepass disposition:** **C recommended**; A/B only optional, bounded research avenues; no proprietary binaries touched; **E01–E10 NOT RUN**; no claimed Windows UI evidence. Transfer the decision and above first-question to Codex without creating a speculative gateway or proprietary patch dependency.
