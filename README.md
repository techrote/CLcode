# CLcode

**Desktop-first, model-independent agentic development environment.**

CLcode is an exploratory project to preserve and improve the useful *Claude Desktop Code* experience while replacing dependency on Claude/Anthropic inference with independently selected models and a provider-neutral agent runtime.

**Product target: a desktop application, not the Claude Code CLI.** The CLI may be inspected as an internal dependency or implementation reference; it is not the deliverable.

## Project decisions

- **Start with GitHub + a physically disposable Windows development PC.** It presently has no Claude Code installation. No VM programme until feasibility is demonstrated. This machine is the destructive research boundary: the Desktop Code specimen may be modified, broken, reinstalled or replaced as needed.
- **Reuse, where feasible, the provider/worker infrastructure already developed in [Chlaude-GPTopus](https://github.com/techrote/Chlaude-GPTopus).** Keep GPTopus independently usable; do not transplant its changing branches without pinning a tested revision.
- **Expect deep Desktop Code modification.** CLcode is not limited to supported extension seams: replacing Claude as the principal/"CEO" model, removing Anthropic account/quota/service coupling, and stripping workflow restrictions may require invasive changes to a pinned Desktop Code specimen. The product target remains the desktop app, not the CLI.
- **Explore an independent web control plane.** GPTopus already offers local configuration and steering of existing workers. Starting new runs, orchestrating fleets, and continuing work while a Claude quota is exhausted are hypotheses requiring direct tests, not established capabilities.
- **Use other providers' own credentials and entitlements.** The goal is independence from Anthropic inference, not evasion of Anthropic billing, licensing, or access rules.
- **Preserve external safety boundaries.** Disposable hardware does not make GitHub credentials, model API keys, or external side effects disposable.
- **Prove viability before designing a new harness, adding a CI matrix, or building VM infrastructure.**

## First milestone

**CLCODE-BOOT-001 — prove a non-Claude-powered desktop coding workflow on the disposable PC.**

Success means a user can operate a desktop Code workspace, initiate an agent task through a non-Claude principal model, run a real Read → Edit → Test cycle on a fixture repository, inspect the result, and complete it with **zero Anthropic inference calls**. Ordinary coding work must not depend on an active Claude session, its five-hour quota, or the existence of a Claude Code CLI installation.

A standalone GPTopus configuration or chat interface is an important preliminary experiment, **not** sufficient completion of this milestone.

## Hostless runtime prototype

**HOSTLESS-RUN-001 is implemented on this branch as a Draft engineering slice.** It adds a CLcode-owned principal-agent loop, scoped Read/Edit/Test/local-Git tools, durable run events, hard steering/cancellation, and a stdio JSONL service intended as the Desktop/backend seam. Provider requests are routed through an **exactly pinned GPTopus donor checkout** rather than a second provider stack.

Local mechanical verification: **8/8 Node tests pass**, including real filesystem/process/Git effects and cancellation of an active test subprocess. This is **not** a live-provider acceptance claim: E02 and E06 remain NOT RUN until executed with an authorized non-Claude provider on the disposable PC.

See **[HOSTLESS-RUN-001](docs/HOSTLESS-RUN-001.md)** for the implementation boundary and first live Windows procedure.

## Desktop integration seam

**DESKTOP-CLIENT-001** adds a tested process client, run follower and provider-neutral UI projection over the hostless runtime. The desktop/specimen layer can now consume run/model/tool/steering state without importing GPTopus or receiving provider credentials. Local stacked verification is **17/17 tests passing**; graphical Desktop acceptance remains unrun.

See **[DESKTOP-CLIENT-001](docs/DESKTOP-CLIENT-001.md)**.

## Planning documents

- **[Implementation roadmap — START HERE](docs/ROADMAP.md)** — two parallel tracks, the first coding assignment, real acceptance gates, and stop conditions.
- **[Project plan and acceptance criteria](docs/PLAN.md)** — architecture, boundaries, work phases, experiments, decision gates, risks, and deferred work.
- **[Experiments and evidence log](docs/EXPERIMENTS.md)** — experiments to run and a template for recording reproducible results.

## Current status

**Planning baseline only.** No desktop implementation, independently operating worker-fleet controller, or quota-independent Claude-host command path has yet been demonstrated by CLcode.

No build pipeline, third-party executable, proprietary program code, or secrets are committed at this stage.
