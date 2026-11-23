# CLcode — current implementation status

**Recorded:** 2026-11-23  
**Main baseline:** `48510bf25bad1aa0d429e3b90fdad507f289189e`

This file records the current engineering state and evidence boundaries. It is not a substitute for [EXPERIMENTS.md](EXPERIMENTS.md): acceptance gates remain authoritative there.

## Current working stack

| PR | Branch / HEAD | Role | Current evidence |
| --- | --- | --- | --- |
| #3 — SPECIMEN-LAB-001 | `specimen/001-windows-lab` / `2210b6494e33063c3373c06167f23d6d05d8f859` | Windows specimen baseline, runtime observation and bounded surgery tooling | Source prepared; Windows self-test still required on the disposable PC |
| #4 — HOSTLESS-RUN-001 | `runtime/001-hostless-agent` / `0a4eaf52cde00b85faf0698a006e0879adf6820e` | CLcode-owned principal agent loop over pinned GPTopus provider bridge | Mock-provider mechanical PASS; real local filesystem/process/Git effects; E02/E06 still NOT RUN |
| #5 — DESKTOP-CLIENT-001 | `desktop/001-runtime-client` / `cb13a3b7e73ce23ea42d159b4e5050fb8066b56f` | Desktop-side process client, run follower and UI projection over PR #4 JSONL service | 17/17 stacked Node tests reported passing; no graphical/specimen acceptance yet |
| #6 — SPECIMEN-MAP-001 | `specimen/002-control-path-map` / `b16909037b0fcfba1af4bddbc926218f62500059` | Read-only static control-surface scanner + runtime correlation | Synthetic scanner/runtime-analysis PASS; no real specimen scan yet |
| #7 — SPECIMEN-SURGERY-001 | `specimen/003-guarded-surgery` / `db27cd1c4eb7e949581f31d528bfb4a0efab8d79` | Hash-guarded, receipt-backed reversible specimen patching | Synthetic apply/rollback PASS; no real specimen modification yet |
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

DESKTOP-CLIENT-001 extends that mechanical proof with process-client and UI-projection behavior, including the terminal-event final-drain race discovered during testing.

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

1. **SPECIMEN-LAUNCH-001:** capture and redact process-creation/command-line evidence for the Desktop→embedded-engine launch boundary.
2. Run PR #3/#6/#7 self-tests on the disposable PC, then capture the first real specimen baseline/map/runtime observation.
3. Execute E01/E02/E06 on the physical PC using the already implemented hostless runtime and fixture.
4. Use the static map + launch/runtime evidence to select the first hash-guarded Desktop surgery experiment.
5. Connect DESKTOP-CLIENT-001 to the modified Desktop specimen once the engine/frontend control seam is identified.
