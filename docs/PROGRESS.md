# CLcode — current implementation status

**Recorded:** 2026-11-23  
**Main baseline:** `48510bf25bad1aa0d429e3b90fdad507f289189e`

This file records the current engineering state and evidence boundaries. It is not a substitute for [EXPERIMENTS.md](EXPERIMENTS.md): acceptance gates remain authoritative there.

## Current working stack

| PR | Branch / HEAD | Role | Current evidence |
| --- | --- | --- | --- |
| #3 — SPECIMEN-LAB-001 | `specimen/001-windows-lab` / `2210b6494e33063c3373c06167f23d6d05d8f859` | Windows specimen baseline, runtime observation and bounded surgery tooling | Source prepared; Windows self-test still required on the disposable PC |
| #4 — HOSTLESS-RUN-001 | `runtime/001-hostless-agent` / `0a4eaf52cde00b85faf0698a006e0879adf6820e` | CLcode-owned principal agent loop over pinned GPTopus provider bridge | Mock-provider mechanical PASS; real local filesystem/process/Git effects; E02/E06 still NOT RUN |
| #5 — DESKTOP-CLIENT-001 | `desktop/001-runtime-client` / `2cdd0b5ac01ee41e7b34805e45bfc4943ced222e` | Desktop-side process client, run follower and UI projection, now explicitly stacked on PR #9 | Combined development tree 22/22 tests pass; no graphical/specimen acceptance yet |
| #6 — SPECIMEN-MAP-001 | `specimen/002-control-path-map` / `b16909037b0fcfba1af4bddbc926218f62500059` | Read-only static control-surface scanner + runtime correlation | Synthetic scanner/runtime-analysis PASS; no real specimen scan yet |
| #7 — SPECIMEN-SURGERY-001 | `specimen/003-guarded-surgery` / `db27cd1c4eb7e949581f31d528bfb4a0efab8d79` | Hash-guarded, receipt-backed reversible specimen patching | Synthetic apply/rollback PASS; no real specimen modification yet |
| #8 — SPECIMEN-LAUNCH-001 | `specimen/004-launch-trace` / `cb3a2fc242cd6faf2be38d3587641dbd276d1037` | Redacted Windows process-start/parent/command-line tracing | Node redaction/filter PASS; Windows WMI watcher NOT RUN |
| #9 — RUNTIME-HARDENING-001 | `runtime/002-windows-integrity` / `83015186d2e79e1a57b1abf38f75ffa92ad8bc1a` | Clean admission, CLcode-owned commit paths, Windows process-tree cancellation | Runtime-only 11/11 tests pass; actual Windows taskkill tree behavior NOT RUN |
| #10 — FIRST-WINDOWS-001 evaluator | `integration/first-windows-001` / `587c19a87668f8497ec8543401166b464dad5b17` | HOLD composition of specimen + hardened runtime + Desktop client stacks for one physical checkout | Reconstructed non-Windows integrated preflight PASS; PowerShell/physical Windows tests remain pending |
| #2 — PREPASS-01 | `prepass/01-gptopus-extraction-20261123` / `90b521653d13859f29914dbdb8fc807e342711d0` | GPTopus host-independence archaeology | Source-grounded design/reference |
| #1 — PREPASS-04 | `prepass/04-windows-desktop-20261123` / `c7f356250fe8ff37bca99c0b6023032e73521aea` | Disposable-Windows bootstrap and first Desktop vertical slice plan | Source-grounded plan; physical run not yet performed |

## What is now implemented

- A **CLcode-owned principal-agent runtime** exists independently of Claude Code host hooks.
- The runtime reuses the **exact pinned GPTopus provider bridge** instead of forking provider/accounting code.
- The runtime owns:
  - run admission and durable run IDs;
  - append-only JSONL events;
  - status and event cursors;
  - scoped Read/Edit/Test/local-Git tools;
  - hard and soft operator steering;
  - provider cancellation;
  - cancellation of a live local test subprocess.
- A stdio JSONL service exposes a small Desktop-facing control boundary.
- A Desktop-side client exists to:
  - spawn the runtime process;
  - correlate concurrent requests;
  - follow cursored events;
  - surface status;
  - steer/cancel the active run;
  - convert raw runtime events into replay-safe UI state.
- A reproducible failing fixture generator exists for the first genuine Read → Edit → Test → local commit acceptance task.
- Control-path surface mapping now exists to rank likely principal-model, auth/quota, engine-process, Desktop IPC, service/update and tool-policy files, including UTF-16 strings and redacted snippets.
- A guarded surgery layer now exists: exact baseline SHA, exact replacement count, dry-run, external backup, post-write hash verification and receipt-verified rollback.
- Runtime integrity hardening now requires a clean worktree at admission, commits only files actually edited through CLcode, revalidates touched-file hashes before commit, and uses a Windows process-tree termination plan.
- A redacted process-launch tracer now exists to catch short-lived Desktop → embedded-engine launches and their parent/child command-line structure without persisting raw credential-bearing arguments.
- A single HOLD/evaluator branch now composes the current stacks and includes `scripts/first-windows-check.mjs` plus `docs/FIRST-WINDOWS-001.md` so the first physical session needs one checkout rather than branch switching.
- Windows specimen-lab tooling exists to:
  - capture a cryptographic installation baseline;
  - record process/network observations;
  - create bounded surgery experiment ledgers;
  - compare before/after specimen captures.

## What has actually been proved

### Mechanical implementation proof

HOSTLESS-RUN-001 has a locally executed deterministic mock-provider test suite covering real host effects:

- real filesystem reads and edits;
- real `node --test` execution;
- real local Git diff and commit;
- project-root escape denial;
- hard steering interruption/restart;
- provider cancellation;
- cancellation of a running local test process;
- GPTopus donor SHA verification;
- GPTopus paged-response reconstruction;
- non-blocking service admission/status/events;
- JSONL request/response behavior.

RUNTIME-HARDENING-001 extends the runtime proof with clean-worktree admission, CLcode-touched-path-only commit ownership, touched-file hash revalidation and Windows process-tree termination planning. A runtime-only reconstruction passes **11/11 tests**.

DESKTOP-CLIENT-001 is now explicitly stacked on that hardened runtime. The combined development tree passes **22/22 tests** and includes process-client and UI-projection behavior, including the terminal-event final-drain race discovered during testing.

### Not yet proved

The following remain **NOT RUN** until physical/live execution:

- **E01:** GPTopus standalone panel on the disposable Windows PC.
- **E02:** a real provider request with Claude Code absent.
- **E06:** a real non-Claude principal model driving the Read → Edit → Test → local commit loop.
- **E07:** the same loop through an actual CLcode/modified Desktop Code graphical workspace.
- **E08:** observed zero Anthropic inference calls during that Desktop run.
- Any claim that the current Claude Desktop specimen can be successfully transplanted or stripped of Claude/Anthropic control dependencies.

## Current architectural direction

The preferred path is **specimen-first Desktop transplantation**:

1. preserve the productive Desktop Code UX and host behavior where practical;
2. identify where the principal model/"CEO" control path lives;
3. replace Claude/Anthropic inference and control dependencies with the CLcode runtime;
4. remove account/quota/service/policy coupling that obstructs the intended workflow;
5. keep the independent CLcode-owned runtime as the durable backend boundary;
6. use a clean-room/independent shell only for components that cannot be sustainably transplanted or distributed.

The standalone Claude Code CLI remains an implementation reference/dependency only; it is **not the product target**.

## Immediate next engineering targets

1. Check out **FIRST-WINDOWS-001 / PR #10** on the disposable PC and run `node scripts/first-windows-check.mjs`.
2. Resolve any Windows-only preflight failure before configuring provider credentials or modifying the Desktop specimen.
3. Capture the first real specimen baseline, static map, runtime/TCP observation and launch trace.
4. Execute E01/E02/E06 and the actual Windows process-tree cancellation acceptance.
5. Use the combined static/runtime/launch evidence to select one hash-guarded Desktop surgery experiment.
6. Connect the hardened Desktop client to the transplanted control seam once principal-model ownership is empirically located.
