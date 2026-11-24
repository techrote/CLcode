# FIRST-WINDOWS-QUALIFIED-001 — qualification record

Status: **REFRESHED; EXACT INTEGRATED NATIVE-WINDOWS QUALIFICATION PENDING.**

Single evaluator: PR #40 / `integration/first-windows-qualified-001`.

## Exact authoritative inputs

- Runtime PR #37 — `8f85b5bcf994f988f1be9d3a885086660d146a82`
  - exact-head serial qualification: **75/75 Linux PASS and 75/75 native Windows PASS**
  - evidence: https://github.com/techrote/CLcode/actions/runs/45454567372
  - includes closure of the reproduced Windows 8.3 path-identity and Git fsmonitor defects.
- Specimen PR #39 — `871c210dae12334d63810efe3152e5e7f2e144ad`
  - native Windows specimen qualification: https://github.com/techrote/CLcode/actions/runs/45452653193
- Preflight PR #25 — `c8b47ebf1d216cf65497cffa66ec3a78a6caaa83`
  - native-Node launch repair retained.
- GPTopus donor pin — `849627463c3e2be660f9d24976320b072c107b34`.

## Historical integrated failure retained

Native Windows run https://github.com/techrote/CLcode/actions/runs/45453533944 tested an earlier evaluator/runtime and reproduced:
- Windows 8.3 alias versus long-path admission mismatch;
- Git fsmonitor positive-control portability defects;
- downstream serial cancellation caused by the admission failure.

Those defects were subsequently closed in canonical runtime PR #37. The standalone #37 PASS is **not** treated as proof that this refreshed combined evaluator passes.

## Integrated qualification contract

The exact refreshed PR #40 HEAD must pass `node scripts/first-windows-check.mjs` on native Windows.

The evaluator preflight now performs both:
1. the canonical full runtime/Desktop runner; and
2. a second complete **serial** `test/*.test.mjs` pass with `--test-concurrency=1`.

It also runs:
- component ancestry/pin verification;
- specimen static map;
- ASAR internal map;
- ASAR integrity;
- evidence fusion;
- surgery experiment packet;
- runtime observation/correlation;
- launch observer/redaction/lifecycle;
- guarded patch/apply/rollback;
- PowerShell 5.1 specimen tooling.

The #37 test corpus supplies the native Windows path-identity, fsmonitor and descendant-process cancellation regressions. The evaluator-specific preflight regression is itself part of the test corpus.

Only an exact combined native-Windows PASS may move this record to **READY FOR OWNER PHYSICAL/LIVE EVALUATION**.

## Acceptance boundary

Even after mechanical/source qualification, E01/E02/E06/E07/E08 remain NOT RUN. Installed-Desktop evidence, live provider behavior, first reversible specimen surgery and observed absence of Anthropic inference are separate owner/live gates.
