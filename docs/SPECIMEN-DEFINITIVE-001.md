# SPECIMEN-DEFINITIVE-001

**Purpose:** establish one specimen-research candidate that joins the evidence→packet pipeline with the latest Windows observer, path-containment and launch-lifecycle red-team fixes.

## Merge parents

- PR #32 — SPECIMEN-EXPERIMENT-PACKET-001: `b72f8e431a1efdc9248aa9a00b5d087824b66ea0`
- PR #26 — SPECIMEN-OBSERVER-PS51-001: `e138a373c25cc004a2a5acabc97a70b422d2c3c3`
- PR #29 — SPECIMEN-PATH-GUARD-001: `f28c660eb29d9fe4e9087914e74665d47506448a`
- PR #30 — SPECIMEN-LAUNCH-LIFECYCLE-001: `8a9153f4ff676cd721847434932676847c772b33`

PR #32 already carries the specimen baseline/map/ASAR/integrity/evidence-fusion/guarded-surgery lineage through its merge ancestry.

## Tree resolution

- PR #26 is authoritative for the PowerShell runtime observer and its PowerShell 5.1 self-test.
- PR #29 is authoritative for guarded patch path containment and the shared cross-volume guard.
- PR #30 is authoritative for launch observer lifecycle and launch redaction tests.
- The launch support files/documentation inherited by PR #30 are included.
- `tools/specimen/README.md` remains the newer PR #32 version so packet/fusion/ASAR guidance is not lost.

## Combined specimen workflow

One lineage now provides:
1. cryptographic baseline capture;
2. static surface mapping;
3. ASAR internal mapping and integrity/fuse qualification;
4. periodic runtime observation on Windows PowerShell 5.1;
5. redacted process-launch tracing with failure-aware watcher lifecycle;
6. multi-source evidence fusion;
7. baseline-bound first-surgery packet generation;
8. guarded patch dry-run/apply/rollback with cross-volume containment checks.

## Evidence boundary

This is a source/ancestry consolidation. The exact aggregate tree has not been rerun in this chat environment. Parent PRs retain their focused evidence; FIRST-WINDOWS preflight is the aggregate execution gate.
