# RUNTIME-DEFINITIVE-001

**Purpose:** provide one runtime/Desktop candidate that inherits the current qualification line plus the two remaining sibling integrity fixes.

## Merge parents

- PR #31 — RUNTIME-GIT-BOUNDARY-QUAL-001: `410567cf401c74632691b37a29a053eb9f9bb69e`
- PR #23 — RUNTIME-JOURNAL-INTEGRITY-001: `1623c5f6ed09e161e45937a4731f76d51f05e54f`
- PR #27 — FIXTURE-NO-CLOBBER-001: `44b3bb6f69bcdc795ba3e816a91fdbf2449aa780`

PR #31 already inherits the earlier runtime/Desktop chain through #20 → #21 → #24 → #28, including admission, donor, subprocess environment, control-truth, provider-outcome and Git-boundary hardening.

## Tree resolution

The PR #23 files are taken verbatim:
- `src/desktop/runtime-client.mjs`
- `src/runtime/journal.mjs`
- `test/desktop-client.test.mjs`
- `test/journal-integrity.test.mjs`

The PR #27 files are taken verbatim:
- `scripts/create-fixture.mjs`
- `test/fixture-guard.test.mjs`

All other files come from PR #31.

## Resulting integrity properties

The single candidate now includes:
- clean-worktree admission and touched-path-only commit ownership;
- Windows process-tree cancellation planning;
- provider/cloud secret isolation from tool subprocesses and Git probes;
- exact clean GPTopus donor qualification;
- slow-admission and client timeout integrity;
- RunFollower run-switch cursor reset;
- fail-closed cancellation/control semantics;
- provider request identity and unknown accounting preservation;
- literal Git ownership/hook suppression/donor-index-flag checks;
- duplicate/corrupt journal refusal and terminal-event continuity checks;
- fixture creation that refuses to clobber an existing destination.

## Evidence boundary

This is a source/ancestry consolidation. Each parent has focused mechanical evidence, but the exact aggregate tree has **not** been rerun in this chat environment because the execution container cannot reach GitHub to materialize the repository. FIRST-WINDOWS preflight remains the authoritative aggregate execution gate.
