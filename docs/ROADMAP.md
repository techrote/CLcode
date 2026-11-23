# CLcode — initial implementation roadmap

**Purpose:** give the first coding agent an executable order of work, not another multi-month architecture exercise.  
**Status:** initial guide; acceptance evidence is tracked separately in [EXPERIMENTS.md](EXPERIMENTS.md).  
**Long-form specification:** [PLAN.md](PLAN.md).  
**Product:** an independently operated **desktop Code application**, not a Claude Code CLI replacement.

## 1. Mission and constraints

CLcode should eventually offer the useful **Claude Desktop Code** workflows—projects, sessions, editing, diffs, terminals/tests, model selection, subagents and operator steering—but with a non-Claude principal model and independently owned agent lifecycle. The disposable-PC Desktop Code specimen is a research substrate and may be modified invasively, including replacement of Claude as the principal orchestrator and removal of Anthropic-specific account, quota, service and workflow coupling.

First development environment: **GitHub plus a separate, disposable Windows PC**, initially without Claude Code installed. Do not build VM infrastructure now. Do not assume the cloud coding-agent environment has GUI access to that PC.

**Do not confuse these outcomes:**

- GPTopus configuration page running = **control-panel proof**, not an independent coding agent.
- A non-Claude model answering a prompt = **provider proof**, not a tool-executing agent.
- A standalone agent editing files = **agent-runtime proof**, not a desktop product.
- A Claude Desktop Code session using a configured gateway = valuable **desktop-host feasibility evidence**, but not by itself an independently distributable CLcode application.
- **CLCODE-BOOT-001** only passes when an independently launched desktop Code workflow runs a real, non-Claude-driven Read → Edit → Test cycle, showing project/session, tool results and diffs, with no Anthropic inference dependency.

Avoid expanding CI, building test frameworks, provisioning VMs, reconstructing every Claude feature, or rewriting GPTopus before an actual proof demands it. Deep modification of the pinned Desktop Code specimen is explicitly in scope once reconnaissance identifies the seams that must change; avoid only premature, unstructured patch accumulation. Use small targeted tests; preserve honest evidence.

## 2. Newly identified, high-value technical seams

### A. GPTopus can already operate as a separate local web control process

Pinned research reference for the first experiments:

- **Repo:** [techrote/Chlaude-GPTopus](https://github.com/techrote/Chlaude-GPTopus)
- **Reference commit:** [`849627463c3e2be660f9d24976320b072c107b34`](https://github.com/techrote/Chlaude-GPTopus/commit/849627463c3e2be660f9d24976320b072c107b34), the observed `ultra/004-integration` / PR #6 HEAD when this roadmap was written; do not silently substitute moving branch tips.
- **Config entry point:** `plugins/openai-workers/scripts/oai-config.mjs`.
- **Controller building blocks:** `plugins/openai-workers/bridge/steer.mjs`, `bridge/convo.mjs`, `hooks/register.js`, and provider/request/usage modules.
- **Direct requests:** the host-registered `/oai:run` command invokes a bridge run operation; inspect the real run path before extracting it.
- **Steering:** `/oai:s` and the web console steer **existing running workers**. They are not yet evidence that the web interface can create and independently host new workers.

First priority: determine which functions can be reused **with no Claude process at all**. A standalone HTTP server is already a plausible foothold; independent worker lifecycle must be established experimentally.

### B. Desktop's gateway seam is real—but **Claude-only officially**

**Correction to the initial research hypothesis (November 2026):** "third-party inference" in Anthropic's documentation does **not** mean the Desktop Code harness is an officially model-agnostic agent runtime.

- The [deployment comparison](https://code.claude.com/docs/en/third-party-integrations) lists corporate/cloud services (Anthropic, AWS, Google Cloud, Microsoft), but they are predominantly **alternative places to host or pay for Claude inference**, not an assortment of independent model families.
- The [gateway overview](https://code.claude.com/docs/en/gateways) explicitly says Anthropic **does not support routing Claude Code to non-Claude models through any gateway**. Anthropic's built-in gateway routes to named Anthropic/Claude-serving cloud services.
- The [Desktop 3P gateway guide](https://claude.com/docs/third-party/claude-desktop/gateway) explicitly describes **Claude models** served through a self-hosted gateway (which may be LiteLLM, Portkey or an in-house proxy). Its endpoint expects the Anthropic Messages API: `POST /v1/messages` including streaming and tool use; `GET /v1/models` is optional.
- Desktop's gateway model auto-discovery **only shows recognizably Claude model IDs**. Explicit `inferenceModels` entries allow routing aliases and unrecognized IDs, but do **not** establish that Qwen/GPT/KAT are supported as the principal model or that their tool calls, streaming, thinking and compaction will work.
- Desktop has its **own embedded Claude Code engine** and reads its **own third-party inference configuration**, not simply the CLI `ANTHROPIC_BASE_URL` setting. On supported builds the UI path is Help → Troubleshooting → Enable Developer Mode, then Developer → Configure Third-Party Inference.
- The [legal/compliance documentation](https://code.claude.com/docs/en/legal-and-compliance) expressly limits modification and product redistribution of the Claude Code binary. Any adaptation of a proprietary Desktop/engine specimen is **research pending license review**, not a freely publishable CLcode foundation.

**Decision:** study the Desktop Code shell and embedded-engine interfaces early, but **do not treat vendor-provided gateway support as a model-replacement solution**. The preferred CLcode path is specimen-first: pin a Desktop Code build on the disposable PC, instrument it, and modify it as deeply as required to replace the Claude principal model and Anthropic-specific runtime dependencies while retaining useful desktop behavior. An independent shell remains a fallback if a component cannot be transplanted sustainably or lawfully. An Anthropic-compatible Qwen/GPT gateway is an optional compatibility probe, not the architecture.

Commercial SaaS-provider enrollment is not assumed to be required for CLcode. Keep research observations separate from approved functionality and completed acceptance tests.

## 3. Two work tracks, one narrow convergence goal

| Order | Track A — independent GPTopus backend | Track B — desktop/host reconnaissance |
| --- | --- | --- |
| 0 | Pin the known GPTopus commit, map imports and launch prerequisites | List valuable Desktop Code behaviors and inspect the embedded-engine/UI architecture; document actual support and license boundaries |
| 1 | Run `oai-config.mjs` without Claude installed; persist a harmless configuration change (**E01**) | Pin and instrument a Desktop Code specimen; map shell, embedded engine, model-control, auth/quota and tool-execution boundaries |
| 2 | Invoke a **live non-Claude model request outside host hooks** (**E02**) | Begin bounded specimen surgery to route the principal model through the independent provider/runtime path; use gateway probing only if it answers a specific seam question |
| 3 | Own one new worker's spawn/status/steer/cancel lifecycle outside Claude (**E03–E04**) | Remove or replace Anthropic-only control dependencies needed for the specimen to reach and sustain a non-Claude principal agent loop |
| 4 | Add one bounded real Read → Edit → Test loop in a fixture Git repo (**E06**) | Prove a sustainable, legally maintainable desktop UI/engine integration strategy |
| 5 | Integrate only the *proved* loop into a graphical CLcode Code workspace | **E07–E08**, desktop plus no Anthropic inference, then owner GO/HOLD/STOP |

Do **not** create two competing provider layers: CLcode owns the desktop/operator experience; reuse GPTopus as provider/control-plane source behind an interface wherever viable. The eventual run controller must be able to spawn, steer, inspect and cancel workers without asking Claude to start them.

### Minimal control contract (only when needed)

Keep the first independent controller deliberately small:

```text
spawn({ model, task, projectScope, budget }) -> runId
status(runId)                            -> state + progress + usage
steer({ runId, text })                   -> accepted / rejected
cancel(runId)                            -> terminal or pending state
listRuns()                               -> active / recent runs
```

Each action must actually apply to a **controller-owned** run. A steer queue with no living consumer is not a running agent. Persistence/recovery can be added incrementally after the first real call; do not promise resumability by inventing a status value.

### First coding assignment: the smallest useful checkpoint

The next implementer should **do real work**, not simply produce another architecture memo:

1. Pin and inspect the GPTopus reference commit; identify what is directly executable versus what depends on Claude native hooks. Record a short dependency map with actual function/file names.
2. Get the standalone web configuration process working in the available environment, or supply a reproducible Windows launch path if no disposable-PC access exists. Do not claim interactive acceptance without a real UI run.
3. Attempt the smallest honest **host-independent provider call**, reusing an existing GPTopus client. If it cannot run, record the exact blocker and a minimal adapter plan; do not rewrite the entire client.
4. In parallel, document the Desktop Code / embedded-engine boundary and the **Claude-only official gateway support**, then use the disposable-PC specimen for targeted instrumentation and modification. Treat a foreign-model gateway probe as optional evidence; the preferred architecture is direct replacement of Claude's principal-control path where necessary, not preservation of the vendor's supported model boundary.
5. Commit a focused working slice plus a short evidence entry. Prefer one cohesive change set rather than a fleet of scaffolding PRs.

**First checkpoint output:** either (a) verifiable E01 and, ideally, E02 results plus a desktop feasibility map, or (b) source-grounded blockers and a runnable, narrowly scoped experiment. Include exact SHAs and actual commands; label anything not tested. Then move directly to independent worker spawn.

## 4. Gates and stop conditions

| Gate | Required evidence | Not sufficient |
| --- | --- | --- |
| **G0: Source pinned** | Exact GPTopus SHA, import/host-dependency map, disposable-PC requirements | A link to a moving branch |
| **G1: Hostless panel** | E01 live process, UI, persistence and localhost access control | Source inspection or mocked HTTP handlers |
| **G2: Hostless inference** | E02 real provider request with no Claude Code process | `/oai:run` called inside Claude Code |
| **G3: Hostless agent** | E03/E04 independently spawned, controllable worker; then E06 tool loop | Steering a Claude-owned subagent |
| **G4: Desktop viable** | E07 interactive CLcode Code UX plus E08 observed zero Anthropic model calls | Web settings page or terminal-only demo |

**Stop and report before proceeding** if a step requires unapproved credentials, distribution of proprietary Anthropic code, destructive external Git operations, an unbounded remote-worker deployment, or a new standing CI/VM programme. Local research modification of the disposable-PC specimen is allowed; if redistribution rights are unclear, keep proprietary artifacts out of the public repository and replace only the affected distributable component.

The goal is **less friction inside a scoped development environment**, not unrestricted access to secrets or third-party systems. A disposable disk does not make credentials and external side effects disposable.

## 5. Handoff and record discipline

The long-form [PLAN.md](PLAN.md) is the project's **requirements and architecture reference**; **this roadmap is the implementation order**; [EXPERIMENTS.md](EXPERIMENTS.md) records actual results and negative findings.

Each completed work slice should leave: exact commit and tested environment; commands/run steps; observed behavior; real vs mock distinction; failures; minimal next step; and a compact note on any new architectural dependency discovered. Do not substitute "CI green" for desktop evidence.

**User-facing decision required only at the Desktop viability gate** if the specimen-first transplant becomes technically or legally unsustainable and a materially different independent-shell path would be required. Until then, continue with the pinned disposable-PC specimen.
