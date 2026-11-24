# CLcode — current implementation status

**Recorded:** 2026-11-24  
**Main baseline before this status update:** `0e9fc9c263273ec2208464379d21b731b3a38a68`

This file records the current engineering state and evidence boundaries. It is not a substitute for [EXPERIMENTS.md](EXPERIMENTS.md): acceptance gates remain authoritative there.

## Current working stack

| PR | Branch / HEAD | Role | Current evidence |
| --- | --- | --- | --- |
| #3 — SPECIMEN-LAB-001 | `specimen/001-windows-lab` / `2210b6494e33063c3373c06167f23d6d05d8f859` | Windows specimen baseline, runtime observation and bounded surgery tooling | Source prepared; Windows self-test still required on the disposable PC |
| #4 — HOSTLESS-RUN-001 | `runtime/001-hostless-agent` / `0a4eaf52cde00b85faf0698a006e0879adf6820e` | CLcode-owned principal agent loop over pinned GPTopus provider bridge | Mock-provider mechanical PASS; real local filesystem/process/Git effects; E02/E06 still NOT RUN |
| #5 — DESKTOP-CLIENT-001 | `desktop/001-runtime-client` / `b76c186017535ed324afa7614da9ade4a4815b8f` | Desktop-side process client, run follower and UI projection, now explicitly stacked on PR #9 | Combined development tree 22/22 tests pass; no graphical/specimen acceptance yet |
| #6 — SPECIMEN-MAP-001 | `specimen/002-control-path-map` / `b16909037b0fcfba1af4bddbc926218f62500059` | Read-only static control-surface scanner + runtime correlation | Synthetic scanner/runtime-analysis PASS; no real specimen scan yet |
| #7 — SPECIMEN-SURGERY-001 | `specimen/003-guarded-surgery` / `db27cd1c4eb7e949581f31d528bfb4a0efab8d79` | Hash-guarded, receipt-backed reversible specimen patching | Synthetic apply/rollback PASS; no real specimen modification yet |
| #8 — SPECIMEN-LAUNCH-001 | `specimen/004-launch-trace` / `cb3a2fc242cd6faf2be38d3587641dbd276d1037` | Redacted Windows process-start/parent/command-line tracing | Node redaction/filter PASS; Windows WMI watcher NOT RUN |
| #9 — RUNTIME-HARDENING-001 | `runtime/002-windows-integrity` / `175b2a9e58dd1a9eb519fb96828581bb81eb1bf4` | Clean admission, CLcode-owned commit paths, Windows process-tree cancellation | Runtime-only 11/11 tests pass; actual Windows taskkill tree behavior NOT RUN |
| #10 — FIRST-WINDOWS-001 evaluator | `integration/first-windows-001` / `def18b08a242264ce5071111110658929e8ab638` | HOLD composition of all current specimen/runtime/Desktop hardening slices for one physical checkout | Component manifest pins 16 review slices through #19; all recorded heads verified as ancestors; physical Windows/live-provider evidence pending |
| #11 — RUNTIME-ADMISSION-001 | `runtime/003-admission-integrity` / `c7e00433625e8956723cfd72a480973fb3cb0998` | Prevent slow-admission false failure/orphan runs | Deterministic admission regression PASS; live provider admission still pending |
| #12 — RUNTIME-HARDENING-002 | `runtime/003-subprocess-env-isolation` / `567e9d5ef5b564e17482bb5f6c833f24d3f17039` | Remove provider/cloud credentials and Node injection vars from tool subprocesses | Independent child-process isolation check PASS on non-Windows host; Windows pending |
| #13 — SPECIMEN-ASAR-001 | `specimen/005-asar-map` / `ac7287a7b1c02dc707edc3144d7bcc857176343c` | Read-only Electron ASAR internal control-path mapping | Synthetic ASAR parser/map PASS; real specimen archive pending |
| #14 — RUNTIME-DONOR-INTEGRITY-001 | `runtime/004-donor-integrity` / `3903f8b99c72adf5d4addb926b329517aa4b28f3` | Require exact pinned, clean GPTopus donor checkout | Dirty-donor regression PASS; physical donor acceptance pending |
| #15 — SPECIMEN-ASAR-HARDENING-001 | `specimen/006-asar-explicit-archive` / `df3383d923b7b41bcb83c91f7cccf5f0b1772317` | Repair explicit `--archive` ASAR mapping path | Synthetic explicit-archive regression PASS |
| #16 — RUNTIME-ADMISSION-HARDENING-002 | `runtime/005-admission-timeout-integrity` / `12eca2de12744dc6a8d86068f0841f7cd95387ec` | Forbid client abandonment of spawn admission via timeout | Deterministic client/service regression PASS |
| #17 — DESKTOP-CLIENT-HARDENING-002 | `desktop/002-run-follower-reuse` / `67bde24075502a126026bbc8d89022bb2337b5ab` | Reset event cursor when RunFollower switches run IDs | Deterministic reused-client regression PASS |
| #18 — SPECIMEN-ASAR-INTEGRITY-001 | `specimen/006-asar-integrity` / `73e36c48635567336407e5a8ad271d81567e457f` | Qualify Electron ASAR fuse/header integrity before archive surgery | Synthetic integrity checks PASS; real Desktop fuse/resource state pending |
| #19 — SPECIMEN-HYPOTHESIS-001 | `specimen/007-hypothesis-fusion` / `0503951abd9c5dfe0fcf83b42f37d2077d6ef80a` | Fuse static/ASAR/runtime/launch/integrity evidence into first-surgery shortlist | Synthetic evidence-fusion PASS; real specimen evidence pending |
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
- ASAR internal mapping now exists, including corrected Electron header-hash semantics, explicit archive scanning, and pre-surgery fuse/resource integrity qualification.
- Multi-source hypothesis fusion now combines static surface, ASAR, runtime, launch and integrity evidence into a ranked first-surgery shortlist without treating any one signal as proof.
- A guarded surgery layer now exists: exact baseline SHA, exact replacement count, dry-run, external backup, post-write hash verification and receipt-verified rollback.
- Runtime integrity hardening now requires a clean worktree at admission, commits only files actually edited through CLcode, revalidates touched-file hashes before commit, and uses a Windows process-tree termination plan.
- A redacted process-launch tracer now exists to catch short-lived Desktop → embedded-engine launches and their parent/child command-line structure without persisting raw credential-bearing arguments.
- A single HOLD/evaluator branch now composes the current stacks and includes `scripts/first-windows-check.mjs` plus `docs/FIRST-WINDOWS-001.md` so the first physical session needs one checkout rather than branch switching.
- The evaluator now carries `docs/FIRST-WINDOWS-COMPONENTS.json`; preflight verifies every recorded component SHA with `git merge-base --is-ancestor`, preventing silent stale-stack evaluation.
- DESKTOP-CLIENT-001 was repaired after a premature `package.json` Electron entry point/dependency appeared without the corresponding Electron source; the branch now advertises only implemented runtime/client commands.
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

1. Consolidate the currently sibling runtime hardening lines (#12 and #16/#14) into one reviewable runtime candidate so future Desktop work inherits every integrity fix without relying on evaluator-only merge composition.
2. Refresh DESKTOP-CLIENT-HARDENING on that consolidated runtime candidate and preserve its run-follower reuse fix.
3. Keep FIRST-WINDOWS-001 pinned to the consolidated heads and rerun ancestry checks after every movement.
4. On the disposable PC, run `node scripts/first-windows-check.mjs`, then capture the first specimen baseline/map/ASAR/integrity/runtime/launch/fusion evidence.
5. Execute E01/E02/E06 plus the actual Windows process-tree cancellation acceptance.
6. Use the fused evidence to choose exactly one hash-guarded Desktop surgery experiment toward replacing Claude as principal controller.
