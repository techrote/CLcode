# CLcode PREPASS-01 — GPTopus host-independence archaeology

**Status:** Source investigation complete; **runtime independence is UNVERIFIED** until the listed live experiments execute.  
**Date:** 2026-11-23  
**Target:** independently launched **CLcode desktop application**, no stock Claude modifications, no Claude Code installation/runtime dependency.  
**CLcode baseline when branched:** `2ba8a3100d046c87cb55e03d3dc985c3ce2cb5ef` (main).  
**Pinned GPTopus reference:** `849627463c3e2be660f9d24976320b072c107b34`, **exact HEAD** of `ultra/004-integration` when inspected.  
**Other observed GPTopus refs:** main `edd9392eae931ef19db82c84eb4d6d1167583fc4`; `feature/desktop-openai-workers-mcpb` `04f570d130eeed47f50c6353829f9bffccd33604`. Comparison reports main **78 commits behind**, feature **54 commits behind**, and **zero ahead** of the pinned commit. Consequently neither is a newer replacement for this analysis. Do not silently switch to main.  
**Environment:** GitHub and a separate disposable Windows PC (no VMs); Node.js **>=20.11.0** per the donor plugin package.  
**Evidence labels:** **SOURCE-VERIFIED** means inspected in the exact pinned source; **UNVERIFIED** means no matching live acceptance experiment has been executed. Source capability is not proof of deployment success.

## Contents

1. [Scope, verdict, and reference discipline](#1-scope-verdict-and-reference-discipline) — What is already hostless and what still needs an execution owner.
2. [`/oai:run` call graph](#2-oairun-call-graph) — The direct text-only request path and its limitations.
3. [`/oai:s` and web configuration control plane](#3-oais-and-web-configuration-control-plane) — Steering producer/consumer, WebSocket panel, and durable stores.
4. [Host subagents versus independent ULTRA orchestration](#4-host-subagents-versus-independent-ultra-orchestration) — Claude lifecycle hooks, the existing standalone recursive runtime, and their non-equivalence.
5. [Provider, accounting, continuation, and tool boundaries](#5-provider-accounting-continuation-and-tool-boundaries) — Authentication, request transport, usage, cancellation, and actual tool execution.
6. [Dependency classification](#6-dependency-classification) — Independent modules, narrow adapters, and host-only services.
7. [Smallest standalone CLcode supervisor](#7-smallest-standalone-clcode-supervisor) — Minimal API and a single retained GPTopus provider/control backend.
8. [Extraction sequence, risks, and experiments](#8-extraction-sequence-risks-and-experiments) — Cost/risk order and honest proof gates.
9. [Next three Codex implementation tasks](#9-next-three-codex-implementation-tasks) — Concrete files, boundaries, and acceptance criteria.

## 1. Scope, verdict, and reference discipline

### 1.1 Main conclusion

**SOURCE-VERIFIED:** GPTopus already has **host-independent provider request code** and **two distinct host-independent launch mechanisms**:

- `plugins/openai-workers/bridge/server.mjs` exports `dispatch(name,args,options)`, which can be imported and called by an ordinary long-lived Node process. Its OpenAI Responses transport and NVIDIA/LM Studio Chat Completions transport use Node APIs, not Claude's runtime.
- `bridge/direct-run.mjs::startDirect()` creates, polls, and saves a **text-only** response without requiring Claude reasoning. Currently its normal user-facing entry is the Claude Code `/oai:run` command; that command wrapper is host-dependent, not the underlying transport.
- Independently, `ultra/cli.mjs` + `ultra/service.mjs` + `ultra/broker.mjs` + `ultra/runtime.mjs` provide a **separately launched, policy-governed, recursively recruiting scheduler**. This is real source code, not just a design. However it is OpenAI-worker-centric, requires explicit policy/admission/approvals for useful live work, does **not** expose the existing `/oai:s` lifecycle, and provides private staged patches rather than general live edit/shell execution.

**SOURCE-VERIFIED:** the **Claude-native** agent path is different. `hooks/register.js` registers worker types with Claude, intercepts `agent.spawn` and `turn.step`, reads Claude transcripts and state, and delegates Read/Edit/Write/Bash execution/permission checking to the host. In its ULTRA mode, admission reserves a node in the broker but the actual subagent is born from host `next(e)`. A policy allocation is **not** an independently running agent.

**Decision:** keep the existing provider, settings, accounting, trace, steering and conversation modules. Replace the **entry point + step owner + tool executor**, not the provider clients. Begin with one CLcode-owned long-lived supervisor operating through `dispatch`; use the independent ULTRA broker/runtime as an **existing later-policy option**, not a second concurrently invented provider or an excuse to port all native hooks immediately.

**UNVERIFIED:** a live hostless model call, live panel on the disposable Windows PC, independent run spawning, real steering, cancellation, tool-executing loop, and desktop acceptance. `CLcode/docs/EXPERIMENTS.md` explicitly states no CLcode experiments have run. Mocked tests and source reads do not change those statuses.

### 1.2 Sources and reproducibility

Read first: `techrote/CLcode/docs/ROADMAP.md`, `docs/PLAN.md`, `docs/EXPERIMENTS.md`. All donor file paths below are relative to `plugins/openai-workers/` unless stated otherwise; all function/line references are to the pinned SHA, **not main**. The pinned tree contains the modules discussed here; `package.json` specifies ES modules and Node >=20.11.0, with no third-party runtime dependencies listed.

- [Pinned GPTopus tree and commit](https://github.com/techrote/Chlaude-GPTopus/tree/849627463c3e2be660f9d24976320b072c107b34)
- [Bridge dispatch, actual MCP server](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/server.mjs)
- [Host integration hooks](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/hooks/register.js)
- [Standalone `direct-run` implementation](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/direct-run.mjs)
- [Standalone ULTRA runtime](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/ultra/runtime.mjs)

An unmodified Windows research checkout can be established with:

```powershell
git clone https://github.com/techrote/Chlaude-GPTopus.git C:\dev\Chlaude-GPTopus
git -C C:\dev\Chlaude-GPTopus checkout --detach 849627463c3e2be660f9d24976320b072c107b34
git -C C:\dev\Chlaude-GPTopus rev-parse HEAD
node --version
node C:\dev\Chlaude-GPTopus\plugins\openai-workers\scripts\oai-config.mjs --no-open
```

The final command is **an E01 procedure, not an observed PASS**. Do not publish its localhost token-bearing URL. On the disposable PC use dedicated nonsecret state/config directories (e.g. `OAI_CONFIG_STORE`, `OAI_CONFIG_STATE_DIR`, `OPENAI_WORKER_USAGE_DIR`) instead of touching existing Claude user-level settings; keep keys out of repo and logs. The stock Claude installation remains untouched.

## 2. `/oai:run` call graph

### 2.1 Exact entry-to-provider sequence

```text
operator: /oai:run <worker> [effort] <task>
  -> hooks/register.js: register(on)
  -> session.start: $.command.register('oai:run') [fallback 'oai-run']
  -> on('command.run', {command:'oai:run'})                  [host entry]
  -> bridge(call, 'run', {args:e.args})
     -> modCall(..., () => $.mcp.call('plugin:oai:bridge',...)) [host MCP]
     -> bridge/server.mjs: handle() (stdio MCP tools/call)
     -> dispatch('run', ...) -> runOp(...)
       -> direct.parseRun(...) / direct.listDirect() / direct.getDirect()
       -> direct.startDirect(..., {call: dispatch})
          -> workerSettings(), selectWorkerEffort(), attachFiles()
          -> persist direct/D#.json status='running'
          -> async call('create', {worker_type,model,input,instructions,tools:[],
                                   effort,service_tier,agent_id:'direct_D#'})
             -> dispatch('create',...)
                |-> OpenAI: checkedCreate -> reserveRequest -> createTurn
                |-> NVIDIA/LM Studio: providerDispatch -> chat.create
          -> async call('poll',{id,worker_type,wait_ms:5000}) until terminal
          -> persist status/text/reason/usage
  -> hooks/direct-reply.js: directReply(...)                 [host formatting]
```

**References:** `hooks/register.js` lines **479–483, 591–600**; `hooks/direct-reply.js`; `bridge/server.mjs` lines **88–97, 98–223, 224–253, 315–349**; `bridge/direct-run.mjs` lines **29–107**; `bridge/openai.mjs` lines **162–213**; `bridge/chat.mjs` lines **256–559**.

`server.mjs` is also an ordinary Node stdio MCP server when directly executed; `.mcp.json` tells Claude to launch it via `node .../bridge/server.mjs`. That MCP transport is not the provider's executor: `dispatch` is the real seam. An independent CLcode process can import `dispatch` without implementing Claude's `$.mcp` facade. **Do not copy/rewrite `openai.mjs` or `chat.mjs`.**

### 2.2 Precise limitations of `startDirect()`

**SOURCE-VERIFIED:**

- It sends `tools: []` and instructions declaring **no tools and no file access**. It answers a prompt; it does not drive coding tools or multiple model-decision steps.
- `@path` extraction (`attachFiles` lines 50–60) reads the host filesystem via `readFileSync(resolve(p))`; size bounds (**200,000 characters/file**, **400,000 characters/task**) are **not path authorization**. Never accept arbitrary user/client `@` paths at the CLcode boundary.
- Direct records are `<dirname(usagePath)>/direct/D#.json` (`getDirect`/`listDirect` lines 62–71); `nextId` uses a read/increment/write JSON counter (`29–32`) with no demonstrated multi-process locking. Keep exactly one owner process or use its already-owned unique run ID.
- The asynchronous loop is process-owned, with a **6-hour** polling ceiling. The HTTP/MCP command returning is not evidence that the worker will survive bridge exit; a restarted process can leave a persisted `running` record with no consumer.
- The direct-run API offers no `cancel(runId)`, `steer(runId)`, checkpointed model continuation, or child creation. `getDirect` is a stored-result read, not a live liveness probe.
- `startDirect` does not unpack the bridge's `paged` response (`server.mjs::pack/page`), whereas `hooks/register.js::bridge` and `ultra/cli.mjs` implement that reassembly. Large output may therefore be incomplete in direct records: **inspect and fix narrowly when building the owned supervisor**.
- A direct `agent_id: direct_D#` is passed to provider Chat transport, but **no corresponding `steer.upsertRun`** is done here. The web console and `/oai:s` cannot automatically see/steer these direct records.

**Verdict:** for E02, call `dispatch('create')`/`dispatch('poll')` or `dispatch('run')` from a long-lived hostless Node process; for E03/E04 use a thin **owned** response loop so cancellation/steering can be correctly delivered. `/oai:run` itself is not the target architecture and its name does not establish a spawned agent.

## 3. `/oai:s` and web configuration control plane

### 3.1 Steering queue and consumers

```text
operator: /oai:s [callsign|worker|*] [!][+] [?ack ?assess ?conseq] <tip>
  -> hooks/register.js: on('command.run',{command:'oai:s'})
     -> $.env.get('OAI_STEER') === '1' check
     -> bridge('steer',{op:'send',args:e.args,workers:Object.keys(TYPES)})
     -> server.mjs::steerOp('send')
        -> steer.parseSteer / steer.listRuns / steer.resolveTarget
        -> steer.enqueueTip(agentId, tip) -> steer/inbox/<agentId>/*.json
  -> active host subagent executes next turn.step:
        steerOp('wait') (optional post-tool pause)
        steerOp('sync') -> upsertRun / takeTips
        hooks/register.js::withSteering(plan.input, tipMessage(...))
        -> query(create/poll) -> next model request
  -> special '!' hard tip:
        steerOp('hard') -> query detects pending tip -> cancel prior response
        -> steerOp('sync') -> append new tip -> retry same intended step
```

**References:** `hooks/register.js` lines **507–524, 583–608, 793–1068** (especially ~965–1040); `bridge/server.mjs::steerOp` lines **255–294**; `bridge/steer.mjs` lines **24–180**. The queue is durable JSON state, but the **consumer** is an executing worker or stream. Enqueuing a tip when there is no consumer is not running or steering an agent.

`bridge/steer.mjs` implements `nextCallsign` (48), `upsertRun` (58), `listRuns` (66), `parseSteer` (82), `resolveTarget` (99), `enqueueTip` (109), `pendingTips` (123), `takeTips` (131), `tipMessage` (148), `pausePolicy` (155), and `waitForTip` (162). Its records are keyed by **agentId**, not by the direct-run `D#` counter; stale records older than six hours are pruned. Its passive run registry is not an operating-system process registry.

For NVIDIA/LM Studio, `bridge/chat.mjs::create` accepts `agent_id`; while streamed reasoning is ongoing, `run/streamOnce` polls `steer.pendingTips` about every 300ms, can abort/restart with a `<think>` prefill or user message, and limits these thought-steers (source lines ~350–445). This is **not** equivalent to arbitrary in-flight intervention for OpenAI Responses. OpenAI hard interruption involves explicit cancellation and a newly admitted request; uncertain spend must remain accounted.

### 3.2 Configuration server: exact independent boundary

```text
node scripts/oai-config.mjs --no-open [--port N] [--idle-minutes N]
  -> main() -> createConfigServer()
  -> http.createServer bound to 127.0.0.1, random port by default
  -> GET /?t=<per-launch-token> -> static oai-config.html + colour JS/CSP
  -> GET /api/schema, GET /api/state
  -> POST /api/set, /api/ui, /api/preset/save|load|delete, /api/restarted
  -> token header + Host/Origin checks, JSON-only POST
  -> WebSocket /ws (same token + Host/Origin validation)
     -> acceptUpgrade() in scripts/oai-ws.mjs
     -> 'tip' -> handleConsoleMessage() -> steer.enqueueTip(existing agentId)
     -> 'convo'/'convos' -> bridge/convo.mjs read/list
     -> 'convo-edit' -> edit/insert/delete/truncate a stored conversation
     -> 'thought-steer' -> enqueueTip(convo.agentId)
     -> 400ms push() -> steerSnapshot/convosSnapshot/live deltas
```

**References:** `scripts/oai-config.mjs` lines **32–76, 87–188, 189–299, 301–342**; `scripts/oai-ws.mjs::acceptUpgrade` lines **41–70**; `bridge/convo.mjs` lines **30–40, 102–185, 203–245**; `scripts/oai-config-core.mjs` lines **145–260, 264–326, 330–491**.

`oai-config-core.mjs` exports schema/validation (`PARAMS`, `normalizeValue`, `validateConfig`, `effectiveConfig`), `memoryStore`, `jsonStore`, `windowsUserStore`, `defaultStore`, `stateDir` and `applyChanges`. Defaults: Windows config in **HKCU\Environment** via PowerShell and state in `LOCALAPPDATA\ClaudeOpenAIWorkers`; `OAI_CONFIG_STORE` forces a JSON config store, `OAI_CONFIG_STATE_DIR` forces UI state location. These directory names are historic; CLcode should set its **own isolated paths**, not reuse stock Claude settings by accident. `liveState()` reads configured key **presence**, usage, traces and presets; it does not issue a provider request.

Important control-plane caveat: `baseEnv(store.read(...), env)` is constructed for panel snapshots, steering and conversation views. It **does not magically change an already-running bridge process's `process.env`**. Settings changes are tracked as pending/restart; the CLcode supervisor needs an explicit, consistent configuration snapshot/reload boundary. No localhost endpoint for **spawn**, **status of direct runs**, or **cancel** is implemented by `createConfigServer`. The existing WebSocket tip field only targets `steer.listRuns` entries; it cannot launch them.

`bridge/convo.mjs` persists editable conversations under `<usage directory>/conversations` (or `OAI_CONVO_DIR`), one JSON file per conversation, with lock/revision/trim handling and pending streamed previews. Preserve its logic; do not introduce a second chat history writer.

**UNVERIFIED:** E01 actual Windows launch, authenticated UI, restart, settings persistence, and safe isolation from a stock Claude installation.

## 4. Host subagents versus independent ULTRA orchestration

### 4.1 Legacy/native Claude path — not an independent worker owner

| Boundary | Actual code | What Claude currently supplies |
| --- | --- | --- |
| Start/configure | `hooks/register.js::register` -> `on('session.start')` (~299–489) | `$.env.get`, `$.agent.register`, `$.command.register`, `$.tool.register`, `$.session.version/info/id/model/surfaces`, `$.fs.read`, `$.mcp.call` |
| Legacy spawn | `on('agent.spawn')` (~507–524) -> `next(tagged)` | Host allocates an actual subagent and returns `result.agentId`; bridge merely assigns a callsign and records it |
| ULTRA native spawn | `on('agent.spawn')` (~525–539) -> `nativeBridge('admit')` -> `next({prompt: ULTRA_BIND ...})` -> `nativeBridge('bind',hostAgentId)` | Host `Agent` execution, tool-use identity, parent lineage and actual agent ID; policy admission alone **does not spawn** |
| Start | `on('turn.start')` (~541–552) | `$.agent.list` to find agent type/parent and bind ticket |
| Step | `on('turn.step')` (~793–1068) | `$.agent.list`, `$.state.get/set`, `$.session.messages(agentId)`, `$.session.messages(as:'api')`, `$.session.cwd`, `$.fs.read`, `e.turnId/e.index/e.tools`, abort `next.signal` and streamed yielded tool calls |
| Tools | `on('tool.check')` / `on('tool.run')` (~554–581) | Host permission decision, host `Read/Edit/Write/Bash` execution; ULTRA adds its own narrower restrictions |
| Finish | `on('turn.complete')` (~1070–1081) | Host completion/abortion and `next(e)` |
| Native identity | `hooks/channel.js`, `bridge/native-channel.mjs`, `ultra/native-controller.mjs` | Signed host/session/epoch/capability proof tied to actual Claude surfaces; a fabricated host identity is **not** a suitable replacement |

In legacy steps, `hooks/step.js::newRun,nextInput,responseStep,finalStep` are **ordinary reusable pure functions**. The storage and event flow around them is not: `nextInput` expects host transcript messages and host tool-result IDs; `responseStep` produces chunks/toolUses for **host execution**. In `hooks/register.js::query` the call/poll/cancel loop is procedural Node logic, but `turn.step` invokes it only after reading host state. It fails closed rather than falling back to Anthropic inference for a failed worker step.

In ULTRA native mode, `ultra/native-controller.mjs::admit` (214–257) reserves a policy node; `bind` (258–273) explicitly requires `hostAgentId`; `context/create/poll/tool/finish` (274–561) require a bound mission, host tool IDs and signed native channel. Replacing all this with dummy `$.agent` objects is not a small adapter. Do **not** spoof Claude sessions or redistribute proprietary binaries.

### 4.2 Already independent ULTRA CLI/runtime — a real alternative, with limits

This is the important counterexample to “all orchestration depends on Claude”:

```text
node plugins/openai-workers/ultra/cli.mjs start "<task>"
  -> cli.main() -> createService({env, backend: dispatch})
     -> ExecutionStore + RecruitmentBroker + UltraRuntime + PermissionBoundary
     -> UltraService.invoke('ultra_start') -> broker.createMission()
node .../ultra/cli.mjs recruit MISSION_ID proposal.json REQUEST_KEY
  -> UltraService.invoke('ultra_recruit') -> broker.request() -> admission/approval
[explicit owner approvals via interactive terminal, if required]
node .../ultra/cli.mjs step MISSION_ID
  -> UltraService.invoke('ultra_step') -> runtime.tick()
     -> broker.recover()/claim() -> UltraRuntime.step()
     -> dispatch('create') / dispatch('poll'), checkpoint/recordUsage
     -> model 'recruit_agent' -> broker.request(child)
     -> model 'wait_for_agents' -> broker.waitFor()
     -> model 'agent_results', scoped read/private stage tools
node .../ultra/cli.mjs status MISSION_ID
  -> broker.diagnostics()
```

**References:** `ultra/cli.mjs` lines **13–60, 80–180**; `ultra/service.mjs` lines **73–154**; `ultra/broker.mjs` lines **57–135, 403–498**; `ultra/runtime.mjs` lines **25–204**; `ultra/store.mjs`; `ultra/permissions.mjs`; `docs/ULTRA_RUNTIME.md` in the donor root.

**What actually exists:** durable mission and event state, recruitment/budgets/depth/concurrency, review/admission, leased work, `tick()`, provider create/poll/continuation, recursive recruitment/wait/results, cancellation and conservative crash reconciliation. This execution path is **standalone Node** and does not invoke `$.agent.spawn`. It is **not** evidence that CLcode E03 has been run live.

**Limits that matter to CLcode:**

1. `ultra/service.mjs` enumerates `OPENAI_WORKERS`, not the NVIDIA/LM Studio provider workers; its accounting/admission requires bounded known prices. It is **not** yet a generic multi-provider runtime.
2. ULTRA requires owner `config.enabled` and, for real API calls, separately set `OPENAI_ULTRA_ALLOW_API=1`; recruitment can require real interactive owner approval. Do not weaken these to make a demo pass.
3. `runtimeTools` supports `recruit_agent`, `wait_for_agents`, `agent_results`, `read_file`, `create_stage`, `stage_write`, `stage_patch`. Profile A thinks; B can read permitted roots; C edits **private staged copies**, not the live working tree. **No arbitrary Bash/ordinary Read → Edit → Test executor** is included. `docs/ULTRA_RUNTIME.md` explicitly disclaims such acceptance.
4. A `start` mission root is policy/state; `recruit` and `step` are separate, and a non-Claude root **principal model** is not automatically started. No existing `/oai:s` consumer is wired to `UltraRuntime.step`.
5. The native `NativeController` and independent `UltraRuntime` share broker concepts but are **different launch paths**. Avoid collapsing their security/host identities into one “already works” assertion.

**Engineering implication:** preserve this as reusable advanced orchestration and security research. The **smallest first proof** should not require porting its full policy graph, spinning a second provider client, or enabling untested live execution. Reuse its boundary utilities later where practical.

## 5. Provider, accounting, continuation, and tool boundaries

### 5.1 Model profile/credential source

| Concern | Source and exact behavior | Claude dependency |
| --- | --- | --- |
| Model names/routes | `bridge/workers.mjs::WORKER_TYPES, workerSettings, selectWorkerEffort, canonicalWorker, isProviderWorker` (lines 2–174) | **None**; configured worker names map to fixed model/key/effort policies |
| Keys | `bridge/openai.mjs::configuredKey/getKey` (47–78) | **None**; `OPENAI_API_KEY`, `OPENAI_FREE_API_KEY`, `NVIDIA_API_KEY`, or Windows DPAPI user files decrypted with `scripts/read-openai-key.ps1`. Free and paid keys never silently cross-route |
| OpenAI requests | `openai.mjs::request,validateTurnArgs,createTurn,pollTurn,cancelTurn,normalize` (79–213) | **None**; HTTPS Responses API, background responses, `previous_response_id`, tool manifests and service tiers; local estimated pricing |
| NVIDIA + LM Studio | `bridge/chat.mjs::providerUrl/checkProviderUrl/createChat` and `chat.create/poll/cancel` (41–67, 256–559) | **None**; Chat Completions HTTP/SSE; NVIDIA default `https://integrate.api.nvidia.com/v1`, LM Studio default `http://127.0.0.1:1234/v1` |
| Chat memory | `bridge/convo.mjs::createConvo/get/append/rewrite/patch` (~143–185) | **None**; persisted conversation and revisions, provider-specific synthetic `chat_<conversation>_<revision>` response IDs |
| OpenAI ledger | `bridge/usage.mjs::quoteRequest/reserveRequest/accountResponse/accountByResponseId/responseRecord/usageSnapshot` (344–544) | **None**; admission, paid/free profiles, daily headroom, monthly cost guard, durable response/key binding |
| Traces/rotation | `bridge/trace.mjs` and `bridge/rotation.mjs` | **None**; local logs and NVIDIA provider selection/concurrency policy |

`server.mjs::dispatch` lines **98–253** routes `isProviderWorker` before its standard switch. For OpenAI, `checkedCreate` enforces configured model/tier/effort, known pricing, and budget admission **before POST**; `reserveRequest` issues a ledger ticket; transport response is accounted or marked ambiguous. Poll/cancel verify immutable response/worker/key binding via `boundResponse` and `usage.mjs::responseRecord` before touching a remote response. Continuation with `previous_response_id` must match the ledger's verified complete history/model; a caller cannot invent a cheap prior context. **Keep this dispatch** instead of invoking low-level HTTP and accidentally bypassing spending/identity guards.

Provider-side `chat.create` saves the conversation, starts a streaming request in an in-process `turns` Map, and returns `in_progress`. `chat.poll` returns the live result or last persisted `lastTurn`; if the bridge restarted mid-step it may return `failed` “no longer tracked.” `chat.cancel` uses `AbortController` for live streams, otherwise `cancel_unknown`. Provider-chat local `estimatedUsd:0` is a **local treatment**, not verified external billing or a promise of free access; OpenAI ledger usage/cost is also explicitly an estimate, not authoritative invoice data.

### 5.2 What “continuation” really means

- **OpenAI Responses:** `createTurn` uses `store:true`, `background:true` and optional `previous_response_id`. `dispatch` validates previous response ownership/context; `pollTurn` GETs a known `resp_...` and `cancelTurn` POSTs cancellation. The caller must supply a **new model step** with new input/tool results after a completed response. Polling alone is not continuing a model/tool loop.
- **NVIDIA/LM Studio:** `chat.create` with `previous_response_id` parses its `chat_...` token and replays the current `convo.mjs` history; it accepts tool outputs in Responses-style `function_call_output` and transforms them into Chat Completions messages (`chat.mjs::inputToMessages/applyStep`). The transport is already a normalization adapter; do not build another one.
- **Accounting:** `usage.mjs::quoteRequest` does conservative upper-bound reservation, `accountResponse` settles when measurement exists, `markRequestAmbiguous` preserves uncertainty, and `responseRecord` binds OpenAI response ID to worker/key/model. A timed-out/cancelled POST may already have incurred usage. **Never** auto-POST again after an ambiguous network outcome or release its reservation on assumption.
- **Mid-flight cancel:** cancellation is provider-specific and not always terminal-confirmed. Record `cancelling`/`cancel_unknown` truthfully until observed; never report success solely because abort was requested.

### 5.3 Actual tool execution currently lives in Claude

`hooks/tools.js` exports `TOOL_SPECS`, `OPENAI_TOOLS` and `filterToolArgs` for **Read**, **Edit**, **Write**, **Bash**. These are schema/argument filters only: the file itself explicitly says Claude Code executes each call and checks permissions. `hooks/step.js::responseStep` emits host toolUse records; `hooks/step.js::nextInput` reads host `toolResults` and turns them into `function_call_output`; `hooks/register.js::turn.step` depends on `$.session.messages` for that transcript. None of these modules can make a filesystem edit by themselves.

The minimum independent replacement is a **CLcode-owned scoped tool dispatcher** that executes a *model-returned* call and supplies its actual output to the **existing** provider continuation path:

```text
dispatch('create', { tools: OPENAI_TOOLS, ... })
 -> returned normalized response.calls [{call_id,name,args},...]
 -> filterToolArgs(name,args)
 -> CLcode scope/permission check -> real file/process operation -> captured result/error
 -> dispatch('create',{previous_response_id:response.id,
                        input:[{type:'function_call_output',
                                call_id:original_call_id,output:actual_result}], ...})
 -> repeat under step/token/time/cost bounds -> final text
```

For permissions reuse `ultra/permissions.mjs::PermissionBoundary` where it directly fits canonical root/file and secret/link rules; inspect before treating it as a drop-in for live writes. A minimal standalone `Bash` adapter must enforce selected `projectScope` cwd, process timeout, bounded stdout/stderr, command policy, no privileged environment leakage, and an explicit outer user grant. Existing ULTRA stage tools are **not** a shell or permission to live-write. The disposable PC is not a substitute for proper filesystem/credential scopes.

## 6. Dependency classification

| Category | Module/function(s) | Required action |
| --- | --- | --- |
| **A — independent now** | `bridge/server.mjs::dispatch` and stdio `handle`; `bridge/openai.mjs`; `bridge/chat.mjs`; `bridge/workers.mjs`; `bridge/usage.mjs`; `bridge/convo.mjs`; `bridge/steer.mjs`; `bridge/trace.mjs`/`rotation.mjs` | Import/keep pinned; supply own env + lifecycle; perform live E02 |
| **A — independent but limited** | `bridge/direct-run.mjs::parseRun/attachFiles/startDirect/getDirect/listDirect` | Text-only first proof; do not claim tools/steer/cancel or process restart recovery |
| **A — independent control panel** | `scripts/oai-config.mjs::createConfigServer/main`; `oai-config-core.mjs`; `oai-ws.mjs` | Run as Node; isolate config/state, authenticate, optionally extend its **existing** local server later |
| **A — independent but governed** | `ultra/cli.mjs`; `ultra/service.mjs::createService/UltraService`; `ultra/broker.mjs`; `ultra/runtime.mjs::tick/step`; `ultra/store.mjs`; `ultra/permissions.mjs` | Preserve; not a turnkey generic provider coding agent; owner opt-in and approval unchanged |
| **B — small entry adapter** | `hooks/register.js` command `oai:run`/`oai:s` into bridge `run/steer` | CLcode local API/CLI instead of host `command.run` / `$.mcp.call` |
| **B — state and conversation adapter** | `hooks/step.js::newRun/nextInput/responseStep`, `hooks/register.js::withSteering`, `steer.upsertRun/takeTips` | Supply CLcode-owned transcript/step state, tool results and active agent IDs; do **not** clone a complete host transcript system |
| **B — supervisor-facing settings** | `oai-config-core.mjs::defaultStore/applyChanges`; `workerSettings` | Isolated CLcode state and coherent env snapshot on spawn/reload; no mutating stock Claude |
| **B — tool-schema adapter** | `hooks/tools.js::OPENAI_TOOLS/filterToolArgs` | Execute authorized tools with CLcode-owned scoped filesystem/process adapter |
| **C — Claude host service** | `$.agent.register/list`, `on('agent.spawn')`, `next(e)`, host `Agent`/`SubagentHandback` | **Replace** actual agent ownership and handback with supervisor state, not a mock host |
| **C — Claude step/session** | `on('session.start')`, `on('turn.start/step/complete')`; `$.session.messages/cwd/info/id/model/version/surfaces`; `$.state.get/set`; host `turnId/index`/stream signal | **Replace** scheduling, run state, transcript and cancellation source |
| **C — Claude tool host** | `on('tool.check/run')`, permission prompts, native `Read/Edit/Write/Bash`, host tool-results storage | **Replace** tool execution and outer authorization; preserve fail-closed behavior |
| **C — native authenticated surface** | `hooks/channel.js`; `bridge/native-channel.mjs`; `ultra/native-controller.mjs` bound native session / host agent IDs | Do not spoof or “reuse unchanged” as an independent CLcode session; use the already independent `UltraRuntime` when advanced policy is needed |
| **C — proprietary desktop engine/UI** | Claude Desktop Code shell/embedded engine, session lifecycle and distribution | Reference behavior only; independent CLcode desktop implementation subject to separate license/design decision |

**Boundary test:** if Claude is not installed, `bridge/server.mjs::dispatch` remains importable in Node; `$.agent.register`, `next(e)` and `$.session.messages` simply do not exist. The independence claim rests on the former, not on emulating those proprietary objects.

**Security warning:** `bridge/server.mjs::handle` advertises the `run` tool, but its `PROOF_REQUIRED_WHEN_ULTRA` set (line ~309) only covers `create/poll/cancel/page`. `dispatch('run')` makes **trusted in-process** calls to `dispatch('create')`. This is a source-visible authority boundary worth reviewing, **not** evidence of an exploited vulnerability. Do not expose the raw bridge MCP transport or `run` directly on unauthenticated HTTP/WebSocket; CLcode's own local control channel must authenticate callers, gate spending and path scope, and prevent model-visible control calls.

## 7. Smallest standalone CLcode supervisor

### 7.1 One process, one provider backend, one run owner

Implement a **small long-lived CLcode Node backend** (no VM, no new orchestration framework) that owns its process, local control socket/loopback authentication, run-to-response mapping and next-step scheduling. It imports **one pinned GPTopus provider dispatcher** (`bridge/server.mjs::dispatch`); optionally imports the exact `steer` and `step` helpers. The CLcode desktop UI will be a client of this backend, not a second run owner. Do not embed GPTopus source in a fork until extraction proves a hard packaging obstacle.

Minimal operations:

| Operation | Input / output contract | Required semantics |
| --- | --- | --- |
| `spawn` | `{worker,task,projectScope,budget} -> {runId}` | Allocate local ID, validate scope/budget/config, persist queued/running record, start **new** provider request via existing dispatch; reject unknown worker and uncontrolled concurrency |
| `status` | `(runId) -> {state,worker,model,step,responseId,usage,updatedAt,error}` | Probe supervisor-owned record; states truthful (`queued/running/waiting_for_tool/cancelling/completed/failed/cancelled/interrupted`); label unknown usage |
| `steer` | `({runId,text,hard?,pin?}) -> {accepted,tipId,deliveryState}` | Validate **active** owned run, use `steer.enqueueTip`, then consume on its next step via `takeTips`; do **not** confuse queued with delivered |
| `cancel` | `(runId) -> {state,providerCancelId?,confirmed}` | Abort pending work, call `dispatch('cancel')` if a response ID exists, record uncertainty/usage; block further tool execution, terminal state only when justified |
| `result` | `(runId) -> {state,text,toolResults?,usage,reason}` | Durable final answer/error and tool evidence, no invented completion on crash |
| `listRuns` (small convenience) | `() -> recent and active run summaries` | Based on the **same** registry as `status`; not `steer.listRuns` alone |

`runId` can be a generated UUID/opaque ID distinct from provider response ID; `responseId` and optional `convoId` are stored separately. If reusing GPTopus's `D#` display labels, avoid racing `nextId` between processes. Keep a **single write owner** and bounded job concurrency; do not introduce fleet machinery just to prove one worker. Use small atomic records; consider the existing `ExecutionStore` only when its stronger mission/event semantics become necessary. Do not maintain two authoritative run registries.

### 7.2 Request path, queue, and tool loop

```text
CLcode UI/CLI
   -> authenticated local controller -> supervisor.spawn()
      -> workerSettings/configured key + budget + projectScope validation
      -> persist run state + steer.upsertRun(runId,...)
      -> dispatch('create', ...)              [existing GPTopus, all providers]
      -> responseId bound to runId
      -> dispatch('poll', ...) while in progress, with deadline
      -> normalize/fully unpack paged result
      -> consume steer.takeTips(runId,step) before *next* model step
      -> if calls: scoped tool dispatcher -> actual results -> dispatch('create',previous_response_id,...)
      -> if terminal: persist result; steer.upsertRun(status:'ended')
   -> supervisor.status/steer/cancel/result()
```

Do **not** try to turn `oai-config.mjs` into the process owner. Its UI/WS can be extended later with a few local endpoints backed by the **same** supervisor object after E03; `createConfigServer` must not silently instantiate another independent fleet.

**Steering contract:** a normal tip is guaranteed only at the next model-step boundary. For provider chat streams, existing thought-steer behavior can optionally be enabled through `agent_id=runId`, with observed limitations; for OpenAI an acknowledged hard tip may require cancelling in-progress work and constructing a **new** authorized request using validated context/usage. Preserve input history and do not double-charge by automatic ambiguous POST replay.

**Crash/cancel contract:** while in-process Node owns an active request, a crash can orphan a remote OpenAI background response or a provider-chat stream. Persist `responseId` before acknowledging full spawn if possible; after restart reconcile known OpenAI response by **GET** only. Unknown POST acceptance must be `interrupted/needs_reconciliation`, not silently replayed. NVIDIA/LM Studio lack a guaranteed in-memory turn after restart; use `convo` state to report what is known. An outbound `cancel` request alone is not proof of a confirmed terminal state.

### 7.3 What exactly is needed for one genuine Claude-free call (E02)

1. A checkout at the **pinned GPTopus SHA**, Node >=20.11.0, and a long-lived Node process importing `bridge/server.mjs::dispatch`. No Claude hooks, `Agent` tool, MCP client or Anthropic inference token is required for this call.
2. A configured **valid worker/model** in `bridge/workers.mjs`. For local `lmstudio`, the matching local model must be loaded and the service reachable at its allowed URL; for NVIDIA, a scoped NVIDIA API key, permitted endpoint and remote account access; for OpenAI, scoped paid/free key, route eligibility, known price/budget, and live API availability.
3. A consistent environment including isolated `OPENAI_WORKER_USAGE_DIR` and selected `OPENAI_WORKER_*`/`OAI_*` settings, with appropriate config-store/restart handling. No stock Claude user environment edits.
4. A call to `dispatch('create',{worker_type,model,input,instructions,tools:[]})` (or existing `dispatch('run',{args:'worker task'})`), followed by `poll` as required. Check actual returned `status` and `text`, process logs and usage; reassemble `paged` outputs if applicable.
5. A bound timeout, error and accounting inspection. Do **not** infer “no Anthropic calls” from lack of application log entries; for E08 use observed network/process evidence on the disposable PC.

**UNVERIFIED:** actual credentials, installed models, reachable network, live endpoint success, actual spend, and whether the current model IDs are served. Do not claim a provider PASS until the real response and physical process/network observations are captured.

## 8. Extraction sequence, risks, and experiments

| Order | Work slice | Estimated cost / risk | Stop / acceptance |
| --- | --- | --- | --- |
| **0** | Pin donor + isolate checkout/state; manually try `oai-config.mjs` | **Very low / low** | E01 requires UI auth and persisted nonsecret setting after restart; no Claude installed |
| **1** | Import `dispatch` from a hostless CLcode Node script; real `create/poll` | **Low / low–medium** (model/API availability) | E02 **live** response from non-Claude model with no Claude process; capture exact model/version/usage |
| **2** | Thin supervisor around `dispatch` with `spawn/status/result/cancel`, durable run association | **Low–medium / medium** (in-flight uncertainty) | E03 independent run ownership; E04 cancel behavior, no fabricated confirmed termination |
| **3** | Register supervisor run with `steer`; consume tips before next step; optional provider thought-steer | **Low–medium / medium** (race/restart) | E04 tip actually changes a subsequent model request; delivery logged, not merely queued |
| **4** | Wire `OPENAI_TOOLS`/`filterToolArgs` to bounded local file/process executor and provider continuation | **Medium / high** (filesystem and shell permissions) | E06 model chooses genuine Read → Edit → Test and actual outputs/patch; test scope enforced |
| **5** | Integrate same supervisor into independent desktop shell | **High / high** (UI, packaging, license) | E07 desktop session/project/diff/tool UX; E08 observed no Anthropic inference |
| **Later** | Decide if ULTRA broker/reviews/budgets and native-equivalent recursion are needed | **High / medium–high** | Extend **one** approved supervisor path; do not build competing orchestration stacks |

### High-value pitfalls Codex must check before making changes

- **Command entry is host-dependent; provider transport is not.** The simplest proof imports `dispatch` directly. Do not spend time reproducing Claude slash commands.
- **Three separate state stores are not the same thing:** direct `D#` records; `steer` host agent/callsign records; `convo` provider chat histories. Pick one CLcode run authority and map into the existing stores; do not treat any list as liveness proof.
- **ULTRA native `admit` does not spawn a worker.** Only host `next(e)` does. The independent `UltraRuntime` does spawn/tick admitted broker jobs **after** recruiting and granting permission; that is a distinct path.
- **ULTRA independent runtime is OpenAI-oriented and has staged-file tools**, not a substitute for CLcode's needed non-Claude principal+scoped live Edit/Test loop.
- **Raw MCP `run` authority and `@path` reads need confinement.** Never expose a public port, route model tool calls to raw `run`, or allow prompt-controlled arbitrary file attachments.
- **Config writes need process-env alignment.** On Windows prefer dedicated JSON state to avoid writing stock `HKCU\Environment`. A UI slider change is not a live bridge reconfiguration.
- **Responses are billable and retries are hazardous.** Reuse `usage.mjs`/`server.mjs` reservation/identity checks; retain ambiguous spend, never automatically duplicate a POST.
- **Provider streaming and OpenAI background responses have different restart/cancel semantics.** Surface unknown states honestly. Guard long polls and stale UI status.
- **Tool schema is not a tool executor.** Do not pass E06 on a mocked `Read` result, an artificial edit, or a stage-only patch that never reaches an actual fixture/test.
- **No CI/VM/tooling expansion** until a physical Windows demonstration gives a reason. Do not alter GPTopus or stock Claude for this extraction.

### Evidence ledger

| Experiment | Current result | Source evidence / exact next proof |
| --- | --- | --- |
| E01 standalone configuration | **NOT RUN / UNVERIFIED** | `createConfigServer` source runnable; launch on disposable PC, authenticate, save/restart |
| E02 hostless inference | **NOT RUN / UNVERIFIED** | `dispatch('create')` source independent; capture live response in Node without Claude |
| E03 independent spawn | **NOT RUN / UNVERIFIED** | `startDirect` source starts text requests; source is not an observed E03 controlled agent |
| E04 steering and cancellation | **NOT RUN / UNVERIFIED** | `steer` queue and provider cancel code exist, but no direct-run registration/consumer/cancel API |
| E05 restart recovery | **NOT RUN / UNVERIFIED** | ULTRA has durable recovery; direct-run has potential stale status after crash |
| E06 real Read → Edit → Test | **NOT RUN / UNVERIFIED** | `hooks/tools.js` defines schemas, Claude runs those tools; ULTRA only private-stage writes |
| E07 desktop UX | **NOT RUN / UNVERIFIED** | Panel ≠ desktop Code app |
| E08 zero Anthropic inference | **NOT RUN / UNVERIFIED** | Must observe network/process traffic, not infer from source or missing log |
| E09/E10 optional quota/capability tests | **NOT RUN / UNVERIFIED** | Do not rely on quota hypothesis; do enforce scopes |

## 9. Next three Codex implementation tasks

The **CLcode repository currently contains only planning/documentation**. Paths below are **proposed new files**, not claims they already exist. Source imports point to a **separate pinned donor checkout**; CLcode should not modify GPTopus.

### Task 1 — **CLCODE-GPT-BRIDGE-001: live hostless provider seam (E01/E02)**

**Create in CLcode:** `src/backend/gptopus-bridge.mjs`, `scripts/e02-smoke.mjs`, and at most one small `tests/backend/gptopus-bridge.test.mjs`. No application GUI, new provider client, framework, CI or VM.

- Resolve an explicitly configured, absolute `CLCODE_GPTOPUS_ROOT` checkout; assert/read its exact `git rev-parse HEAD` against pinned SHA (or a documented intentional override for new investigation). Dynamic import the donor's `plugins/openai-workers/bridge/server.mjs` with Node's path-to-file-URL; expose a tiny wrapper for `dispatch('health'|'create'|'poll'|'cancel'|'page'|'usage')` and `workerSettings`. No `$.mcp` or `$.agent` emulation.
- In an isolated temporary state directory, test parsing, model/profile selection, a mocked transport dispatch, and no key/localhost-token leakage. Prefer one source-injected/mock transport to unit-test response shapes, with no default billed requests.
- `e02-smoke.mjs` is an **explicit live opt-in**: user-selected valid configured worker, minimal task, genuine provider create/poll and a recorded final status/usage; reassemble paged response. No secrets printed, no automatic retries of ambiguous POST. For NVIDIA/LM Studio use existing Chat adapter, not an OpenAI-shaped handcoded endpoint.
- Provide the E01 Windows command above as a manual reproduction (do not fold UI source into CLcode). In `docs/EXPERIMENTS.md` *later*, evidence can be recorded by the implementing agent; **this prepass does not edit that document**.

**Acceptance:** real E02 inference can be run with **Claude Code not installed/running**, with exact GPTopus SHA, process, model and source of usage recorded. A fully mocked response **does not pass** E02; if credentials/model unavailable report **UNVERIFIED** and exact blocker. No Anthropic key/call required. No GPTopus/stock Claude files changed.

### Task 2 — **CLCODE-RUN-OWNER-001: actual spawn/status/cancel/results (E03/E04 core)**

**Create in CLcode:** `src/backend/run-supervisor.mjs`, `src/backend/local-control.mjs` (small authenticated loopback or process-local CLI facade), and `tests/backend/run-supervisor.test.mjs`. Reuse Task 1's adapter; no parallel provider implementation.

- Give one CLcode Node process authority over `runId -> {worker,model,projectScope,budget,responseId,step,status,usage,finalResult}`. Validate worker, concurrency, timeout, budget and scope on `spawn`; call the existing GPTopus `dispatch('create')`, then poll, persist and expose status/result. Do **not** pretend that `direct.startDirect` already supports these operations.
- Route `cancel(runId)` to donor `dispatch('cancel')` after recording local cancel intent; stop future step/tool dispatch; preserve “cancel unknown” and unknown billed usage. Implement bounded polling and process shutdown behavior; ensure status after kill/restart says interrupted/needs reconciliation rather than perpetually running.
- Keep the local endpoint bound to loopback, with caller authentication/token/origin discipline consistent with `oai-config.mjs`. Never expose donor `server.mjs::run` unauthenticated. One owner process: no extra broker daemon, fleet manager, or CI suite.

**Acceptance:** E03 launches a **new** provider request via CLcode, proves it is not steering an existing host subagent, returns real model output and a stable run ID; `status/result` agree and can be inspected. A long-running request can be **requested** to cancel and the reported terminal state matches observed provider response; a failed/ambiguous cancel is not marked confirmed. At most one modest targeted test group plus a disposable-PC manual run.

### Task 3 — **CLCODE-STEER-TOOL-001: real next-step steering and first scoped tool continuation (E04 → E06)**

**Create in CLcode:** `src/backend/steer-adapter.mjs`, `src/backend/tool-driver.mjs`, `tests/backend/steer-tool.test.mjs` and a tiny disposable fixture under `tests/fixtures/code-loop/`. Integrate them into **the same** `run-supervisor.mjs`; no separate scheduler.

- Map the authoritative CLcode `runId` to `steer.upsertRun` at spawn, `steer.enqueueTip` upon operator command, `steer.takeTips` at the next model step, and `upsertRun(status:'ended')` on termination. Reuse `steer.tipMessage` and (where appropriate) `hooks/register.js::withSteering`. Record queued vs delivered/acknowledged. Do not falsely promise OpenAI in-flight thought modification.
- Reuse donor `hooks/tools.js::OPENAI_TOOLS/filterToolArgs`, normalized `response.calls`, and the donor provider continuation contract; for each call validate exact schema and external projectScope grant, execute actual `Read`, `Edit`, `Write` or a tightly allowlisted **test** command with bounded process output/time/cwd, return real `function_call_output` with the original `call_id`, and pass `previous_response_id`. Treat source/test output as untrusted; retain call/error evidence and avoid repeating side effects after an uncertain crash.
- Keep fixture scope as the only authorized writable root. Reject out-of-scope/secret reads and arbitrary shell invocations; do not use the model to override these guards. Optionally use `PermissionBoundary` for canonical path/secret checks but do not mistake `stage_write` for live editing.
- Prove a tip delivered before a subsequent request materially influences the resulting model step, not just a queued `tipId`. Then prove at least a **single genuine** provider-selected Read → tool result → next model step in a local fixture; extend to model-selected Edit → Test with observable diff/test output for full E06.

**Acceptance:** E04 has a trace of `enqueueTip -> takeTips -> next model input` and confirmed bounded cancellation where applicable; E06 only passes after a real model chooses and executes Read, Edit and Test within the disposable fixture, with concrete file diff and test output. No replayed synthetic provider decisions, scripted file edits dressed as tool calls, host Claude process, or new CI infrastructure. If the available model fails to choose tools, record the negative finding and keep E06 **UNVERIFIED**, not PASS.

---

## Final handoff decision

**Implement the smallest proof first:** GPTopus `dispatch` is the existing host-independent provider boundary. A CLcode-owned **single run supervisor** must replace Claude's entry/scheduling/tool ownership; its local API can reuse `steer`/`convo` and later serve the desktop. The separately executable `UltraRuntime` is valuable, but does not magically make the current `/oai:run` or Claude-native subagents independent and should not be used to justify another months-long orchestration rewrite.

**No live success is claimed by this document.** The acceptance gates remain those in CLcode's ROADMAP and EXPERIMENTS.
