# CLcode — FIRST-WINDOWS programme handover

**Recorded:** 2026-11-24  
**Repository:** [techrote/CLcode](https://github.com/techrote/CLcode)  
**Disposition:** **GO for controlled owner physical/live evaluation; HOLD for production use, desktop-product acceptance, or wholesale merge.**  
**Scope:** Whole-programme integration review and handover. This is a documentation record, not another implementation or qualification branch.

## Contents

1. Executive decision — what is ready and what remains unproved.
2. Frozen experimental instrument — exact revisions and source/qualification evidence.
3. Completed engineering — the capability now available in the evaluator.
4. Outstanding acceptance gates — the live evidence still required.
5. Operational boundaries — provider, process, filesystem and specimen safety.
6. Next execution sequence — the gated disposable-PC session.
7. Independent desktop product path — avoid making specimen transplantation a single point of failure.
8. Repository disposition and handoff rules — preserve the freeze and retain negative evidence.

## 1. Executive decision

The FIRST-WINDOWS engineering programme has converged on a single source-qualified evaluator. Its runtime and specimen research tooling have passed extensive mechanical qualification, including native Windows qualification. The earlier Windows short-path identity and Git fsmonitor failures have been closed.

The project is ready to move from synthetic qualification to **controlled physical/live experiments** on the disposable Windows PC.

It is not yet appropriate to declare CLCODE-BOOT-001 complete. The current implementation consists of a hostless principal-agent runtime, Desktop-facing control/client infrastructure and a specimen-research toolkit. It is not yet a complete independently operating graphical Desktop Code application. Real provider behavior, real coding-agent behavior, actual installed specimen observations and graphical acceptance remain to be established.

Do not restart a general-purpose red-team programme before owner evaluation. Reopen an implementation lane only for a specific, reproduced defect or a genuinely independent product deliverable.

## 2. Frozen experimental instrument

The only approved evaluator for the initial physical session is [PR #40 — FIRST-WINDOWS-QUALIFIED-001](https://github.com/techrote/CLcode/pull/40).

| Component | Authoritative revision | Evidence / disposition |
| --- | --- | --- |
| Evaluator #40 | `8e1f564776101bb7e61159bb573c4f8b91d21d7a` | FROZEN; final integrated native-Windows PASS |
| Runtime #37 | `8f85b5bcf994f988f1be9d3a885086660d146a82` | 75/75 Linux and 75/75 native Windows PASS |
| Specimen #39 | `871c210dae12334d63810efe3152e5e7f2e144ad` | Native Windows synthetic specimen qualification PASS |
| Preflight #25 | `c8b47ebf1d216cf65497cffa66ec3a78a6caaa83` | Native-Node preflight repair; retained in evaluator |
| GPTopus donor | `849627463c3e2be660f9d24976320b072c107b34` | Exact source pin; live-provider acceptance pending |

Qualification records:

- [Frozen-head integrated Windows run 45467099696](https://github.com/techrote/CLcode/actions/runs/45467099696): success; exact evaluator HEAD.
- [Runtime serial qualification run 45454567372](https://github.com/techrote/CLcode/actions/runs/45454567372): success; exact runtime HEAD.
- [Specimen native Windows run 45452653193](https://github.com/techrote/CLcode/actions/runs/45452653193): recorded by the evaluator as the specimen qualification.
- [Frozen evaluator qualification record](https://github.com/techrote/CLcode/blob/8e1f564776101bb7e61159bb573c4f8b91d21d7a/docs/FIRST-WINDOWS-QUALIFICATION.md).
- [Frozen evaluator component manifest](https://github.com/techrote/CLcode/blob/8e1f564776101bb7e61159bb573c4f8b91d21d7a/docs/FIRST-WINDOWS-COMPONENTS.json).
- [Frozen physical-session runbook](https://github.com/techrote/CLcode/blob/8e1f564776101bb7e61159bb573c4f8b91d21d7a/docs/FIRST-WINDOWS-001.md).

The final evaluator run passed all 34 component ancestry pins, the runtime/Desktop suite, explicit serial/adversarial suite, all specimen suites and PowerShell 5.1 tooling, finishing with `FIRST-WINDOWS-001 preflight: PASS`.

### Independent handover checks

The whole-programme review verified that:

- GitHub reports the final integrated workflow as completed successfully at the exact frozen evaluator SHA.
- GitHub reports the definitive runtime qualification as completed successfully at its exact authoritative SHA.
- The evaluator's manifest identifies the intended definitive runtime/specimen/preflight and donor pins.
- All 23 runtime-authoritative source/test/package/runner blobs selected for comparison were byte-identical to the corresponding runtime #37 Git blobs.
- All 34 files under `tools/specimen/` were byte-identical to the corresponding specimen #39 Git blobs.
- PR #22 is explicitly identified as a superseded alternative consolidation; its substantive subprocess isolation is carried through the chosen lineage.
- No omitted implementation slice or lost authoritative source file was identified by these checks.

These are source-composition and recorded-qualification checks, not a fresh execution of the Windows suite. The reviewer did not independently rerun native Windows tests or contact a live provider.

**Freeze rule:** do not alter the evaluator merely to update prose, clean up files or add a feature. A change creates a different experimental instrument and requires explicit requalification. Use the frozen SHA, not the moving branch tip.

## 3. Completed engineering

### Runtime and Desktop-facing control

The qualified runtime implements:

- CLcode-owned durable run IDs, admission, event journals, controller ownership and a JSONL service.
- An adapter to the exact pinned GPTopus provider bridge, rather than a separate provider/accounting implementation.
- Real scoped Read/Edit/Test/local-Git effects under the mock-provider mechanical suite.
- Exact donor verification, clean-worktree admission, per-worktree ownership, refusal of ambiguous recovery and duplicate admission.
- Hard/soft steering, request identity, provider outcome uncertainty, bounded execution and cancellation.
- Project-owned change attribution and verified local commit behavior; protection against unrelated edits and a range of implicit Git execution/configuration hazards.
- Credential-scrubbed tool subprocesses and Git probes.
- Windows canonical-path handling and actual descendant process cancellation regressions.
- Fail-closed journal/history behavior, terminal-event continuity, and explicit unknown state rather than invented continuity.
- A Desktop process client, run follower and provider-neutral run-view projection.

The control/client modules are a usable foundation for an application. They are **not a graphical application** by themselves. The frozen tree includes `src/desktop/runtime-client.mjs`, `src/desktop/run-view-model.mjs`, `src/server.mjs` and the runtime modules; it does not supply a complete GUI shell, renderer, graphical workspace, desktop entry point or distributable desktop package.

### Specimen research

The consolidated, native-synthetic-qualified specimen tooling implements:

- Cryptographic baseline capture and ordinary installation surface mapping.
- Bounded read-only ASAR internal mapping and separate Electron fuse/resource/header integrity assessment.
- PowerShell 5.1 runtime/process/TCP observation and failure-aware redacted launch observation.
- Conservative multi-source evidence fusion, separating relevance from patchability.
- Evidence-bound experiment packets with exact baseline-target identity and refusal of ambiguous, stale or ineligible candidates.
- Guarded scratch-file modification/recovery with verified backup and prepared receipt before mutation, staged replacement, exact-hash checks and explicit rollback conditions.

A real installed Desktop specimen has not yet established the actual control seam, behavioral ownership or feasibility of a sustainable integration. Synthetic tests establish the operation of the research instruments, not the truth of a proposed architectural hypothesis about a particular vendor build.

## 4. Outstanding acceptance gates

The authoritative experiment definitions remain in [EXPERIMENTS.md](EXPERIMENTS.md). None of the following should be silently promoted to PASS on the basis of source inspection, mock-provider tests, hosted CI or a successful preflight alone.

| Gate | Current state | Required evidence |
| --- | --- | --- |
| E01 — standalone GPTopus control | NOT RUN | Actual standalone panel lifecycle, isolated settings persistence and authorization checks without Claude Code hosting |
| E02 — standalone provider inference | NOT RUN | Authorized real provider request, exact observed model/request/response and usage disposition, without Claude Code ownership |
| E03 — independent worker spawning | Live acceptance pending | Creation and CLcode ownership of a new run, not merely steering an existing host-owned worker |
| E04 — live steering and cancellation | Live acceptance pending | Delivery, interruption and cancellation outcomes observed against the actual selected provider |
| E05 — restart recovery | Live acceptance pending | Actual interruption/restart and truthful ownership/reconciliation without silent replay |
| E06 — real agentic coding loop | NOT RUN | Real model-selected Read → Edit → Test → verified local commit on a fresh fixture |
| E07 — graphical Desktop workflow | NOT RUN | Actual independently launched graphical workspace performing the coding loop |
| E08 — Anthropic inference independence | NOT RUN | Corroborated observation of the target graphical workflow's inference path |
| E09 — optional host-quota observation | Deferred/optional | Only naturally occurring authorized host behavior; not necessary for independent operation |
| E10 — capability boundary | Mechanical groundwork only | Explicit scoped capability tests with synthetic data; wider execution confinement must be separately established |

The E02/E06 evidence is the next decisive step. E03/E04/E05 must still be adjudicated explicitly; a successful coding task should not hide the outstanding control/recovery questions. E07/E08 remain the product gate.

## 5. Operational boundaries

### Live-provider contracts

The pinned GPTopus donor has multiple provider families with meaningfully different behavior. OpenAI Responses uses provider response IDs and GPTopus accounting reservations. NVIDIA/LM Studio provider paths have their own conversation/stream semantics, and their accounting/cancellation behavior is not identical to OpenAI Responses.

A worker appearing in the worker list is **configuration evidence**, not proof of provider entitlement, credentials, model availability or tool compatibility. Start with one authorized tool-capable worker and qualify its full real path before expanding the provider matrix.

Do not treat an unknown provider response or missing usage as zero cost. The donor can release reservations when failed/cancelled responses lack usage; that is not proof that the upstream request incurred no usage. Preserve request/response identity, reconcile through the authorized provider's normal controls, and never automatically replay an ambiguous request. No unattended paid execution until the relevant accounting behavior has been verified.

E01's isolated JSON configuration does not automatically configure another runtime process. Keep panel configuration, hostless runtime state, donor source and actual provider authorization explicit and separate. Do not persist or share keys or token-bearing localhost URLs.

### Tool execution and credentials

The runtime's environment isolation, path confinement and Git restrictions are substantial but do not amount to a general OS/network sandbox. In particular, the fixed test operation executes project code, which has the ordinary permissions of its process.

For this evaluation:

- Use fresh, trusted, disposable fixtures without remotes or valuable data.
- Use an ordinary-user session and explicitly authorized test-only provider access.
- Keep live provider credentials out of specimen sessions, source trees, fixture files, exported journals and issue/PR content.
- Do not use untrusted projects or arbitrary hostile executables as if the current tool boundary provided complete containment.
- An unresolved worktree lease, upstream request or uncertain process/commit effect requires operator reconciliation, not a new state directory or automatic replay.

Before operation on valuable or untrusted repositories, define and qualify an explicit execution/permission model, including filesystem, network and credential boundaries. That later product-security work is distinct from initial trusted-fixture feasibility.

### Real specimen handling

The specimen workflow is read-only by default. Keep original application data and ordinary user profiles outside research inputs. Keep raw captures, proprietary payloads, backups and unreviewed snippets local. Do not redistribute proprietary application code.

A string hit, launch relationship, or sampled TCP connection is candidate evidence rather than proof of application-layer behavior. An empty shortlist, unavailable protected target, unresolved integrity state or falsified hypothesis is a legitimate negative result.

Use synthetic scratch copies to demonstrate native recovery. Any later real-file experiment must be explicitly authorized, lawful, narrow, reversible and evidence-bound, with a quiescent target and a reviewed recovery procedure. Do not circumvent application access controls, signature/fuse/integrity checks, authentication, account entitlements or service restrictions. If a supported or authorized integration path is unavailable, prefer the independent CLcode desktop implementation.

## 6. Next execution sequence

The frozen runbook is the procedural authority. The short sequence below is its entry gate, not a replacement for its detailed safety and evidence instructions.

On the disposable Windows PC, using ordinary-user PowerShell 5.1, Git for Windows and the qualified Node version:

```powershell
git clone https://github.com/techrote/CLcode.git C:\CLcode-eval
Set-Location C:\CLcode-eval
git checkout --detach 8e1f564776101bb7e61159bb573c4f8b91d21d7a
git rev-parse HEAD
git status --porcelain=v1 --untracked-files=all
node --version
node .\scripts\first-windows-check.mjs
```

Require exact HEAD, clean status, Node 22.16.0 and final `FIRST-WINDOWS-001 preflight: PASS`. Stop and record a real discrepancy rather than silently switching revisions.

Then follow the gated sequence:

1. **E01:** fresh exact donor checkout and isolated standalone control panel; verify persistence and local authorization.
2. **E02:** one small authorized real provider request, with explicit model/request/response/usage evidence and a separate fresh fixture.
3. **E06:** fresh failing coding fixture; genuine model-issued Read/Edit/Test/inspection/verified local commit. Record E03 ownership evidence where applicable.
4. **E04/E05:** bounded control, cancellation and restart/reconciliation experiments, without automatic request replay; distinguish native mechanical evidence from live-provider evidence.
5. **Read-only specimen research:** capture exact installed version and hashed baseline, surface/ASAR/integrity observations, periodic runtime/launch evidence and conservative fused hypotheses.
6. **Recovery and experiment decision:** exercise synthetic scratch recovery first. If authorized evidence supports a permissible bounded experiment, use the existing packet procedure; otherwise record the negative result and choose the independent product path.
7. **E07/E08:** qualify the actual graphical workflow and corroborate the inference path through appropriate controlled process/network and provider evidence. Do not infer zero Anthropic inference solely from an absence of observed process names or connections.

Record explicit PASS/FAIL/PARTIAL/BLOCKED/NOT RUN states in the experiment evidence. Capture exact source revisions, machine/tool facts, expected versus observed behavior, verified provider/tool identities, relevant usage disposition and sanitized artifact references. Preserve the reason for every stop decision.

## 7. Independent desktop product path

The project should not make successful transplantation of a particular proprietary Desktop specimen a single point of failure for CLCODE-BOOT-001.

A genuinely independent parallel deliverable, after or alongside the initial physical evaluation, is:

**CLCODE-DESKTOP-SHELL-001 — Minimal independent graphical coding workspace.**

This should be a separate child development/review branch, not a modification to the frozen evaluator. It should consume the qualified Desktop process client and run-view projection; do not implement another agent runtime.

Minimum useful product scope:

- Select a trusted local project and an authorized worker.
- Submit a task and create an independently owned run.
- Present run/model/tool state, live events and clear failure/uncertainty states.
- Show actual tool results and diffs.
- Provide operator steering and cancellation with truthful outcomes.
- Inspect durable run history, distinguish current ownership from historical records and preserve reconciliation requirements.

First prove the graphical interaction using the existing deterministic mechanical provider/fixture boundary; qualify the real provider-backed workflow after E06. Keep provider credentials on the backend side of the application boundary. No need for elaborate distribution, fleet orchestration or a new provider stack before this vertical slice.

This is a product path, not permission to bypass a vendor's protections. Read-only specimen findings can inform independently implemented UX and integration choices, while the actual graphical acceptance criteria remain unchanged.

## 8. Repository disposition and handoff rules

- Preserve PR #40's frozen SHA and the underlying definitive #37/#39/#25 pins.
- Keep the evaluator and its research slices unmerged until the owner decides the permanent integration structure using physical results.
- Do not create another competing evaluator or redo already qualified specimen/runtime consolidation.
- Keep this handover on the documentation lineage, separate from the frozen instrument.
- Record concrete defects on the closest relevant lineage, with reproductions and exact new qualification evidence; do not change the frozen reference that exposed a failure.
- Maintain the distinction between source qualification, native synthetic qualification, physical execution, live inference, and actual graphical product acceptance.
- Once E01/E02/E06 are adjudicated, prioritize the independent graphical vertical slice and E07/E08. Do not let indefinite synthetic hardening or speculative specimen work postpone a usable independent product.

**Handover decision:** **GO — use frozen `8e1f564776101bb7e61159bb573c4f8b91d21d7a` for the controlled owner physical/live evaluation. CLCODE-BOOT-001 remains open.**

No new test pass, live-provider call, real specimen result, or E-gate promotion is claimed by this handover.
