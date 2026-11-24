# RUNTIME-INTEGRATED-001 — consolidated runtime integrity candidate

**Status:** merge composition of the sibling runtime hardening lines; full exact-head Node verification is required after publication.

This branch exists to remove an evaluator-only dependency: the current runtime admission/donor/client line and the subprocess-environment isolation line previously diverged after RUNTIME-HARDENING-001.

## Parents

- RUNTIME-ADMISSION-HARDENING-002 / PR #16: `12eca2de12744dc6a8d86068f0841f7cd95387ec`
- RUNTIME-HARDENING-002 / PR #12: `567e9d5ef5b564e17482bb5f6c833f24d3f17039`

## Consolidated guarantees

The candidate contains, in one ancestry:

- clean Git worktree admission;
- CLcode-touched-path-only local commits;
- touched-file hash revalidation;
- Windows process-tree termination planning;
- slow-admission integrity / no false orphan failure;
- exact, clean GPTopus donor enforcement;
- no abandoned explicit client spawn timeout;
- tool subprocess environment isolation that excludes provider/cloud credentials and Node injection variables.

The subprocess environment boundary is deliberately an allowlist, not a claim of OS/network sandboxing.

## Review intent

This PR is a consolidation point, not a new behavioral feature. The goal is that future Desktop/client work can inherit one runtime head instead of relying on FIRST-WINDOWS-001 to merge sibling integrity fixes.

## Evidence boundary

The two parent lines have their own deterministic regression evidence. This combined exact head must be qualified with the repository's canonical Node test command after publication. Physical Windows process-tree, provider and Desktop acceptance remain pending.
