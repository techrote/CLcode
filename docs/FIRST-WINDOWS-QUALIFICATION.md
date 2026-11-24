# FIRST-WINDOWS-QUALIFIED-001 — qualification record

Status: **SOURCE/MECHANICAL QUALIFICATION PASS — READY FOR OWNER PHYSICAL/LIVE EVALUATION, subject to the closure commit itself retaining a green integrated native-Windows run.**

Single evaluator: PR #40 / `integration/first-windows-qualified-001`.

## Exact authoritative inputs

- Runtime PR #37 — `8f85b5bcf994f988f1be9d3a885086660d146a82`
  - exact-head serial qualification: **75/75 Linux PASS and 75/75 native Windows PASS**
  - runtime evidence: https://github.com/techrote/CLcode/actions/runs/45454567372
  - includes closure of the reproduced Windows 8.3 path-identity and Git fsmonitor defects.
- Specimen PR #39 — `871c210dae12334d63810efe3152e5e7f2e144ad`
  - native Windows specimen qualification: https://github.com/techrote/CLcode/actions/runs/45452653193
- Preflight PR #25 — `c8b47ebf1d216cf65497cffa66ec3a78a6caaa83`
  - native-Node launch repair retained.
- GPTopus donor pin — `849627463c3e2be660f9d24976320b072c107b34`.

## Refreshed integrated native-Windows qualification

Refreshed evaluator source under test:

`eaa3d9dc2de5b1b821c3d4c1009816c0a6746d32`

Native Windows evidence:

- run: https://github.com/techrote/CLcode/actions/runs/45466461508
- job: `integrated-native-windows`
- runner image: Windows Server 2025
- Git: `2.56.1.windows.1`
- Node: `22.16.0` (workflow-pinned)
- preserved preflight artifact: `first-windows-preflight-eaa3d9dc2de5b1b821c3d4c1009816c0a6746d32`, artifact ID `14955029287`.

Observed exact-run gates:

- **34/34 component ancestry pins PASS**, including current PR #37 and PR #39 heads;
- full runtime/Desktop suite PASS;
- explicit complete serial runtime/adversarial qualification PASS;
- specimen static map PASS;
- ASAR internal map PASS;
- ASAR integrity PASS;
- evidence fusion PASS;
- surgery experiment packet PASS;
- runtime correlation/observation PASS;
- guarded patch/apply/rollback PASS;
- launch redaction/filter/lifecycle PASS;
- PowerShell 5.1 specimen-lab tooling PASS;
- evaluator-specific preflight regression is part of the runtime/Desktop test corpus;
- overall `FIRST-WINDOWS-001 preflight: PASS`.

The exact runtime-authoritative blobs in the evaluator were mechanically verified byte-for-byte against PR #37, and the PR #39 specimen-authoritative blobs were mechanically verified byte-for-byte against PR #39. PR #37, PR #39 and PR #25 are all real ancestors of the evaluator.

## Historical integrated blocker — CLOSED

Earlier native Windows run https://github.com/techrote/CLcode/actions/runs/45453533944 reproduced:
- Windows 8.3 alias versus long-path admission mismatch;
- Git fsmonitor positive-control portability defects;
- downstream serial cancellation caused by the admission failure.

Those defects were closed in canonical runtime PR #37 and are no longer blockers in the refreshed integrated evaluator.

## Closure/freeze rule

This file is part of a documentation-only closure commit after the successful refreshed-source run above. The closure commit must itself pass the same `FIRST-WINDOWS qualified integrated` native-Windows workflow before it is frozen.

The exact frozen evaluator SHA and its final confirmation run are recorded in PR #40 metadata after that run succeeds. They are not self-embedded here because changing this file would itself create another unqualified commit.

After the closure run succeeds, **do not modify the frozen evaluator source merely for cleanup.**

## Acceptance boundary

This qualification establishes only source composition and mechanical/native-Windows readiness.

It does **not** make E01/E02/E06/E07/E08 PASS. The following still require owner physical/live evaluation:

- real GPTopus standalone execution;
- real provider request with Claude Code absent;
- real non-Claude Read → Edit → Test → verified local commit;
- real installed Desktop specimen evidence;
- first evidence-bound reversible surgery;
- eventual graphical/transplanted Desktop qualification;
- observed absence of Anthropic inference for the target workflow.
