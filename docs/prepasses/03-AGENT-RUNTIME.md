# CLcode PREPASS-03 — Minimal Model-Independent Agent Runtime

**Status:** source-grounded implementation design; **no E02/E06 live pass claimed**.  
**Scope:** one independent, non-Claude principal performing real Read → Edit → Test on a disposable local Git fixture; delegated workers use the same contract later. **No new general agent framework.**  
**Repository baseline:** CLcode `main` at `2ba8a3100d046c87cb55e03d3dc985c3ce2cb5ef`.  
**Pinned GPTopus donor:** `techrote/Chlaude-GPTopus` at [`849627463c3e2be660f9d24976320b072c107b34`](https://github.com/techrote/Chlaude-GPTopus/commit/849627463c3e2be660f9d24976320b072c107b34), branch `ultra/004-integration`. It is **not** the donor repository's `main` tip; do not substitute `main` silently.  
**Read alongside:** [CLcode ROADMAP](../ROADMAP.md), [PLAN](../PLAN.md), [EXPERIMENTS](../EXPERIMENTS.md). External documentation checked 2026-11-23; exact links in `12.

## Contents

1. [Decision and three distinct products](#1-decision-and-three-distinct-products) — the missing part is host-owned execution, not another inference router.
2. [Source evidence and ownership boundary](#2-source-evidence-and-ownership-boundary) — what GPTopus actually implements at the pinned commit.
3. [Small canonical protocol](#3-small-canonical-protocol) — requests, turns, cursors, events and agent/delegate identities.
4. [Provider compatibility and loss boundaries](#4-provider-compatibility-and-loss-boundaries) — Responses, Chat Completions, NVIDIA and local models.
5. [State machine and persistence](#5-state-machine-and-persistence) — exact transitions and recovery rules.
6. [One genuine coding turn](#6-one-genuine-coding-turn) — sequence diagram and implementable loop.
7. [Tools, authorization and capability scope](#7-tools-authorization-and-capability-scope) — Read, Edit, constrained Bash/Test and local Git.
8. [Continuation, errors, cancellation and accounting](#8-continuation-errors-cancellation-and-accounting) — bounded work without fake reliability.
9. [GPTopus extraction inventory](#9-gptopus-extraction-inventory) — reuse unchanged, wrap/adapt, or exclude.
10. [E02 → E06 implementation order](#10-e02--e06-implementation-order) — smallest sequence Codex can execute.
11. [Failure modes and five acceptance checks](#11-failure-modes-and-five-acceptance-checks) — proof, not a CI programme.
12. [Authoritative external references](#12-authoritative-external-references) — provider protocol documentation.

## 1. Decision and three distinct products

**Recommendation:** implement a tiny CLcode `RunController` consuming the **existing GPTopus `create/poll/cancel` transport contract**. Add only (a) a run journal, (b) three host-side tool implementations behind an admission scope, and (c) the repeated model/tool loop. The desktop shell is a future client of this same controller; the first E06 proof is headless. Do **not** import the Claude Code hook/runtime lifecycle into CLcode.

| Thing | What actually exists | What it does **not** prove |
| --- | --- | --- |
| **Single-shot remote message** | One inference request; optionally stored/polled and answered asynchronously. GPTopus `/oai:run` does exactly this with `tools: []`. | No autonomous file operations, even if the answer contains a suggested patch. |
| **Persistent model conversation** | A series of inference steps with retained or replayed context and correlated tool-result *messages*. GPTopus `bridge/convo.mjs` provides this for chat transports; OpenAI Responses has response-ID chaining. | The model does not thereby acquire permission or ability to execute OS tools. |
| **Tool-executing agent** | **CLcode-owned loop:** ask model; validate requests; authorize and execute real tools; record outcomes; feed tool results back; repeat until a supported terminal condition. | Not equivalent to generating valid JSON, printing a command, or Claude-hosted tools doing the work. |

**Strict boundary:** only the controller owns run state, tool execution, project scope and spending caps. Providers own inference. The model can *request* actions; a JSON tool call is untrusted input, never authority. The desktop renderer receives read-only run/events/diffs and issues authenticated user control commands, not direct shell or provider-transport access.

Architecture for the initial proof:

~~~text
Desktop (later) / tiny test driver
              |
              v
 CLcode RunController + run journal ----> GPTopus dispatch(create/poll/cancel)
              |                                   |
              |                             OpenAI Responses
              |                             NVIDIA / LM Studio Chat
              v
  scope validator + tool executor
          Read | Edit | Bash(Test)
              |
         disposable fixture Git repo
~~~

There is **one provider/control-plane implementation** to extract, not two competing vendor SDK stacks. Optional delegates are just another `RunController` instance with `parentRunId` and a **strict subset** of the parent's scope/budget. Do not implement delegation in E06.

## 2. Source evidence and ownership boundary

All links in this table point to the **pinned GPTopus revision**, not a moving branch.

| Source | Observed code fact | Consequence for CLcode |
| --- | --- | --- |
| [`bridge/server.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/server.mjs#L102-L250) | Exports `dispatch(name,args,options)`; `create/poll/cancel` route by configured worker to OpenAI or `chat`. Paged responses exist. | Import or call **this trusted in-process boundary** initially; do not expose its raw MCP `tools/call` to the model or UI. |
| [`bridge/openai.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/openai.mjs#L79-L213) | Real `/v1/responses` request/poll/cancel, function-call normalization, `previous_response_id`, `store: true`, `background: true`, usage and ambiguous-POST classification. Accepts only `gpt-*` model IDs. | Keep for OpenAI; it is not a generic provider adapter and does not expose typed Responses streaming. |
| [`bridge/chat.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/chat.mjs#L70-L559) | NVIDIA/LM Studio Chat Completions streaming; tool-delta accumulation; tool results correlated; `create/poll/cancel`; provider-local conversation revisions; thought-steering restart. | Reuse transport for E02/E06. **Do not** assume its current streaming parser, reasoning treatment or recovery semantics are lossless. |
| [`bridge/convo.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/convo.mjs#L67-L151) | Persists and edits Chat history atomically; trims old message/tool groups by **byte size**. | Useful provisional provider history, **not** the CLcode authoritative agent journal or a context-token compactor. |
| [`bridge/direct-run.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/direct-run.mjs#L73-L105) | Instruction says no tools/file access; dispatches `tools: []`; `@path` is a textual attachment. | **E02 foothold only.** Do not present it as the E06 tool loop. |
| [`hooks/tools.js`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/hooks/tools.js) and [`hooks/step.js`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/hooks/step.js) | Read/Edit/Write/Bash function schemas and tool-result mapping exist. Comments explicitly say **Claude Code executes/checks permissions**. | Schemas and correlation logic are reusable; host-side implementations are **missing** from this path. |
| [`hooks/register.js`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/hooks/register.js#L456-L477) | `$.agent.register` supplies tools; `agent.spawn`/`command.run` depend on Claude Code. | Not the independent run launcher. |
| [`ultra/runtime.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/ultra/runtime.mjs#L110-L204), [`ultra/permissions.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/ultra/permissions.mjs) | A separate governed model/tool loop and cautious file boundary **do** exist, but are tied to ULTRA broker/permissions/staging/recruitment and have **no arbitrary shell executor**. | Consult for edge cases; do **not** transplant ULTRA orchestration as E06's minimal runtime. |
| [`bridge/usage.mjs`](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/bridge/usage.mjs#L342-L439) | Conservatively reserves/reconciles **OpenAI** costs; ambiguous accepted requests stay pending. Chat provider path bypasses this ledger. | Preserve OpenAI accounting; CLcode needs its own per-run counters, including `unknown` for missing usage/prices. |

**Important limits of the evidence:** code inspection confirms an available contract, **not** that it has executed on the disposable Windows PC without Claude. CLcode's [experiment ledger](../EXPERIMENTS.md) currently records every E01–E10 trial as NOT RUN. Do not turn these source findings into PASS.

**Immediate integration seam:** `dispatch('create', {worker_type,model,input,instructions,tools,...})`, then `dispatch('poll',{id,worker_type})` and `dispatch('cancel',{id,worker_type})`. For chat, `previous_response_id` is a GPTopus local `chat_...` revision pointer, **not** an upstream server conversation ID. Keep those namespaces separate. A result with `paged: true` must be fully reconstructed with `dispatch('page',...)` before looking for calls.

## 3. Small canonical protocol

Keep **host intent** and **provider-native continuation data** in separate fields. Suggested TypeScript **interfaces** below are a design contract, not files that exist today:

~~~ts
type ModelRoute = {
  provider: "openai-responses" | "nvidia-chat" | "lmstudio-chat";
  workerType: string;   // existing GPTopus worker registry key
  modelId: string;      // resolved once at admission; no silent substitution
  configVersion: string;
};

type Capability = "yes" | "no" | "unknown";
type ModelCapabilities = {
  functionCalls: Capability;
  streaming: "responses-events" | "chat-chunks" | "none" | "unknown";
  continuation: "responses-id" | "local-chat-replay" | "none";
  reasoning: "opaque-items" | "provider-extension" | "none" | "unknown";
  remoteCancel: Capability;
  contextTokens?: number;      // unknown rather than invented
  maxOutputTokens?: number;
  effortValues: string[];      // provider/model-specific allowlist
};

type ToolDefinition = {
  name: "Read" | "Edit" | "Bash";  // Bash is constrained to Test in E06
  description: string;
  parameters: Record<string, unknown>;
};

type ToolCall = {
  callId: string;               // preserve provider call_id / Chat tool_call.id
  name: string;
  args: unknown;                // untrusted until parsed + schema validated
};
type ToolResult = {
  callId: string;
  ok: boolean;
  output: string;               // bounded text/JSON, includes explicit denials
  changedPaths?: string[];
};

type ProviderCursor = {
  transport: ModelRoute["provider"];
  lastResponseId: string;       // opaque to controller; route-bound
  // Adapter-owned, sealed continuation material where supported.
  // Never replace structured Responses reasoning with display text.
  opaqueStateRef?: string;
};

type InferenceRequest = {
  runId: string;
  parentRunId?: string;         // same contract for delegates later
  actor: "principal" | "delegate";
  route: ModelRoute;
  instructions: string;
  input: string | Array<{type: "function_call_output"; call_id: string; output: string}>;
  tools: ToolDefinition[];
  maxOutputTokens: number;
  effort?: string;
  cursor?: ProviderCursor;
};

type Usage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  estimatedUsd?: number;       // NEVER equate with provider billing
  provenance: "provider" | "estimate" | "unknown";
};

type ProviderTurn = {
  responseId: string;
  status: "queued" | "in_progress" | "completed" | "incomplete" |
          "failed" | "cancelled" | "unknown";
  text: string;
  calls: ToolCall[];
  cursor?: ProviderCursor;
  usage: Usage;
  finishReason?: string;
};

type RunEvent =
  | { kind: "text.delta"; value: string }
  | { kind: "reasoning.indicator"; active: boolean; summary?: string }
  | { kind: "tool.arguments.delta"; callId: string; value: string }
  | { kind: "tool.ready"; call: ToolCall }
  | { kind: "tool.result"; result: ToolResult }
  | { kind: "usage"; usage: Usage }
  | { kind: "run.status"; state: string; detail?: string };

interface ProviderAdapter {
  submit(req: InferenceRequest, emit?: (e: RunEvent) => void): Promise<ProviderTurn>;
  poll?(cursor: ProviderCursor): Promise<ProviderTurn>;
  cancel?(cursor: ProviderCursor): Promise<"confirmed" | "unknown" | "unsupported">;
}
~~~

**Practical E06 adapter:** a thin wrapper translating `InferenceRequest` to GPTopus `dispatch` and mapping the normalized `{id,status,text,calls,usage}` back to `ProviderTurn`. Use `poll` for OpenAI background responses; GPTopus Chat returns an in-progress local turn which can also be polled. Synthetic UI progress is allowed but must be labelled as polling, **not** falsely described as live token streaming.

**Durable agent record** (one JSONL journal plus small run metadata is sufficient):

- `runId`, `parentRunId?`, immutable route/model/config snapshot, operator-approved scope, budgets, task and instructions hash.
- Ordered `model.requested` → `model.accepted(responseId)` → `model.completed` with raw provider usage/finish status and cursor.
- Ordered `tool.proposed(callId,name,argsHash)` → `tool.authorized/denied` → `tool.started` → `tool.completed(ok,resultHash,changedPaths)`.
- Final status, recorded Git baseline and diff summary; redacted errors and cancellation outcome.

The **call key** is `(runId, responseId, callId)`; a bare provider `callId` is not globally unique. Only one model step may be active per actor. No tool executes until the full provider turn has completed and the finalized call arguments pass validation. Streamed argument fragments are **display-only**.

## 4. Provider compatibility and loss boundaries

| Transport | Tools / continuation | Streaming / reasoning | Readiness & caveat |
| --- | --- | --- | --- |
| **OpenAI Responses** (existing `openai.mjs`) | `response.output[]` function-call items; results via `function_call_output` with same `call_id`. `previous_response_id` supports provider-hosted continuation. | Rich typed SSE (`response.output_text.delta`, `response.function_call_arguments.delta/done`, terminal events) and opaque reasoning output items. GPTopus currently **polls**, not streams, this route. | **Implemented in donor** for configured `gpt-*` workers. Responses-specific reasoning, state, statuses, multi-item output and streaming cannot be faithfully downgraded to chat. |
| **OpenAI Chat Completions** (protocol only; donor `chat.mjs` targets NVIDIA/LM Studio) | `assistant.tool_calls[]`, `role:"tool"` / `tool_call_id`; entire history replayed by client. No Responses-style server chain. | SSE `choices[].delta` with tool-call fragments by `index`; reasoning fields are **not a portable standard**. `finish_reason` / usage need checking. | Supported for models that actually implement tool calling; **not** a universal fallback for GPT. Current OpenAI docs say newer Astra/Sol tool calling requires Responses. |
| **NVIDIA-hosted Build API** (`chat.mjs`) | Hosted `/v1/chat/completions` with model-dependent tool parser/format and local history in GPTopus. | Chat SSE; reasoning controls may be vendor/model-specific. | **Donor path exists**, no live target-model acceptance in CLcode. Do **not** infer every hosted model supports tools or that hosted Build universally exposes the Responses features documented for *self-hosted NIM* containers. |
| **LM Studio local** (`chat.mjs`) | Chat tools parsed from model output; `/v1/responses` and `previous_response_id` exist in **current LM Studio documentation**, but GPTopus uses Chat for LM Studio. | Chat SSE and sometimes provider-specific `reasoning_content` / `<think>`. | Tool quality depends on model **and chat template/parser**. Models without native tool formatting may emit ordinary text instead. A Qwen or KAT-Coder route is **a configured candidate**, not an E06 PASS. |

References: [OpenAI function calling][openai-tools], [Responses streaming][openai-stream], [Chat stream][chat-stream], [OpenAI conversation state][openai-state], [NVIDIA hosted API][nvidia-hosted], [NIM self-hosted API][nim-api], [LM Studio tool use][lm-tools], [LM Studio Responses][lm-responses].

**Never make these lossy conversions silently:**

1. Responses `output[]` may include multiple typed messages/tool calls, refusals, reasoning items and assistant phases. Flattening to one assistant string loses structure; the donor's `normalize()` is adequate to **identify tool calls** for E06 but not a complete preservation format.
2. Responses reasoning items (including encrypted content when applicable) need their original ordered input/output lineage when replaying statelessly. **Do not replace them with visible `<think>` text.** Prefer `store:true + previous_response_id` for E06; retain native output items if building portable stateless replay later.
3. Top-level Responses `instructions` are **not inherited** through `previous_response_id`: send the same relevant controller instructions on each request. A new delegate or provider route does not inherit a cursor from another.
4. Chat assistant tool-call groups require matching `role:"tool"` results for each ID. GPTopus `toRequestMessages()` inserts an **artificial error** for missing results and converts stray results to user text. CLcode must journal the **actual** outcome first; never treat such repair as observed execution.
5. Reasoning `effort`, `service_tier`, limits, multimodal payloads, built-in tools, tool strictness and streaming resumability differ. A null/unsupported capability stays **unknown or refused**; it must not be represented as supported by naming a parameter.
6. Chat streaming can terminate with `finish_reason:"length"`, a broken connection, malformed JSON or a missing usage chunk. GPTopus Chat currently marks only **length with neither text nor calls** as incomplete; CLcode must reject **truncated or ambiguous tool-call output regardless of partial text**. Donor code should eventually be hardened behind the adapter, not copied blindly.

### Capability discovery: no fictional universal catalogue

Use a local **explicit profile**, keyed by endpoint + model ID + model version/config, loaded from GPTopus `workerSettings()` plus CLcode's small overrides. A `GET /models` check establishes *availability/identifier*, **not** tested tool reliability, context length, reasoning support or billing. LM Studio's native model metadata may supply more information; only trust fields that the endpoint actually returns.

Mark `functionCalls="yes"` only after one live **non-destructive function-call probe** on the target model/template (returning a correlated result and a final answer). Keep `contextTokens` undefined if not independently established. GPTopus worker `tools:true` means **configured to advertise tools**, not empirically proven tool ability. Per-route effort mapping: Responses `reasoning.effort` where supported; Chat `reasoning_effort` or `chat_template_kwargs` **only** for explicitly configured models (see `workers.mjs` `thinkingParams`). Unsupported values fail preflight; do not send all options to every endpoint.

## 5. State machine and persistence

~~~text
CREATED
  -> ADMITTED (operator grant + budget + route snapshot)
  -> MODEL_SUBMITTING -> MODEL_WAITING -> MODEL_RECEIVED
        | timeout/5xx after possible acceptance -> NEEDS_RECONCILIATION
        | definitively unsubmitted/rejected      -> FAILED
  MODEL_RECEIVED
        | valid calls -> TOOL_PENDING -> TOOL_RUNNING -> TOOL_RECORDED
        | final text  -> VERIFY_OUTCOME -> COMPLETED / INCOMPLETE
        | bad output  -> FAILED / INCOMPLETE
  TOOL_RECORDED -> MODEL_SUBMITTING (results correlated, next turn)
Any active state -> CANCEL_REQUESTED -> CANCELLED / INTERRUPTED / NEEDS_RECONCILIATION
Any active state -> BUDGET_STOP (terminal)
~~~

**Guard conditions:** a model can return zero, one or multiple tool calls. Execute multiple calls **serially** in E06, after checking each against the grant and cancellation state. Return a recorded result (success or explicit denial/error) for **every** finalized call before asking the model again; do not pretend a rejected call succeeded. `COMPLETED` requires actual required Read/Edit/Test evidence for the fixture, not merely a confident final paragraph. If the model stops early, status is `INCOMPLETE` with explanation.

**Journal ordering:** persist model acceptance ID and finalized calls **before** any file side effect; persist `tool.started` before executing each tool; persist result/diff immediately after. After a crash, `tool.started` without a result is **uncertain**. Inspect the file hash/Git diff; do not replay an Edit, Bash, or commit automatically. Provider Chat in-flight step after a bridge restart is not recoverable merely because its old `chat_...` revision exists. A known completed step can be continued only when history and tool correlations are intact; otherwise `INTERRUPTED`.

This is a small state machine implemented as a function plus journal transitions, **not** a scheduler, broker, DAG engine, event database or queue service.

## 6. One genuine coding turn

The fixture task should be decided by the model rather than hard-coded as a sequence. The **expected shape** is:

~~~mermaid
sequenceDiagram
  participant U as Operator
  participant H as CLcode Controller
  participant P as GPTopus Provider
  participant T as Scoped Tools
  U->>H: Task + one run-level grant (fixture root, Read/Edit/Test, budget)
  H->>H: Journal ADMITTED / baseline hash
  H->>P: create(task + Read/Edit/Bash schemas)
  P-->>H: complete: function_call Read(call-1, file)
  H->>T: Validate grant and execute Read(call-1)
  T-->>H: Actual file content / hash
  H->>H: Journal tool result
  H->>P: continue(call-1 output; same provider conversation)
  P-->>H: complete: function_call Edit(call-2, exact replacement)
  H->>T: Validate grant / old file hash; execute Edit
  T-->>H: Actual change / diff
  H->>P: continue(call-2 output)
  P-->>H: complete: function_call Bash(call-3, approved test)
  H->>T: Validate grant; execute bounded test
  T-->>H: Actual exit code / output
  H->>P: continue(call-3 output)
  P-->>H: Final summary (no calls)
  H->>H: Verify Read, Edit, Test traces + real Git diff
  H-->>U: Final status, test result, diff, usage, any unknowns
~~~

Minimal controller logic (pseudocode; actual `dispatch` response schema is documented in `2):

~~~ts
async function runAgent(admittedRun) {
  const { grant, route } = admittedRun;           // immutable admission grant
  let input = admittedRun.task;
  let previousResponseId;
  for (let turnNo = 0; turnNo < admittedRun.maxModelTurns; turnNo++) {
    assertNotCancelled(); reserveRunAllowance();
    const args = {
      worker_type: route.workerType, model: route.modelId,
      instructions: admittedRun.instructions,  // repeated on all steps
      input, tools: admittedRun.tools,
      max_output_tokens: admittedRun.outputLimit,
      ...(previousResponseId && { previous_response_id: previousResponseId })
    };
    journal("model.submitting", { turnNo, requestHash: digest(args) });
    let turn = await dispatch("create", args);
    turn = await unwrapPages(turn);               // GPTopus page() if needed
    journal("model.accepted", { id: turn.id, status: turn.status });
    while (turn.status === "queued" || turn.status === "in_progress") {
      assertNotCancelled();
      turn = await unwrapPages(await dispatch("poll", {
        id: turn.id, worker_type: route.workerType, wait_ms: 5000
      }));
    }
    if (turn.status !== "completed") return stopWithEvidence(turn.status, turn);
    if (!validCompleteTurn(turn)) return stopWithEvidence("incomplete", turn);
    previousResponseId = turn.id;                 // GPTopus route-bound ID
    journal("model.completed", { id: turn.id, calls: turn.calls, usage: turn.usage });
    if (!turn.calls.length) return verifyAndReport(turn.text);
    const outputs = [];
    for (const call of turn.calls) {
      assertNotCancelled();
      const key = [admittedRun.id, turn.id, call.call_id].join(":");
      const decision = authorizeTool(grant, call); // precisely BEFORE side effect
      journal("tool.proposed", { key, name: call.name });
      const result = decision.allowed
        ? await executeAndJournalOnce(key, call, grant)
        : await recordDenial(key, decision.reason);
      outputs.push({
        type: "function_call_output",
        call_id: call.call_id,
        output: JSON.stringify(result)
      });
    }
    input = outputs;                              // returns ALL real outcomes
  }
  return stopWithEvidence("budget_stop", "Model-turn limit reached");
}
~~~

Real implementation must also pass `worker_type` to cancel, preserve unknown/ambiguous response identities without a blind re-POST, and bound idle/total elapsed time. The loop above is intentionally minimal, **not** a substitute for the guard rules in ``5, 7 and 8.

## 7. Tools, authorization and capability scope

For E06 expose **only** `Read`, `Edit` and `Bash` (the last is **Bash/Test only**). Reuse GPTopus `OPENAI_TOOLS` filtered to those names, and `filterToolArgs` for superficial schema filtering, but implement all actual execution **in CLcode**. No general Write, network browser, package installation, arbitrary Git push or external MCP tool is needed.

| Tool | Required host behavior |
| --- | --- |
| **Read** | Project-relative target resolved against the admitted canonical root; bounded regular-file read (suggest ≤256 KiB), no protected secrets/`.git`, no traversal/symlink/junction/reparse-point escape. Report actual content and digest. |
| **Edit** | Exact-string replacement in an allowed file with one match unless `replace_all` explicitly authorized; first Read/hash evidence; same path hardening; require unchanged expected file digest; atomic write/replace; record before/after digest and Git diff. If mismatch, deny and ask model to reread. |
| **Bash/Test** | For E06 `Bash` accepts **only predefined commands with fixed executable + argv**, e.g. the fixture's known `node --test` invocation, fixed CWD, clean environment, no interactive stdin, short wall deadline, bounded stdout/stderr, kill process tree on cancellation. Do **not** shell-expand model text or forward arbitrary `cmd.exe /c` or PowerShell. |
| **Local Git** | Controller may run read-only `git status --short`, `git diff --check` and `git diff` for evidence. Optional local commit only if specifically in run-level grant; no push, remote writes or branch deletion. |

**Authorization moment, exactly:** (1) operator approves **at admission** an immutable grant: one verified project root, read/write patterns, bounded command IDs, allowed network destinations (none for E06), token/elapsed limits, allowed Git effects; (2) **immediately before each tool call**, controller validates tool name, arguments, resolved path/command, scope, remaining quota, cancellation and expected file state against that grant. **No repetitive user prompt is necessary** for an action contained by the grant; out-of-scope actions are denied with explicit tool result. Model instructions and claimed permissions cannot widen it. New outside-root access, unknown shell programs, network/remote Git or wider permissions require a **new operator grant**, never a guessed exception.

**Actual enforcement caveat:** Node path checks and a command allowlist are **not** a security sandbox for arbitrary repository code. Tests may spawn subprocesses; a raw shell can read credentials or contact the network under the controller's OS account. For the disposable Windows E06 machine, run tools under a **restricted non-owner OS identity** with NTFS ACL-limited workspace, no owner credentials or inherited provider key, and egress restricted by OS policy where applicable. Keep provider keys in the **controller process**, not test subprocess env. If this cannot be arranged for unrestricted Bash, keep Bash limited to a reviewed fixture command and record that broader containment is **unproved**. No VM required for this proof; no claim that physical disposability alone protects secrets. Guard Windows device names, UNC paths, alternate data streams, case aliases, symlinks/junctions, hard links and time-of-check/time-of-use races; `ultra/permissions.mjs` documents useful conservative checks but explicitly states it is **not** an OS sandbox.

## 8. Continuation, errors, cancellation and accounting

**Session ownership:** CLcode owns the canonical task, journal and operator scope. GPTopus/OpenAI own only provider continuation. Persist the exact route/config and previous provider response ID after **each completed model step**. For OpenAI Responses, use `store:true`, `previous_response_id` and renewed instructions. For GPTopus Chat, `previous_response_id` selects a **local conversation revision**, whose stored messages must contain all tool results; never replay the same output twice or cut a call/result group in half. **Do not** switch a run's provider midway by passing a foreign response ID.

**Compaction:** the controller counts **live context pressure**, not just stored file bytes; reserve output-token headroom. For E06, prefer to **stop cleanly** on unknown/near-exhausted context rather than implement compaction. Later, compact only **closed** tool groups into an explicit acknowledged summary with hashes/source links, retain current task, operator constraints and recent tool context, and start a **fresh provider conversation**. Responses opaque reasoning items cannot be reconstituted from summaries; do not claim lossless continuation. Donor `convo.mjs` byte trimming is not token-aware and should never be treated as sufficient for long runs.

**Suggested conservative *fixture* ceilings (configurable, not provider promises):** max 12 model turns, 24 individual tools, 1 active model call per actor, 1 active Bash/Test process, 3 minutes per test, 15 minutes total, bounded per-file/output bytes, and a model-specific output-token cap. Reserve the next model step's worst-case allowance before sending; stop instead of overrunning. Use provider-reported input/output/cached/reasoning tokens when present; report `unknown` when missing, **never fabricated zero**. Track `estimatedUsd` separately from billed cost. NVIDIA Build routes in donor are labelled free and bypass the OpenAI ledger: **do not infer an enforceable free quota or zero economic cost** from that. Actual provider/account limits and current prices need separate verification.

**Partial acceptance / retry table:**

| Failure | Required response |
| --- | --- |
| Local validation/key missing before transport | Definitive not-sent; report error, reservation can be released. |
| Explicit request rejection (e.g. validated 4xx) | Report rejection; only classify as not-accepted when provider evidence establishes it. |
| POST timeout, disconnect, malformed response or possible accepted 5xx | **NEEDS_RECONCILIATION**; keep cost/reservation uncertain. Do **not** POST another generation automatically; reconcile by known ID or operator decision. |
| Known Responses background ID still queued/in progress | Poll/retrieve with bounded deadline. Remote cancel only where supported. |
| Chat SSE stream broken, missing final tool args or truncated output | Do not execute incomplete calls; mark interrupted/incomplete. Chat abort can stop transport locally but not prove upstream accounting reversal. |
| Tool rejected / bad JSON / unauthorized path | Record an explicit failed `ToolResult` for **that** call ID; never execute or silently reinterpret it as success. |
| Process killed mid-Edit/Test / controller restart | Journal incomplete side effect as **unknown**; inspect hashes/process state before any further action. |
| Cancel requested | Stop scheduling tools/model turns immediately; abort Chat stream, cancel Responses background where possible; stop approved test process tree. Report partial on-disk edits; cancellation does not roll back them. |

**Streaming:** normalized text progress, reasoning *indicator* and tool-argument deltas are suitable for UX. Do not expose or depend on unavailable private chain-of-thought. Reasoning summaries are shown only if provider supplies an authorized summary. For the initial proof, asynchronous `poll` is enough; typed Responses SSE and live desktop rendering are separate future work. The current Chat parser's acceptance of an early/empty finish is an explicit adapter-hardening risk, not a reason to build a whole streaming subsystem before E06.

## 9. GPTopus extraction inventory

| Module (relative to `plugins/openai-workers/`) | E02/E06 disposition | Reason |
| --- | --- | --- |
| `bridge/openai.mjs` | **Reuse unchanged** behind adapter for OpenAI route | Existing Responses call/poll/cancel, key profiles and ambiguous-use disposition; no need to rewrite HTTP. Guard its `gpt-*` assumption. |
| `bridge/chat.mjs` | **Reuse unchanged for narrow proof**; later harden/adapt wrapper | Existing NVIDIA/LM Studio wire protocol, streaming accumulation, tool-call normalization, cancellation. Verify finish/args before executing; disable thought-prefill restarts for E06 if possible. |
| `bridge/workers.mjs` | **Reuse current registry unchanged**; CLcode route profile is a wrapper | Real worker/model/effort/key mapping; do not treat `tools:true` as capability proof. New KAT/Qwen routes need **explicit configuration** after a live probe, not unrecorded source rewrites. |
| `bridge/server.mjs` `dispatch` | **Reuse unchanged in trusted controller process** | Unified provider routing and accounting; page large responses. Its raw unauthenticated MCP interface is **not** a CLcode frontend API. |
| `bridge/convo.mjs` | **Reuse for donor Chat storage only** | Revision-aware message persistence; not canonical run journal, not semantic compaction. |
| `bridge/usage.mjs`, `bridge/trace.mjs` | **Reuse unchanged for donor transport** | Existing OpenAI reservation/evidence and redaction. Add small CLcode per-run counters separately. |
| `bridge/rotation.mjs`, `bridge/steer.mjs` | **Leave donor implementation intact; defer integration** | NVIDIA rotation/steering are useful later, but not required for the first loop; steering into a worker does not create one. |
| `hooks/tools.js` | **Reuse tool schemas / validation idea**, implement actual tools anew | Claude Code normally owns execution and permission checks. Use only Read/Edit/Bash subset. |
| `hooks/step.js` | **Adapt concepts only** | Correct `call_id` mapping, but assumes Claude transcript/tools/handback. |
| `ultra/permissions.mjs` | **Reference and optionally extract narrow safe-file primitives after review** | Real path and staged-write safeguards, but no Bash executor and larger ULTRA assumptions; do not wire a new ULTRA broker. |
| `ultra/runtime.mjs`, `ultra/native-controller.mjs`, `ultra/broker.mjs` | **Do not integrate for E06** | Sophisticated orchestration already exists, but its recruitment, stages, policies and agent leases exceed the needed single principal loop. |
| `hooks/register.js`, `hooks/ultra.js`, `bridge/desktop-server.mjs` | **Do not reuse as host runtime** | Depend on Claude Code/Claude Desktop identities, commands, tools, or Chat MCP delegation. |
| `bridge/direct-run.mjs`, `scripts/oai-config.mjs` | **Optional E02/diagnostic reuse; not E06** | Text-only background messages and standalone settings/steer UI, respectively; neither is a desktop coding agent. |

**Reuse mechanics:** prefer a sibling pinned GPTopus checkout and a small CLcode adapter importing `bridge/server.mjs` as Node ESM. Do not vendor a moving code snapshot, edit donor source, install a new SDK stack, publish raw bridge operations on localhost, or invent an independent model registry until the proof justifies it. The donor plugin is [MIT-licensed](https://github.com/techrote/Chlaude-GPTopus/blob/849627463c3e2be660f9d24976320b072c107b34/plugins/openai-workers/LICENSE); preserve notices if later copying substantial code. This is independent of the proprietary Claude Desktop/licensing question.

## 10. E02 → E06 implementation order

**Proposed CLcode-owned files** (names illustrative, **not yet created**): `runtime/provider-gptopus.mjs` (thin `dispatch` adapter), `runtime/agent-loop.mjs` (loop), `runtime/tools.mjs` (three tools), `runtime/scope.mjs` (admission and per-call checks), `runtime/journal.mjs` (small JSONL ledger), plus **one** manually invoked E06 fixture script. No database, UI framework, standing daemon, CI matrix or orchestration package.

1. **Pin and run E02.** Clone/check out donor at `8496274` on the disposable PC. Import `dispatch` from its `bridge/server.mjs` using Node; resolve an existing `workerSettings(workerType)`; run one genuine `dispatch('create', {worker_type, model, instructions, input, tools: []})`; poll if needed, unpack pages, record provider/model/status/usage and the absence of a Claude process. Use a configured existing OpenAI or NVIDIA/LM Studio route with real credentials only on the development machine. Do not reuse `/oai:run` as the entire runtime.
2. **Prove native function-call correlation with no file writes.** Present a single harmless `Read` tool manifest and ask a tool-capable model to inspect the fixture. Capture **actual** `call_id`, parsed args and file result; continue once using `function_call_output` and the **same route's** previous response ID. This is the narrow hinge between E02 and E06.
3. **Add one controller-owned grant + journal.** Approve the fixture root and Read/Edit/fixed Test at run creation; snapshot Git baseline; implement read restrictions, exact-string edit with hash guard, test `execFile` with fixed argv, per-call check, explicit denial and cancellation. No arbitrary shell, no remote Git.
4. **Close the E06 loop.** Use the pseudocode in `6`, cap turns/tools/output and record all requests/responses/results. Let the model choose Read, Edit and Test. Verify real file diff, actual test exit status and final explanation. Optional local Git commit only after successful diff/test and an explicit grant; it is not a remote push.
5. **Record evidence; then stop.** In `EXPERIMENTS.md` **when implementation is separately authorized**, append reproducible E02/E06 entries containing pinned SHAs, model/endpoint (without keys), OS/Node, commands, run IDs, sanitized trace, diff and exit code, usage and honest failure states. **This prepass does not modify that file.** The subsequent E07/E08 desktop integration reuses the same loop; headless E06 alone is not `CLCODE-BOOT-001`.

## 11. Failure modes and five acceptance checks

Most likely first-loop defeats, in priority order:

| Failure | Visible symptom | Minimal remedy |
| --- | --- | --- |
| Local or NVIDIA model cannot emit valid callable tools | Model writes `{"tool":...}` as prose, malformed args, no call IDs | Switch to a known tool-capable model/template; one live capability probe. **Do not execute prose as a command.** |
| Response is incomplete but contains a partial call | JSON parse succeeds by accident or output has no terminal finish | Require finalized provider result and complete parsed args; fail closed on truncation. |
| Chat tool results not paired or replayed twice | Repeated Read/Edit or synthetic missing-result message | Journal `(run,response,call)`, return each result once, preserve local chat revision. |
| Responses continuation lost or instructions omitted | Next turn forgets task/tools or fails to resume reasoning | Persist response ID, reuse same model route, resend top-level instructions, preserve native state. |
| Bridge crash / provider POST accepted but caller has no ID | Another attempt charges twice or runs an Edit twice | Mark `NEEDS_RECONCILIATION`; never blind POST/re-execute. |
| Unsafe tool implementation | Read escapes fixture; Bash sees credentials/network | Immutable operator grant, canonical path checks, separate restricted OS identity, fixed Test command. |
| Tool timeout/cancel leaves subprocess or partial file | Controller says cancelled but child process persists | Kill process tree, journal uncertain effects, inspect Git/hashes before continuation. |
| Missing usage or unknown model limits | False `$0`/`0 tokens` or context overflow | Unknown accounting, configurable ceilings, stop-before-overrun; do not guess token capacity. |
| GPTopus worker route silently substitutes model | Tool behavior or price unexpectedly changes | Pin model/route at admission; if substitution is observed, report and stop unless specifically approved. |

**Exactly five meaningful acceptance checks; run locally, no permanent CI:**

1. **E02 real provider, Claude absent:** a fresh controller process issues/receives one real non-Claude request; captures route, exact model, response ID, status, usage provenance and sanitized network/process evidence. **A mock or Claude-issued `/oai:run` is not enough.**
2. **E06 actual tool chain:** a real model chooses **Read → Edit → Bash(Test)** in a throwaway Git fixture, continues through matching call IDs, finishes with an actual diff and passing test. No scripted edits, mocked calls or just a proposed patch.
3. **Negative scope check:** out-of-root Read/Edit, credential path, unapproved command and remote/network attempt are denied at host boundary while an allowed fixture Read/Test still works; record the limits of OS-level isolation explicitly.
4. **Interruption/ambiguity check:** cancel during model or Test, and force one unconfirmed request/side-effect state; controller stops new calls, records partial state and **does not automatically retry** an uncertain mutation or possibly accepted POST.
5. **Trace + budget check:** for one full run, every proposed call has one recorded disposition/result, the diff and test output match disk reality, token/cost values have honest provenance, and a reached turn/tool/time cap halts without spawning new work.

**Exit criterion for PREPASS-03:** Codex has a concrete, narrow host/provider/tool boundary and can implement E02/E06 with GPTopus's pinned capabilities. **This document is a specification, not an E02 or E06 test result.** No Desktop/Claude binary, donor source, other prepass document or application file is modified.

## 12. Authoritative external references

- [OpenAI function calling][openai-tools] — exact function-call/item and `call_id` semantics, multiple calls, return formats.
- [OpenAI Responses creation and fields][openai-responses] — `input`, `instructions`, `previous_response_id`, output items and budgets.
- [OpenAI Responses streaming events][openai-stream] — typed text/tool-call deltas and finalization.
- [OpenAI conversation state][openai-state] — replay vs server-side response continuation; non-inherited top-level instructions; context.
- [OpenAI reasoning][openai-reasoning] — preserve ordered reasoning items, including encrypted content for stateless requests.
- [OpenAI background and cancellation][openai-background] — background polling, continuation and cancellation behavior.
- [OpenAI Chat Completions API][openai-chat] and [Chat streaming events][chat-stream] — Chat tool messages, streaming fragments, finish reasons and optional usage.
- [NVIDIA hosted NIM API][nvidia-hosted] — hosted `integrate.api.nvidia.com/v1/chat/completions` (distinct from self-hosted NIM).
- [NVIDIA self-hosted NIM API][nim-api] and [tool-calling prerequisites][nim-tools] — additional endpoints and model/parser dependencies; not proof of hosted-feature parity.
- [LM Studio Chat tool use][lm-tools], [Responses compatibility][lm-responses] and [API overview][lm-api] — parser/template caveat, local responses support and stateful vs stateless comparison.

[openai-tools]: https://developers.openai.com/api/docs/guides/function-calling
[openai-responses]: https://developers.openai.com/api/reference/resources/responses/methods/create
[openai-stream]: https://developers.openai.com/api/reference/resources/responses/streaming-events
[openai-state]: https://developers.openai.com/api/docs/guides/conversation-state
[openai-reasoning]: https://developers.openai.com/api/docs/guides/reasoning
[openai-background]: https://developers.openai.com/api/docs/guides/background
[openai-chat]: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
[chat-stream]: https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events
[nvidia-hosted]: https://docs.api.nvidia.com/nim/reference/llm-apis
[nim-api]: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
[nim-tools]: https://docs.nvidia.com/nim/large-language-models/2.0.13/advanced-use-cases/tool-calling-and-mcp.html
[lm-tools]: https://lmstudio.ai/docs/developer/openai-compat/tools
[lm-responses]: https://lmstudio.ai/docs/developer/openai-compat/responses
[lm-api]: https://lmstudio.ai/docs/developer/rest
