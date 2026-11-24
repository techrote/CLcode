# HOSTLESS-RUN-001

This slice implements the first CLcode-owned agent loop without Claude Code lifecycle hooks.

It intentionally does **not** reimplement GPTopus provider/accounting logic. The live adapter imports `plugins/openai-workers/bridge/server.mjs` and `workers.mjs` from a separately checked-out, pinned GPTopus donor and consumes its existing `create/poll/cancel/page` contract.

## What exists

- persistent run summaries and JSONL event journals;
- controller-owned `spawn`, `status`, `events`, `steer`, `cancel` and `list` operations;
- file-backed cross-process steer/cancel requests;
- principal-model loop with provider continuation IDs and correlated function-call outputs;
- scoped tools:
  - `read_file`;
  - exact-text `edit_file`;
  - fixed `node --test` execution;
  - local-only Git status/diff/commit;
- hard steering can interrupt an in-progress provider response and restart the same model step with the operator instruction;
- deterministic fixture creation and mock-backed end-to-end mechanical tests.

## What is *not* claimed

No live provider call has been executed by this branch, so **E02 remains NOT RUN**. No disposable-PC provider/tool run has executed, so **E06 remains NOT RUN**. The mock-backed tests prove controller mechanics and real local filesystem/process/Git effects only.

## Local mechanical test

```powershell
npm.cmd test
```

or on any Node 20.11+ environment:

```sh
npm test
```


## Long-lived Desktop/backend boundary

The runtime can also run as a newline-delimited JSON service:

```powershell
node .\src\server.mjs --gptopus C:\dev\Chlaude-GPTopus --state C:\dev\clcode-state
```

Send one JSON request per line on stdin and read one JSON response per line on stdout. The Desktop-facing methods are:

- `workers`
- `spawn` — admits a run and returns its durable `runId` without waiting for the coding task to finish
- `status`
- `events` with an `afterSequence` cursor
- `steer` (including `hard: true`)
- `cancel`
- `list`

There is deliberately no blocking `wait` RPC on the wire. A GUI follows a run with `status` and cursored `events`, leaving the same control channel free for steering and cancellation. The service is stdio-only: it opens no TCP listener and its protocol carries no provider key material. Provider credentials remain inside the GPTopus process environment/DPAPI path.

## First live hostless run on the disposable PC

1. Clone CLcode and GPTopus.
2. Pin GPTopus exactly:

```powershell
git -C .\Chlaude-GPTopus checkout --detach 849627463c3e2be660f9d24976320b072c107b34
```

3. Create the failing local fixture:

```powershell
node .\scripts\create-fixture.mjs "$env:USERPROFILE\clcode-lab\fixture-e06"
```

4. Configure an authorized provider using the GPTopus mechanisms. For a first local/no-remote-provider experiment, a tool-capable LM Studio worker can be used if its model is genuinely available. Otherwise use the configured OpenAI/NVIDIA profile intended for the test.
5. List the donor workers through the same bridge CLcode will use:

```powershell
node .\src\cli.mjs workers --gptopus C:\path\to\Chlaude-GPTopus --state "$env:USERPROFILE\clcode-lab\state"
```

6. Start the real run:

```powershell
node .\src\cli.mjs run `
  --gptopus C:\path\to\Chlaude-GPTopus `
  --state "$env:USERPROFILE\clcode-lab\state" `
  --project "$env:USERPROFILE\clcode-lab\fixture-e06" `
  --worker sol6-2 `
  --task "Read src/slug.mjs and test/slug.test.mjs. Fix slugify to pass the existing tests. Run the tests, inspect the diff, and commit locally."
```

Use a worker that is actually configured and authorized on the test machine; `sol6-2` above is only an example.

While a run is active, a second shell can issue:

```powershell
node .\src\cli.mjs list --state "$env:USERPROFILE\clcode-lab\state"
node .\src\cli.mjs steer RUN_ID "Check the punctuation edge case before committing." --state "$env:USERPROFILE\clcode-lab\state"
node .\src\cli.mjs steer RUN_ID "Stop your current approach and re-read the tests." --hard --state "$env:USERPROFILE\clcode-lab\state"
node .\src\cli.mjs cancel RUN_ID --state "$env:USERPROFILE\clcode-lab\state"
```

A live pass requires the real provider request IDs, tool-event chronology, `node --test` exit code, actual Git diff and local commit SHA to be recorded in `docs/EXPERIMENTS.md`. CI or mock success must not be substituted for that evidence.
