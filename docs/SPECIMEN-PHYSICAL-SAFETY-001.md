# SPECIMEN-PHYSICAL-SAFETY-001

Follow-up to PR #35. No real Desktop specimen or live provider credentials used.

## Verified native synthetic evidence

GitHub Actions [run 45452653193](https://github.com/techrote/CLcode/actions/runs/45452653193), exact tested HEAD `0f2284d48024fa4afa43446ac5c1fdb897d04b4d`, 2026-11-24:

- Windows Server 2025, Git 2.56.1.windows.1, Node 22.16.0, Windows PowerShell 5.1.26100.33822.
- PASS: static map, ASAR map and integrity, evidence fusion, experiment packet, runtime correlation, guarded patch, launch redaction and launch lifecycle.
- PASS: PowerShell specimen-tooling self-test; five scripts parsed; synthetic capture/experiment/compare; five-second real CIM runtime-observer smoke test.

The one-shot workflow is removed after qualification. The tested specimen tool blobs are unchanged. This is not a physical Windows 11 or real application acceptance result.

## Boundaries

Prepared receipts and backup bytes are flushed and verified before target replacement. Atomic publication/recovery is exercised on a synthetic disposable file; an installed AppX application, file signing, ACL inheritance, reparse races, sudden power loss, and live updater interactions are NOT qualified. Stop the app/updater; first prove the process on a scratch copy; no privilege/ACL changes or bypass of application controls. A prepared receipt plus unexpected bytes requires manual reconciliation rather than an automatic write. Never upload backups, unreviewed command lines, or proprietary files. URL userinfo redaction is a narrow regression, not a complete sanitizer. Read-only static/ASAR/runtime evidence is not proof of behavior ownership.
