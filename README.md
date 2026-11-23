# CLcode

**Desktop-first, model-independent agentic development environment.**

CLcode is an exploratory project to preserve and improve the useful *Claude Desktop Code* experience while replacing dependency on Claude/Anthropic inference with independently selected models and a provider-neutral agent runtime.

**Product target: a desktop application, not the Claude Code CLI.** The CLI may be inspected as an internal dependency or implementation reference; it is not the deliverable.

## Project decisions

- **Leave stock Claude and stock Claude Desktop untouched.** CLcode is a separate project and application. Do not alter the owner's working installation.
- **Start with GitHub + a physically disposable Windows development PC.** It presently has no Claude Code installation. No VM programme until feasibility is demonstrated.
- **Reuse, where feasible, the provider/worker infrastructure already developed in [Chlaude-GPTopus](https://github.com/techrote/Chlaude-GPTopus).** Keep GPTopus independently usable; do not transplant its changing branches without pinning a tested revision.
- **Explore an independent web control plane.** GPTopus already offers local configuration and steering of existing workers. Starting new runs, orchestrating fleets, and continuing work while a Claude quota is exhausted are hypotheses requiring direct tests, not established capabilities.
- **Use other providers' own credentials and entitlements.** The goal is independence from Anthropic inference, not evasion of Anthropic billing, licensing, or access rules.
- **Preserve external safety boundaries.** Disposable hardware does not make GitHub credentials, model API keys, or external side effects disposable.
- **Prove viability before designing a new harness, adding a CI matrix, or building VM infrastructure.**

## First milestone

**CLCODE-BOOT-001 — prove a non-Claude-powered desktop coding workflow on the disposable PC.**

Success means a user can operate a desktop Code workspace, initiate an agent task through a non-Claude principal model, run a real Read → Edit → Test cycle on a fixture repository, inspect the result, and complete it with **zero Anthropic inference calls**. Ordinary coding work must not depend on an active Claude session, its five-hour quota, or the existence of a Claude Code CLI installation.

A standalone GPTopus configuration or chat interface is an important preliminary experiment, **not** sufficient completion of this milestone.

## Planning documents

- **[Implementation roadmap — START HERE](docs/ROADMAP.md)** — two parallel tracks, the first coding assignment, real acceptance gates, and stop conditions.
- **[Project plan and acceptance criteria](docs/PLAN.md)** — architecture, boundaries, work phases, experiments, decision gates, risks, and deferred work.
- **[Experiments and evidence log](docs/EXPERIMENTS.md)** — experiments to run and a template for recording reproducible results.

## Current status

**Planning baseline only.** No desktop implementation, independently operating worker-fleet controller, or quota-independent Claude-host command path has yet been demonstrated by CLcode.

No build pipeline, third-party executable, proprietary program code, or secrets are committed at this stage.
