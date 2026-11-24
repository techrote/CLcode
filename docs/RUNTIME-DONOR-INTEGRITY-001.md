# RUNTIME-DONOR-INTEGRITY-001 — verify source bytes behind the GPTopus pin

**Status:** deterministic source-integrity hardening. No live-provider or Windows acceptance claim.

## Problem

HOSTLESS-RUN-001 pins GPTopus to commit:

`849627463c3e2be660f9d24976320b072c107b34`

The adapter previously verified only:

`git rev-parse HEAD`

That is necessary but not sufficient. A working tree can remain at the expected commit while tracked bridge files are modified or extra untracked source files are present. CLcode would then dynamically import bytes that are **not** the pinned donor while still reporting the expected commit SHA.

## Change

Before importing the donor bridge, `GPTopusAdapter.load()` now requires both:

1. exact `HEAD === expectedSha`; and
2. an empty `git status --porcelain=v1 --untracked-files=all`.

Ignored files remain ignored by Git as normal, but any tracked modification, staged change or untracked non-ignored file causes the donor load to stop.

The error deliberately does not echo dirty filenames, avoiding accidental disclosure of local filenames in higher-level logs.

## Regression coverage

The adapter test now:

1. creates and commits a fake donor;
2. verifies the pinned bridge and paged response contract;
3. verifies a wrong SHA is rejected;
4. modifies a tracked donor bridge file **without changing HEAD**;
5. verifies a fresh adapter refuses to load the dirty source.

## FIRST-WINDOWS-001 effect

The evaluator can continue using the separate detached GPTopus checkout described in the runbook. If that checkout is accidentally edited before E02/E06, the run now fails closed instead of silently invalidating the evidence provenance.

Still NOT RUN here: real GPTopus provider inference, physical Windows E02/E06, or Desktop specimen integration.
