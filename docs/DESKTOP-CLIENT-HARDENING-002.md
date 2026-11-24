# DESKTOP-CLIENT-HARDENING-002 — run-scoped event cursors

**Status:** Desktop/runtime client state hardening. No graphical or Windows acceptance claim.

## Finding

`RunFollower` stores the last consumed runtime event sequence in `cursor`.

Before this change, `spawnAndFollow()` and `follow(runId)` replaced `runId` but did not reset `cursor`. Reusing one follower for a different run could therefore issue a request such as:

`events({ runId: "RNEW...", afterSequence: 42 })`

even though the new run starts at sequence 1. Early model/tool/control events would be skipped silently.

## Change

Whenever the follower changes from one run identity to another, it resets its cursor to zero before reading the new run.

Following the **same** run preserves the existing cursor, so normal continuation/polling remains replay-efficient.

## Regression

A fake client starts the follower with an old run and cursor 42, switches to a new run, and verifies:

- the first event request uses `afterSequence: 0`;
- sequence 1 is delivered to the UI;
- the follower cursor becomes 1.

## Evidence boundary

This verifies state projection mechanics only. It does not make E07 graphical Desktop acceptance PASS.
