# RUNTIME-SERIAL-QUALIFICATION-001

Scope: PR #37 is the sole runtime qualification overlay. It descends from #34 and #36; no new PR or branch is needed. Do not merge or move FIRST-WINDOWS-001 (#10) automatically.

## Serial evidence (exact checkouts)

| Revision | Actions run | Tests | Result |
| --- | --- | --- | --- |
| 10f249ffeffbf5d8562aed1d53cda0b7029105cb | 45451670748 | 51/53 | reproduced fsmonitor execution in index probes |
| 73ad622943a1ccb5c718f5a54c435226830944c3 | 45451895402 | 53/53 | corrected |
| 1c2d2aa2e1466bf0374c1b295ca4939ad17c4ad7 | 45452344361 | 53/65 | 12 new integrated negative controls |
| fd73f9d0f719acff57c68044d355811daff1c997 | 45452859885 | 65/65 | corrected |
| da1b1e1367ef293ad1f9a871bc594fec2135244b | 45453410836 | 65/71 | six new integrated negative controls |
| 3320f10db6df3ec5949475dd1a609f7f9a9f9a26 | 45453728373 | 71/71 | corrected |

Actions logs: https://github.com/techrote/CLcode/actions

The subsequent qualification commit extends the suite with an actual process crash, real JSONL client/service/controller/mock-provider/tool/Git round trip and real subprocess credential isolation. Linux runs before hosted native Windows. Record final exact HEAD and results in the PR discussion; do not infer a pass from this document.

## Conservative qualification policies

- Admission acknowledgement belongs to the controller which actually persisted it; a foreign or persisted running record is not evidence of local liveness.
- An exclusive per-worktree lease in the actual Git directory prevents concurrent CLcode admissions across state directories. Unknown provider/tool or journal outcomes retain the lease. No PID-only reclamation, auto-resume or auto-replay.
- On interruption, inspect the lease owner, original state directory, summary, durable events, request/response identity, actual upstream usage and cancellation, process descendants and Git state. Only the operator may authorize release after confirming there is no remaining live effect. Do not delete historical evidence; unresolved summaries in the same state directory continue to block admission. A fresh state directory is not a reconciliation mechanism.
- maxSteps bounds total attempts, including hard steering. Delivery is acknowledged only upon provider acceptance; late results cannot be reported as on-budget completions.
- File ownership is based on admitted tracked bytes; independent edits and untracked edits are not absorbed. Eligible files are bounded at 512 KB per file and 256 MB aggregate. Local commits use a private intended-byte snapshot and verify parent/path/content, with LF/CRLF normalization tolerated. Unknown commit effects stop execution.
- Provider response and tool call identities must be unambiguous before execution. Journal failure during a live tool triggers termination and joining of the process.
- All project/donor Git probes suppress fsmonitor; configured external filters are refused. Cached donor checks are repeated before new requests.
- Process cancellation uses POSIX process groups or native Windows taskkill with its result recorded; failure to establish termination is not treated as confirmed.

## Remaining qualification boundaries

Mock-provider mechanical passes are not live-provider E02/E04/E06 acceptance or a pass on the owner's disposable Windows PC. No paid provider was contacted. Retain GPTopus pin 849627463c3e2be660f9d24976320b072c107b34; verify actual response identity, continuation, cancellation and billing against the pinned donor during controlled live qualification. Its ledger can release reservations for failed/cancelled responses lacking usage; this does not prove zero upstream cost. Do not enable unattended paid execution without reconciliation.

These tests do not establish a general OS/network sandbox, arbitrary hostile or detached child-process containment, power-loss durability, or protection against all concurrent hostile same-user filesystem changes. The owner must use a trusted donor checkout; Git verification is not a cryptographic audit of all ignored or dynamically loaded code. Native path aliases/reparse-point edge cases and real Desktop/Windows operational behavior still need owner qualification. Provider create/poll promises can remain outstanding until their transport responds; stopping local progression is not a claim of instant remote cancellation.

FIRST-WINDOWS-001 handoff: select only an exact #37 head that passed the complete serial suite, record its SHA and CI evidence, preserve the existing evaluator's other component pins, and run disposable-PC/live gates explicitly. Do not label live gates passed on mock evidence.

The branch-scoped, read-only hosted qualification workflow was added solely to establish exact-checkout evidence because the local agent environment cannot clone the repository. It uses no real provider credentials or live requests.
