# RUNTIME-ADMISSION-HARDENING-002 — no client-abandoned spawn

**Status:** protocol-integrity follow-up. No Windows/provider acceptance claim.

## Finding

RUNTIME-ADMISSION-001 removed the service-side fixed admission deadline and made the Desktop client's default `spawn` request unbounded until authoritative admission or failure.

It still allowed callers to supply an explicit client-side `timeoutMs` for `spawn`. That is unsafe with the current JSONL protocol: timing out the client request does **not** cancel the server's in-flight `RuntimeService.start()` task. The same run may therefore be admitted after the caller has already received a timeout.

That reintroduces the exact false-failure/orphan semantic that RUNTIME-ADMISSION-001 was designed to remove.

## Change

`RuntimeProcessClient.request('spawn', ...)` now rejects any non-null explicit client timeout **before writing the request**.

Spawn therefore has one truthful outcome contract:

- return a durable admitted/terminal run summary; or
- return the underlying authoritative admission failure.

Other RPC methods retain the normal configurable request timeout, including `null` for callers that intentionally want no timeout.

A future protocol may add request cancellation/abandon semantics. Until then, a client-side spawn deadline cannot be made authoritative and is deliberately unsupported.

## Regression

The Desktop-client regression still proves that a delayed spawn outlives the generic request timeout, and now verifies that an explicit spawn timeout is rejected rather than abandoning a live server operation.

## Evidence boundary

Deterministic protocol hardening only. Real Windows/provider admission remains FIRST-WINDOWS-001 work.
