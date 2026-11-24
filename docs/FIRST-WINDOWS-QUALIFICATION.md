# FIRST-WINDOWS-QUALIFIED-001 — qualification record

Status: HOLD. Single child evaluator of PR #10, PR #40.

## Frozen pins
- Runtime #37: 3320f10db6df3ec5949475dd1a609f7f9a9f9a26; [Linux 71/71 PASS](https://github.com/techrote/CLcode/actions/runs/45453728373).
- Specimen #39: 871c210dae12334d63810efe3152e5e7f2e144ad; [native Windows specimen PASS](https://github.com/techrote/CLcode/actions/runs/45452653193). Its source/test blobs are unchanged from the Windows-tested revision.
- Native preflight #25 retained; donor 849627463c3e2be660f9d24976320b072c107b34.

## Exact integrated qualification and open blocker
[Native Windows run 45453533944](https://github.com/techrote/CLcode/actions/runs/45453533944) tested ec201df296b6dec85c092758c34cc6dad8d7f29a (then runtime fd73f9d0f719acff57c68044d355811daff1c997). All 34 ancestry checks, eight Node specimen suites and PowerShell specimen lab passed. Node runtime/Desktop: 32 passed, 22 failed, 12 cancelled of 66. Main production issue: Git top-level and requested project root use different Windows 8.3/long-path aliases; admission falsely rejects the correct root. Git fsmonitor positive-control tests also failed to create capture files on Windows; serial test latches cancelled after upstream admission rejection. [Runtime handoff](https://github.com/techrote/CLcode/pull/37#issuecomment-7139894659).

The subsequently introduced six adversarial tests initially failed (65/71); all 71 pass on the new runtime pin. They concern edit attribution, commit races, duplicate tool identity, repeated provider response identity and control-journal failure. The new Linux-qualified pin is included, but has not passed integrated Windows preflight. No claim that the Windows defects are fixed.

Temporary workflow is removed from the delivery tree. Keep the existing one-shot evidence. Refresh this same evaluator from the definitive runtime after native fixes, and perform an exact integrated Windows requalification before owner approval. Do not weaken positive controls, skip native cases, or choose an older green snapshot to evade new regressions.

E01/E02/E06, physical Desktop baseline/observations, any installed-specimen mutation and E07/E08 remain NOT RUN. Unknown provider outcome is STOP and reconcile, never automatic replay.
