# CLcode — desktop-first engineering plan

**Status:** planning baseline; no implementation or acceptance claim.  
**Primary repository:** https://github.com/techrote/CLcode  
**Related project:** https://github.com/techrote/Chlaude-GPTopus  
**Initial execution environment:** separate disposable Windows development PC + GitHub.  
**Target product:** CLcode **desktop application**, modeled on the productive aspects of the *Claude Desktop Code* experience, with independent model inference and agent execution.

> **Non-negotiable distinction:** the existing stock Claude Desktop installation remains untouched. CLcode does not aim to ship a modified Claude Code CLI. A CLI or local service may exist as an implementation detail, but the product to evaluate and ultimately use is the graphical desktop Code workspace.

## Contents

1. [Vision and boundaries](#1-vision-and-boundaries) — what CLcode should become, what it must not disturb, and what is explicitly out of scope.
2. [What already exists and what remains unproved](#2-what-already-exists-and-what-remains-unproved) — GPTopus control paths, direct runs, independent panel and quota assumptions.
3. [Target architecture](#3-target-architecture) — desktop shell, agent runtime, provider routing, control plane and host capability boundaries.
4. [Development strategy](#4-development-strategy) — GitHub/disposable-PC sequence, provenance, legal constraints and restraint on infrastructure.
5. [Milestones and release gates](#5-milestones-and-release-gates) — progressive proofs culminating in an actual desktop agentic coding loop.
6. [Acceptance experiments](#6-acceptance-experiments) — concrete pass/fail tests with no fabricated evidence.
7. [Risk register and design decisions](#7-risk-register-and-design-decisions) — high-consequence technical, security, licensing and maintenance risks.
8. [Deferred work](#8-deferred-work) — ideas intentionally excluded until viability is established.
9. [Immediate next actions](#9-immediate-next-actions) — minimal sequence for beginning work without building infrastructure first.

---

## 1. Vision and boundaries

### Product thesis

Build **CLcode**, an independently controllable **desktop agentic development application** with the strongest useful affordances of Claude Desktop's Code workspace: responsive project/session navigation, rich tool execution and output, diffs, file editing, context management, skills, hooks, multi-agent coordination, status inspection and an ergonomic operator interface.

The principal reasoning model must be selectable from multiple non-Claude providers. Agent execution must not require an active Claude session, Anthropic usage allowance, Anthropic model credentials or an installed Claude Code CLI.

GPTopus should provide or inspire the model/provider and agent control plane, not become an inseparable fork of CLcode.

### Invariants

- **Do not modify stock Claude Desktop or its local data.** Its installation and configuration remain a known-good reference.
- **Desktop is the product.** Do not silently redefine success as a shell command, web configuration page, or headless orchestration demo.
- **Start on physically disposable Windows hardware.** The owner will use a separate PC with no valuable disk state; no VM setup now.
- **Keep GPTopus separately maintainable.** Share interfaces and bounded components; avoid cross-repo code duplication until necessary.
- **No dependency on Anthropic inference for ordinary operation.** Zero Anthropic model requests is part of the final bootstrap acceptance test. This is not a plan to evade Anthropic's account/billing/access controls.
- **Make orchestration operator-driven when desired, autonomous when authorized.** The model need not be the sole initiator of work.
- **Prefer broad freedom inside a narrow externally enforced capability envelope.** Reduce redundant, intrusive permission UX, not the integrity of sandbox, file, credential and remote-write boundaries.
- **Keep progress empirical.** No claims of successful desktop inference replacement, autonomous spawning, quota bypass or vendor-independence until measured.

### Explicit non-goals for the initial research

Rebuilding all Claude Code features; cloning every aspect of its proprietary UI; replacing OpenCode/OhMyPi immediately; introducing a VM/cloud desktop; a new CI matrix; elaborate synthetic fixture corpora; production packaging; distributing proprietary Anthropic binaries; or making private Anthropic service calls without authorization.

## 2. What already exists and what remains unproved

### Observed implementation paths (GPTopus)

The GPTopus source on its `ultra/004-integration` branch contains:

| Existing path | Observed behavior | Independence assessment |
| --- | --- | --- |
| `scripts/oai-config.mjs` | Starts a localhost browser configuration server with per-launch token, configuration store, presets, provider settings, usage, steering and conversation views | Can be launched as a Node program; does not require Claude inference to serve its own UI |
| Web panel steering field | Uses a WebSocket control path and `steer.enqueueTip` to send tips to selected **currently live** worker runs | The web panel's ability to *start* a worker is not demonstrated by this route |
| `/oai:s` | Claude Code `command.run` hook forwards a tip to an already-running worker | May depend on host command dispatch; availability after Claude quota exhaustion is **unknown** |
| `/oai:run` | Claude Code `command.run` hook submits a direct worker request via the GPTopus bridge | Direct model request without Claude reasoning, but still hosted in Claude Code's command pipeline |
| Native worker/ULTRA orchestration | Spawn, native tool execution and orchestration hooks are integrated with Claude Code host APIs | Must be independently hosted or adapted before claiming a hostless worker fleet |

Source references: [GPTopus branch](https://github.com/techrote/Chlaude-GPTopus/tree/ultra/004-integration), [config server](https://github.com/techrote/Chlaude-GPTopus/blob/ultra/004-integration/plugins/openai-workers/scripts/oai-config.mjs), [native command hooks](https://github.com/techrote/Chlaude-GPTopus/blob/ultra/004-integration/plugins/openai-workers/hooks/register.js). The branch is a reference, **not** a frozen production dependency.

### Valuable hypothesis: controller-driven fleet without Claude awake

The current panel already has a **write/control surface** (steer existing runs) rather than being a read-only dashboard. The next proposed extension is to let the panel or a standalone controller **create and own runs** without passing through the Claude Code `command.run` or native subagent lifecycle.

The proposed control flow:

```text
CLcode Desktop UI / GPTopus web control panel
                 |
        controller API / queue
                 |
      standalone run supervisor
        /       |         \
   spawn      steer      cancel/resume
        \       |         /
          model/tool agent loop
                 |
          provider adapters
        OpenAI / NVIDIA / LM Studio / ...
```

This would permit the operator to create tasks, select workers, issue live steering, inspect state and resume/cancel jobs when no Claude model is involved. Whether a current running GPTopus worker can survive its Claude host closing **is not proven**. A controller that only inserts tips into a closed host's queue is insufficient.

The quota experiment is two separate questions:

1. Can a **host-registered slash command** still dispatch after the Claude five-hour inference limit? Unknown; test only under an authentic limit condition.
2. Can an **independent controller** start and complete a task without Claude Code running? This is an engineering goal and can be tested immediately on the disposable PC without waiting for a quota event.

The second is strategically more important. The product should not rely on a loophole in a proprietary host.

## 3. Target architecture

```text
+-----------------------------------------------------+
|                  CLcode DESKTOP                     |
| projects/worktrees, sessions, diffs, editor, tools  |
| user prompts, models, agent tree, logs, live steer  |
+--------------------------+--------------------------+
                           |
                Local typed control API
                           |
+--------------------------v--------------------------+
|                AGENT RUNTIME                        |
| run state / journal / context / compaction          |
| principal model and worker scheduler                |
| tool-call interpreter / retries / interruption      |
| background runs / pause / resume / handoff          |
+-------------+------------------------+--------------+
              |                        |
     Provider router               Host tools
   (GPTopus adapter)          read/edit/bash/git/test
              |                        |
   OpenAI / NVIDIA /             capability boundary
   LM Studio / others             disposable dev PC
```

### Component responsibilities

**Desktop shell (CLcode-owned).** Persistent project and session browsing; chat and agent-control affordances; code diff/editor/file navigation; terminal/test output; persistent model and agent selection; failure visibility; workflows for review and rework. The GPTopus configuration deck is an excellent *control-plane* reference, but is not itself a substitute for the desktop Code product.

**Standalone agent supervisor.** Owns the lifecycle of principal and delegated agents, with typed states (`queued`, `running`, `waiting_for_tool`, `paused`, `completed`, `failed`, `cancelled`), persistent event journal, interruption handling, tool result correlation, cost/tokens, continuation and bounded concurrency. It must remain useful if the GUI restarts or an individual model provider fails.

**Provider router.** A canonical model request/response abstraction with per-provider adapters: model names and capabilities; reasoning effort/tier mapping; streaming; tool-call formatting; context limits; usage accounting; retries and cancellation. GPTopus is the first reuse/reference candidate. No OpenAI-specific assumptions in the desktop shell.

**Tools and permissions.** Real filesystem and process tools under a machine-level allowlist: fixture-repository scope, approved GitHub repository scope, narrowly scoped network providers and time/cost/resource budgets. The intent is fewer redundant internal prompts **within** permitted scope—not bypass of external authorization, credentials or system policy.

**Independent operator plane.** Desktop and web UI can list, spawn, steer, pause, resume, cancel and inspect runs through the same local controller. Steering is not restricted to model-originated messages. Avoid duplicating two incompatible orchestration stacks.

### Reuse assessment: KEEP / ADAPT / REPLACE / INVESTIGATE

| Feature | Intended disposition |
| --- | --- |
| GPTopus provider profiles, quotas, keys and model routing | **ADAPT** through explicit interfaces |
| GPTopus Colourway/settings deck, traces and conversation steering | **KEEP/EXTEND** as an operator control surface |
| Claude Desktop Code UI/workflows | **REFERENCE / REIMPLEMENT or ADAPT** within applicable license and technical constraints |
| Anthropic model invocation and account-based inference dependency | **REPLACE** with independently authorized providers |
| Claude Code native hooks, tools and subagent host API | **INVESTIGATE** and substitute independent equivalents as needed |
| Session/context management, project navigation, permissions, diffs | **PRESERVE BEHAVIOR** where valuable; implement independently if necessary |
| Intrusive repeated confirmations or overbroad provider coupling | **REDESIGN** without removing genuine host boundaries |
| Claude Code CLI interface | **NOT THE PRODUCT**; may be used only for component archaeology |

## 4. Development strategy

### Hardware and GitHub arrangement

Use [this repository](https://github.com/techrote/CLcode) for the CLcode plan, experiments and eventual CLcode-owned source. A separate disposable Windows development PC is the initial execution/GUI test target, initially **without Claude Code installed**. Stock Claude Desktop on the owner's main computer is not to be touched.

Use a small fixture project for early edits. The disposable PC may be reset without losing source, but **credentials are still valuable**: never copy a main account's unbounded tokens or secrets, use narrowly scoped short-lived GitHub credentials when needed, and do not commit local access-token URLs or browser settings dumps.

### Host specimen / code provenance

If inspecting or running a specific Claude Desktop release becomes necessary, pin the exact release/version/hash and record it in the experiment log. Use a separately installed specimen only on the disposable PC. Observe the app's actual Desktop Code dependency structure rather than assuming the desktop is simply the CLI.

Anthropic's application is proprietary. CLcode must distinguish privately evaluated compatibility experiments from source it can lawfully publish, distribute, or incorporate. Favor documented interfaces and independently written replacements. If source reuse or binary modification is not legally or operationally viable, preserve the same user-facing product target and build a clean-room desktop shell. Do not embed a proprietary executable in this public repository by default.

### Engineering discipline

- Start with **no CI workflows** and no build farm.
- Minimal smoke tests tied to actual proofs; no tests for tests, duplicate platforms or permanent CI scaffolding just to establish confidence.
- Preserve a clear record of attempted behaviors, host version, model route, result and observable network/tool traces.
- Maintain clean commits and a reviewable source history; no hidden host mutations.
- Separate **observed fact**, **inference** and **hypothesis** in findings.
- Avoid work in CyberSand, TempToPC, OhMyPi or unrelated repos unless separately requested.

## 5. Milestones and release gates

### M0 — Prepare the research substrate

**Goal:** establish a reproducible workspace without installing or modifying stock Claude.

Deliverables: CLcode plan, a disposable PC with a clean working directory, GitHub clone, temporary fixture repository, Node runtime for GPTopus experiments, documented tool versions and restricted provider test credentials.

**Gate:** reconstruct the environment from documented commands without accessing the owner's main-machine Claude installation. No VM, no workflow matrix.

### M1 — Independent GPTopus configuration/control-panel proof

**Goal:** run the GPTopus web configuration panel without Claude Code installed.

Demonstrate: launch from Node; configure a provider without disclosing secret values; persistence across restart; access-token/origin protection; view state and logs. Freeze an actual GPTopus commit/revision for subsequent experiments.

**Gate:** works without Anthropic credentials or a Claude Code process. This is **not** CLcode's desktop acceptance.

### M2 — Controller-driven worker proof

**Goal:** separate spawn/control from the Claude host.

Prototype the smallest independent run supervisor around existing GPTopus provider capabilities. The panel or a tiny local client should be able to create a worker task, inspect its progress, send a live steering tip, cancel/resume where supported, and collect its output. Preserve structured worker state across controller restart.

**Gate:** an actual provider request completes with Claude Code absent; new runs can be created from the independent control surface. Merely sending a tip to an existing Claude-hosted subagent does **not** pass.

### M3 — Independent agentic tool-loop proof

**Goal:** make a non-Claude principal model operate tools rather than just answer text.

Test one end-to-end task against a fixture Git repository: inspect/read a file, propose/perform an edit, execute a local test, inspect the result and commit to a disposable branch. Record model calls, tools, diffs, token usage, cancellation behavior and any failures. Keep remote GitHub writes optional until local behavior is sound.

**Gate:** real Read → Edit → Test (and local commit) driven by the selected non-Claude model, without Anthropic inference. No scripted fake model responses are accepted as end-to-end proof.

### M4 — CLcode Desktop Code proof (CLCODE-BOOT-001)

**Goal:** demonstrate the workflow **inside an interactive desktop Code workspace**, not just a script or web dashboard.

Evaluate whether a separate pinned desktop specimen can be adapted at a stable seam, or whether an independently implemented desktop shell is the more viable route. Retain project navigation, session state, tool visibility and diffs. Connect the independent runtime and provider router. Compare the ergonomics with stock Claude Desktop on fixture tasks without touching the stock installation.

**Gate:** a user launches CLcode, selects a non-Claude principal model, submits a coding task through the desktop UI, watches genuine tool execution, reviews the diff/test result and completes the task. No Anthropic inference calls and no Claude Code CLI installation/runtime prerequisite. Installation must be independently reproducible on the disposable PC.

### M5 — Viability decision and scope expansion

On evidence from M4, choose one of:

1. **GO — adapt stable desktop interfaces:** compatibility costs and licensing permit sustained development.
2. **GO — clean-room desktop:** preserve useful Desktop UX while building a stand-alone shell over the proved runtime.
3. **HOLD — backend useful, desktop unproved:** retain the GPTopus improvements and revisit UI architecture.
4. **STOP — unacceptable restrictions or economics:** archive experiments without disturbing stock Claude or GPTopus.

Only after a GO decision: increase tool breadth, improve multi-agent orchestration, add package distribution, consider more formal testing and investigate VM-based containment.

## 6. Acceptance experiments

Full recording format is in [EXPERIMENTS.md](EXPERIMENTS.md). Each experiment must distinguish synthetic/mock coverage from live provider and real UI evidence.

| ID | Scenario | Pass condition |
| --- | --- | --- |
| E01 | Start GPTopus config server with no Claude installation | UI works, settings persist, safe local authentication works |
| E02 | Direct provider request from independently launched controller | Real provider responds, no Claude Code process or Anthropic inference |
| E03 | Spawn worker through web/control API | New worker exists and produces output; not merely steering a preexisting host-owned worker |
| E04 | Mid-run steering, cancellation, continuation | Instructions reach the intended run, state transitions are observable and recovery behaves predictably |
| E05 | Controller restart during work | Journal survives; run is recoverable or definitively marked interrupted, not silently lost |
| E06 | Real agentic file/edit/test task on fixture | Tool calls and edits are actual, local tests execute, diff and result inspectable |
| E07 | Desktop Code UI workflow | Same real agent loop fully usable through CLcode desktop UX |
| E08 | Anthropic independence audit | Network and process observations show zero Anthropic inference requests during E07 |
| E09 | Claude-quota hypothesis (optional) | When genuine quota limit occurs, note whether native `/oai:s`/`/oai:run` dispatch; **not** a CLcode acceptance prerequisite |
| E10 | Negative capability test | Attempted out-of-scope file/network/token access denied by external boundary while in-scope tool work continues |

Never infer success from green unit tests, a working configuration panel or a successful one-shot model response. The milestone requires the relevant **real execution**.

## 7. Risk register and design decisions

| Risk | Why it matters | Decision / mitigation |
| --- | --- | --- |
| **Desktop is not separable from proprietary Claude runtime** | May be impossible to transplant legally or sustainably | Prove seams first; maintain clean-room desktop alternative; do not commit Anthropic code |
| **Steering exists but no independent spawn** | A web panel may only influence already-running Claude-hosted workers | M2 requires standalone run creation and ownership |
| **Quota-gate coupling** | Host might refuse slash command dispatch during quota exhaustion | Measure separately; independent CLcode controller must not rely on this |
| **Provider tool semantics differ** | Reasoning, calls, streaming, context and continuation vary | Canonical agent protocol + per-provider adapters; test at least one full tool loop |
| **Host permission prompts are irritating** | Overly intrusive UX interrupts autonomous workflows | Replace with scoped capabilities at outer boundary; retain protection for credentials and remote writes |
| **Desktop/specimen maintenance churn** | Repeated patching of proprietary releases creates long-term cost | Pin specimen; prioritize stable interfaces and owned components |
| **Control panel token leakage** | Local URLs may contain bearer tokens and API keys have monetary value | Bind loopback, protect origin/token, do not commit logs or expose UI externally |
| **GPTopus branch drift** | Unmerged experimental stacks may change underneath CLcode | Pin a tested SHA and track integration contracts explicitly |
| **Infrastructure inflation** | CI/VM work can consume time without proving user value | No CI matrix or VM until after demonstrated desktop viability |
| **Provider billing and quota** | Local controls are not authoritative account billing | Explicit key scopes, budgets, usage reporting and bounded workers |

## 8. Deferred work

**Do not initiate now:** VM containment, cloud desktops, arbitrary remote execution, fleet-scale autonomous software engineering, public release binaries, broad platform matrix, large test corpus, deep theme/palette redesign, a whole new orchestration framework, replacing every Claude Desktop subsystem, or merging unrelated GPTopus PRs.

Potential later directions include: long-lived workstations; very large delegated fleets; live run-tree visualization; model-swappable principals and reviewers; richer persistent sessions; synchronized control across desktop/web; user-defined Colorway-style operator decks; and VM-backed capability profiles.

These are opportunities, not justification to delay the first concrete desktop proof.

## 9. Immediate next actions

1. Keep this plan as the baseline and prepare the disposable PC; **do not install or modify the stock Claude installation** on the main machine.
2. Identify/pin the actual GPTopus revision containing the working config panel, providers, steering and direct-run path. Verify that it can be checked out and launched on the disposable PC without Claude Code.
3. Perform **E01** and record the observable result. No new CI or VM system.
4. Examine which run-creation/orchestration paths still depend on Claude's `command.run`, native tool hooks and session lifecycle. Specify the minimum independent control API; avoid rewriting the working provider client unnecessarily.
5. Implement only enough of the independent supervisor to demonstrate **E02–E04** with one provider.
6. Establish a real Read → Edit → Test loop, then carry that exact loop into the **desktop** prototype.
7. Stop at the M4 gate for an owner assessment of whether CLcode is good enough to develop into the intended replacement for OhMyPi/OpenCode.

**First real success is not “Claude might be bypassable.” It is “an independently launched desktop coding application can productively use non-Claude models without asking Claude to participate.”**
