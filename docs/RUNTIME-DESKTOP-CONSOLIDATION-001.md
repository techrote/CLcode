# RUNTIME-DESKTOP-CONSOLIDATION-001

**Purpose:** establish one canonical runtime/Desktop development head that contains every current runtime integrity fix rather than relying on FIRST-WINDOWS-001 to merge sibling branches only at evaluator time.

## Parents

- DESKTOP-CLIENT-HARDENING-002 / PR #17: `67bde24075502a126026bbc8d89022bb2337b5ab`
- RUNTIME-HARDENING-002 / PR #12: `567e9d5ef5b564e17482bb5f6c833f24d3f17039`

PR #17 already inherits the admission, donor-integrity, timeout-integrity, Desktop-client and earlier Windows-integrity line. PR #12 is the remaining sibling that hardens the environment inherited by tool subprocesses.

## Merge rule

PR #12 changes only:

- `src/runtime/tools.mjs`
- `test/tool-loop.test.mjs`

Those exact reviewed blobs are taken from PR #12. The rest of the tree comes from PR #17. Both heads are merge parents, so ancestry records the composition rather than merely copying source.

## Resulting guarantees in one lineage

The combined head includes:

- clean-worktree admission and touched-path-only commits;
- Windows process-tree cancellation planning;
- slow-admission orphan-run prevention;
- exact, clean GPTopus donor verification;
- client-side spawn timeout prohibition;
- RunFollower event-cursor reset between runs;
- tool-subprocess environment isolation that removes provider/cloud credentials and Node injection variables.

## Evidence boundary

This commit is an ancestry/source consolidation. The individual fixes have their recorded deterministic tests, but the full aggregate tree has **not** been rerun in this chat environment. FIRST-WINDOWS-001 remains the canonical complete preflight and must execute against the consolidated head before physical acceptance.
