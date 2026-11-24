# RUNTIME-ADMISSION-001 — truthful slow admission

**Status:** source-level hardening for the FIRST-WINDOWS-001 stack. No Windows/provider acceptance claim.

## Problem

The original JSONL runtime service waited a fixed two seconds for `RunController.spawn()` to publish a durable run summary. If local Git/provider initialization took longer, the RPC returned an error even though the same async task was still running. It could then publish a live run after the caller had been told that spawn failed.

The Desktop process client also applied its generic request timeout to `spawn`, creating a second route to the same false-negative/orphan condition.

A minimal delayed-controller reproduction produced:

```text
client error: Run R12345678 did not reach admission state within 20ms.
later status: { runId: 'R12345678', status: 'running' }
```

This violates the core evidence rule: a control response must not claim failure while the controlled run can later become live.

## Change

- `RuntimeService.start()` no longer uses an arbitrary admission deadline. It waits until either:
  - a durable run summary exists; or
  - the underlying spawn task actually resolves/rejects.
- `RuntimeProcessClient.request()` disables the generic timeout for `spawn` by default, because admission already has bounded local operations and must not be abandoned client-side.
- Callers may still request an **explicit** spawn timeout with `{ timeoutMs: N }` when they intentionally accept that behavior.
- Added service/client regression coverage for delayed admission.

The long-running **agent task remains asynchronous after admission**. This change does not make `spawn` wait for the coding run to finish; it only waits for the durable admission boundary that the protocol already promises.

## Evidence boundary

The regression is deterministic and platform-independent. It removes one known false-failure mode before physical Windows evaluation.

Still NOT RUN here:

- Windows filesystem/antivirus latency;
- real GPTopus provider loading and E02;
- real non-Claude E06;
- actual Desktop specimen integration.

Those remain FIRST-WINDOWS-001 evidence tasks.
