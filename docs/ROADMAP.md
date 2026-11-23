# CLcode — initial implementation roadmap

**Purpose:** give the first coding agent an executable order of work, not another multi-month architecture exercise.  
**Status:** initial guide; acceptance evidence is tracked separately in [EXPERIMENTS.md](EXPERIMENTS.md).  
**Long-form specification:** [PLAN.md](PLAN.md).  
**Product:** an independently operated **desktop Code application**, not a Claude Code CLI replacement.

## 1. Mission and constraints

CLcode should eventually offer the useful **Claude Desktop Code** workflows—projects, sessions, editing, diffs, terminals/tests, model selection, subagents and operator steering—but with a non-Claude principal model and independently owned agent lifecycle. Keep the owner's stock Claude installation and configuration entirely untouched.

First development environment: **GitHub plus a separate, disposable Windows PC**, initially without Claude Code installed. Do not build VM infrastructure now. Do not assume the cloud coding-agent environment has GUI access to that PC.

**Do not confuse these outcomes:**

- GPTopus configuration page running = **control-panel proof**, not an independent coding agent.
- A non-Claude model answering a prompt = **provider proof**, not a tool-executing agent.
- A standalone agent editing files = **agent-runtime proof**, not a desktop product.
- A Claude Desktop Code session using a configured gateway = valuable **desktop-host feasibility evidence**, but not by itself an independently distributable CLcode application.
- **CLCODE-BOOT-001** only passes when an independently launched desktop Code workflow runs a real, non-Claude-driven Read → Edit → Test cycle, showing project/session, tool results and diffs, with no Anthropic inference dependency.

Avoid expanding CI, building test frameworks, provisioning VMs, reconstructing every Claude feature, rewriting GPTopus, or creating an elaborate proprietary-binary patch stack before an actual proof demands it. Use small targeted tests; preserve honest evidence.

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

### B. Desktop has a distinct control/configuration path—and an embedded engine

Official documentation reports:

- Desktop Code uses its **own copy of the Claude Code engine**, updated with Desktop; its version need not equal a separately installed CLI version.
- The **Desktop app reads gateway configuration from its third-party inference configuration**, not merely `ANTHROPIC_BASE_URL` or CLI settings.
- On supported Desktop builds, the in-app path is **Help → Troubleshooting → Enable Developer Mode**, then **Developer → Configure Third-Party Inference**.
- A configured gateway must implement the Anthropic Messages API, particularly **`POST /v1/messages` streaming and tool use**; `GET /v1/models` is optional.

Primary documentation:

- [Desktop application](https://code.claude.com/docs/en/desktop)
- [Connect Claude Code to an LLM gateway — Desktop section](https://code.claude.com/docs/en/llm-gateway-connect#desktop-app)
- [Deploy Claude Desktop on 3P with an LLM gateway](https://claude.com/docs/third-party/claude-desktop/gateway)

**Important limitation:** these docs describe a supported *gateway connection*, generally serving Claude models. They do **not** prove that arbitrary non-Claude models behave correctly, that the Desktop can be redistributed or modified, or that its entire agent lifecycle can operate without Anthropic services. Test each claim separately. Do not rely on a proprietary vendor's entitlements or quota behavior as CLcode's architecture.

This means **Desktop feasibility must be investigated early, in parallel with GPTopus controller work**, rather than waiting for a large custom runtime to be built.

## 3. Two work tracks, one narrow convergence goal

| Order | Track A — independent GPTopus backend | Track B — desktop/host reconnaissance |
| --- | --- | --- |
| 0 | Pin the known GPTopus commit, map imports and launch prerequisites | List the specific Desktop Code features worth preserving and record official architecture/gateway seams |
| 1 | Run `oai-config.mjs` without Claude installed; persist a harmless configuration change (**E01**) | Document how Desktop's embedded Code engine differs from the standalone CLI and where the principal-model boundary is |
| 2 | Invoke a **live non-Claude model request outside host hooks** (**E02**) | On the disposable PC **only, when available and appropriate**, pin and inspect one Desktop specimen and test its documented gateway configuration |
| 3 | Own one new worker's spawn/status/steer/cancel lifecycle outside Claude (**E03–E04**) | Determine whether a non-Claude model can handle genuine streamed tool use through the desktop gateway; record unsupported behavior precisely |
| 4 | Add one bounded real Read → Edit → Test loop in a fixture Git repo (**E06**) | Prove or reject an independent, legally maintainable desktop UX/engine integration strategy |
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
4. In parallel, document the Desktop Code / embedded-engine / third-party-gateway seam from the official docs, then propose the smallest **disposable-PC** Desktop experiment. Do not install or change anything on the owner's main PC.
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

**Stop and report before proceeding** if a step requires unapproved credentials, distribution of proprietary Anthropic code, changes to stock Claude, destructive external Git operations, an unbounded remote-worker deployment, or a new standing CI/VM programme. Prefer a legal, independent replacement for a proprietary component if modification/distribution rights are unclear.

The goal is **less friction inside a scoped development environment**, not unrestricted access to secrets or third-party systems. A disposable disk does not make credentials and external side effects disposable.

## 5. Handoff and record discipline

The long-form [PLAN.md](PLAN.md) is the project's **requirements and architecture reference**; **this roadmap is the implementation order**; [EXPERIMENTS.md](EXPERIMENTS.md) records actual results and negative findings.

Each completed work slice should leave: exact commit and tested environment; commands/run steps; observed behavior; real vs mock distinction; failures; minimal next step; and a compact note on any new architectural dependency discovered. Do not substitute "CI green" for desktop evidence.

**User-facing decision required only at the Desktop viability gate** if there are multiple materially different paths (adapting an independent supported interface versus a new CLcode desktop shell). Preserve the stock product regardless of which approach wins.
