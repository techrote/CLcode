# RUNTIME-HARDENING-001 — Windows cancellation and Git commit integrity

**Status:** implemented and mechanically verified. Live Windows/provider acceptance remains pending.

This slice is stacked on **HOSTLESS-RUN-001 / PR #4**. It hardens the first real Read → Edit → Test → commit loop before E06 is attempted on the disposable Windows PC.

## Problems closed

### 1. Dirty-worktree admission

The first runtime could begin against an already-dirty fixture. That makes later attribution ambiguous and risks mixing operator/pre-existing changes with agent work.

The runtime now requires the selected Git worktree to be clean at admission by default:

```text
git status --porcelain=v1 --untracked-files=all
```

If any tracked or untracked change exists, admission is refused before the model/tool loop starts.

The lower-level tool object retains a deliberate `requireClean:false` option for tightly controlled internal/tests only; normal agent admission does not use it.

### 2. Commit ownership

The first runtime's local commit path used broad staging, which could capture an unrelated edit made concurrently during a run.

CLcode now tracks only files changed through `edit_file`.

For every successful edit it records the SHA-256 of the exact resulting bytes. On `git_local {action:"commit"}`:

1. there must be at least one CLcode-edited path;
2. every touched path is re-read and re-hashed;
3. commit is refused if any touched file changed after CLcode's last edit;
4. Git commits only the tracked paths:

```text
git commit --only -m <message> -- <CLcode-edited paths...>
```

No `git add --all` is used.

Unrelated changes created after admission therefore remain outside the CLcode commit.

### 3. Windows child-process cancellation

The original cancellation path could assume terminating the immediate Node test process was enough. On Windows, test runners can have descendants.

The runtime now centralizes a platform termination plan:

- **Windows:** `taskkill /PID <pid> /T /F`
- **non-Windows:** `SIGTERM`

The fixed `run_test` tool uses `process.execPath --test`, captures bounded output, supports timeout/AbortSignal cancellation and invokes the platform process-tree termination path.

This is important for the Desktop Stop button: a cancelled run must not leave a hidden test/process subtree alive.

## Mechanical verification

Runtime-only reconstruction, excluding the stacked Desktop-client files:

```text
11/11 tests pass
0 failed
```

Covered behaviors:

1. pinned GPTopus adapter/paging;
2. hard steering interruption/restart;
3. provider cancellation;
4. cancellation of a running local test process;
5. runtime service status/events;
6. JSONL service boundary;
7. genuine local Read → Edit → Test → commit mechanics;
8. project-root escape rejection;
9. dirty-worktree admission refusal;
10. commit includes only CLcode-edited paths and rejects a touched file changed afterward;
11. Windows process-tree termination plan.

All runtime/source/test `.mjs` files in the reconstructed runtime-only tree passed `node --check`.

The same combined development tree with DESKTOP-CLIENT-001 present passes **22/22 tests**, but the 11-test runtime-only result is the evidence relevant to this PR.

## Remaining Windows evidence

The Windows termination **plan** is unit-tested. Actual `taskkill /T /F` behavior against a live Node test-process tree is still NOT RUN because this development environment is not Windows.

First disposable-PC validation should explicitly:

1. create a test that spawns at least one descendant;
2. start it through CLcode;
3. cancel while active;
4. verify the parent and descendants are gone;
5. verify the run records `cancelled` rather than merely changing UI state.

## Acceptance boundary

This hardening does not change the E-gate status:

- **E02:** NOT RUN — real provider inference without Claude Code.
- **E06:** NOT RUN — real non-Claude principal Read → Edit → Test → commit on the disposable PC.

It reduces the risk and ambiguity of those experiments; it does not substitute for them.
