# DESKTOP-CLIENT-001 — runtime process client and UI projection

**Status:** implemented and mechanically tested; no graphical Desktop acceptance claimed.

This slice is stacked on [HOSTLESS-RUN-001](HOSTLESS-RUN-001.md). It establishes the narrow boundary that a CLcode desktop shell—or a modified Desktop Code specimen—can use to control the independent principal-agent runtime without importing GPTopus, provider credentials or tool-execution code into the renderer.

## Boundary

```text
Desktop / modified Code renderer
        |
        | UI-safe state + operator intent
        v
RunFollower + run-view-model
        |
        | correlated JSONL requests
        v
RuntimeProcessClient
        |
        | stdin/stdout only
        v
CLcode runtime service
        |
        v
principal agent / scoped tools / GPTopus provider bridge
```

The runtime service remains the authority for run state and tool effects. The desktop client is a consumer/controller, not a second scheduler.

## RuntimeProcessClient

`src/desktop/runtime-client.mjs`:

- launches the CLcode runtime service as a child process with `shell: false`;
- correlates concurrent requests by numeric request ID;
- supports out-of-order replies;
- applies per-request timeouts;
- treats non-JSON stdout as protocol corruption;
- converts structured runtime errors into `RuntimeProtocolError`;
- rejects all pending requests if the runtime process exits;
- keeps runtime stderr separate from the JSONL protocol;
- shuts the child down gracefully, then terminates it if needed.

The transport carries no provider API keys. Credentials remain inside the runtime/GPTopus environment.

## RunFollower

`RunFollower` provides the minimum run-oriented behavior a UI needs:

- `spawnAndFollow(params)`;
- `follow(runId)`;
- cursored event reads;
- status polling;
- soft/hard steering;
- cancellation.

A terminal status triggers **one final event drain** before returning. This closes a real race found during testing: the runtime can persist `run.completed` after the client's preceding event poll but before the status request observes terminal state.

## UI projection

`src/desktop/run-view-model.mjs` reduces runtime status/events into provider-neutral UI state:

- principal model steps and response IDs;
- paired tool request/completion cards;
- active/failed/cancelled tool state;
- steering received/delivered state;
- accumulated provider-reported token usage and estimated cost;
- terminal answer/reason;
- ordered timeline;
- current phase/status;
- event cursor.

The reducer is replay-safe: events at or below the consumed sequence are ignored.

It also tracks two distinct sequence notions:

- **lastSequence** — highest event actually consumed by the UI;
- **highestSeenSequence** — highest sequence advertised by runtime status.

Status polling therefore never silently advances the event cursor.

If a received event skips a sequence, `gapDetected` and `gaps` are populated. A UI can then refresh/replay rather than presenting incomplete state as authoritative.

## Mechanical verification

Local verification after this slice:

- **17/17 Node tests pass**;
- **18 JavaScript modules pass `node --check`**.

Desktop-specific coverage includes:

1. concurrent out-of-order JSONL reply correlation;
2. event following through terminal state;
3. final-event drain race;
4. steer/cancel against the active run ID;
5. structured runtime errors;
6. pending-request rejection on runtime process exit;
7. model/tool event projection;
8. usage/cost accumulation;
9. replay deduplication;
10. event-gap detection;
11. steering receive/deliver projection;
12. status overlay without cursor corruption;
13. tool-failure and terminal-failure visibility.

These are mechanical tests. **No Electron/Claude Desktop UI has been run by this slice.**

## Next desktop slice

The next useful layer is a very small graphical host that:

1. starts one `RuntimeProcessClient`;
2. lists configured workers;
3. selects a fixture project;
4. starts one run;
5. renders `publicRunView()`;
6. provides steer, hard-steer and cancel;
7. shows tool/model/timeline state without renderer filesystem privileges.

That shell should consume only the client/view-model interface above. It should not directly access GPTopus or the scoped tool executor.

For the eventual specimen transplant, the same contract can be bridged into the existing Desktop Code UI if that proves more practical than retaining a separate development shell.
