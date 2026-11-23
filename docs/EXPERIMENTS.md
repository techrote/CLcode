# CLcode — experiments and evidence log

**Evidence status: NO CLCODE EXPERIMENTS HAVE BEEN RUN.** This file defines repeatable trials and a record-keeping convention. Do not mark a scenario PASS from source inspection, successful mocks, a status panel, or speculation.

The target is **CLcode Desktop Code**. CLI and GPTopus web-panel trials are stepping stones, not final-product acceptance.

## Experimental controls

- **Hardware:** separate disposable Windows development PC; record OS build, available CPU/GPU/RAM, Node version, browser, and installed components.
- **Repository identity:** always record the exact `techrote/CLcode` commit and the exact `techrote/Chlaude-GPTopus` commit; do not rely on an evolving branch name.
- **Stock Claude protection:** no changes to the owner's stock Claude Desktop or its configuration; the disposable PC initially has no Claude Code installation.
- **Credentials:** use scoped test keys, never paste secret values or token-bearing localhost URLs into this file, issues, commits or logs.
- **External effects:** use a throwaway fixture repo, and keep external GitHub pushes out of the initial coding loop.
- **Fidelity:** explicitly label `mock`, `live provider`, `live tool execution` and `interactive desktop UI`. A mock cannot qualify a real acceptance gate.
- **Accounting:** record provider/model/processing tier, errors, estimated tokens/cost and any difference from provider-reported usage.
- **Network:** note whether Anthropic inference endpoints were reached, and how that was observed. An empty application log alone is insufficient evidence of zero network calls.
- **Recovery:** distinguish whether a run ended, was cancelled, remained recoverable, or was orphaned.
- **Failure handling:** a negative result is useful. Preserve minimal logs and a reproduction; avoid adding permanent CI machinery in response.

## Initial trial cards

| ID | Name | Status | Objective |
| --- | --- | --- | --- |
| E01 | GPTopus standalone configuration | NOT RUN | Start, configure, save and reopen the local web deck without Claude |
| E02 | Standalone provider inference | NOT RUN | Real model call independent of Claude session/host |
| E03 | Independent worker spawning | NOT RUN | Create a new worker from UI/controller, not just steer one already alive |
| E04 | Live steering and cancellation | NOT RUN | Operator control of an independently owned run |
| E05 | Restart recovery | NOT RUN | Crash/restart without silently losing authoritative run state |
| E06 | Real agentic coding loop | NOT RUN | Model Read → Edit → Test → local Git commit in fixture repo |
| E07 | Desktop Code interaction | NOT RUN | Complete the same loop through the actual CLcode desktop workspace |
| E08 | Anthropic network independence | NOT RUN | Observe zero Anthropic inference calls during E07 |
| E09 | Host quota experiment (optional) | NOT RUN | Compare native slash command availability with exhausted Claude quota |
| E10 | Capability boundary negative test | NOT RUN | Reject out-of-scope tool/secret access while allowing scoped development |

### E01: standalone configuration panel

Reference (not pinned): GPTopus `ultra/004-integration`, `plugins/openai-workers/scripts/oai-config.mjs`.

Possible initial procedure **after recording the exact commit**:

```powershell
git clone https://github.com/techrote/Chlaude-GPTopus.git
cd Chlaude-GPTopus
git checkout <recorded-commit-sha>
node plugins/openai-workers/scripts/oai-config.mjs --no-open
```

Use the locally printed access-token URL **only on the machine**, then confirm that the interface loads, a nonsecret setting can be changed and persisted, and the server can be stopped/restarted. Do not paste the URL or keys into an issue. Record whether dependencies work without any Claude Code installation.

**E01 is PASS only if the live panel operates from the standalone process with no Claude Code runtime; it does not establish independent inference or spawning.**

### E02–E05: independent worker control

Start from the smallest provider adapter and supervisor that can run without Claude host hooks. Observe real provider calls, run identifiers, steer delivery, cancellation and durable state. Use a tiny local controller/client first; add a web/desktop control affordance only as it becomes necessary for the experiment.

**E03 must prove a *new* run can be created when Claude is absent.** `/oai:s` and the existing web steering queue merely sending a tip to an already-running worker do not qualify.

### E06: real coding tool loop

Create an intentionally trivial local fixture repo with an easily testable change. The chosen model must genuinely decide to inspect, edit and test through tool calls; the supervisor may not hard-code the edit or replay a mock response. Capture the actual changed files, tests, local commit and error/retry behavior.

### E07–E08: interactive desktop acceptance

Run the exact E06 task from the CLcode desktop Code workspace with visible session/project navigation, live tool results, diffs and model selection. Observe process/network activity to verify there were no Anthropic inference requests. A browser-only settings page or terminal-only proof does not pass.

### E09: optional Anthropic quota experiment

Only when a real quota limit occurs naturally: record whether `/oai:s`, `/oai:run` and `/oai:config` still dispatch in the original Claude Code host, and separately whether the standalone Node panel works. Do not interpret the results as permission to bypass account enforcement; CLcode must function independently of Claude's quota state by design.

### E10: capability negative test

Attempt to access a file outside the fixture allowlist, send a request to an unapproved network destination, and request an unauthorized remote Git write. All should fail without preventing in-scope Read/Edit/Test operations. Never use real sensitive data for these tests.

## Result entry template

Copy this subsection once per actual trial:

```markdown
### E0X — <short title> — <UTC timestamp>

**Status:** PASS | FAIL | PARTIAL | BLOCKED | NOT RUN
**Fidelity:** mock | live provider | real tool execution | interactive desktop
**Machine/OS:** ...
**CLcode commit:** ...
**GPTopus commit:** ...
**Desktop specimen/version (if used):** ...
**Model/provider/tier:** ...
**Secret scope:** test-only / not applicable (never record values)
**Procedure:** ...
**Expected:** ...
**Observed:** ...
**Anthropic inference calls:** zero | nonzero | not measured; observation method: ...
**Tool/agent trace:** ...
**Cost/usage:** ...
**Unexpected effects:** ...
**Recovery/cancellation:** ...
**Artifacts (sanitized, SHA/path/URL):** ...
**Decision / next smallest experiment:** ...
```

## Viability decision record

Do not claim `CLCODE-BOOT-001` completion until **E07 and E08 both pass**, with E06's real coding loop demonstrated and with an independently installed/reproducible CLcode desktop on the disposable PC. If a proprietary desktop transplant proves untenable, test an independent desktop shell without changing the acceptance criteria.

**Decision:** UNDECIDED — no live experiments recorded yet.
