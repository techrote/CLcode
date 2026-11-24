# SPECIMEN-EXPERIMENT-PACKET-001 — bind fused evidence to a captured surgery target

**Status:** packet generator implemented; synthetic packet self-test PASS. No real Desktop specimen packet has been generated.

This slice joins two previously separate specimen tracks:

- **SPECIMEN-HYPOTHESIS-001 / PR #19** — ranks multi-source evidence and produces a first-experiment shortlist.
- **SPECIMEN-SURGERY-001 / PR #7** — applies and rolls back exact hash-pinned specimen changes.

The branch has both as real merge parents. The purpose is to remove the manual path/hash transcription step between “this is the strongest hypothesis” and “this is the exact captured file we are prepared to dry-run a patch against.”

## What the packet generator does

`tools/specimen/Prepare-SurgeryExperiment.mjs` consumes:

- `hypotheses.json` from evidence fusion;
- a specimen baseline capture directory (or its `manifest.json`);
- one explicit objective;
- either an explicit candidate ID/path or a rank from the eligible shortlist.

It then:

1. requires the candidate to be `firstExperimentEligible`;
2. refuses ASAR-member candidates because ordinary file patching is not an archive-level integrity strategy;
3. requires a baseline capture with file hashes enabled;
4. binds the selected candidate to **exactly one** baseline `files.csv` row;
5. rejects baseline hash errors or missing SHA-256 evidence;
6. rejects a fused candidate SHA that disagrees with the captured baseline;
7. emits a packet bound to the exact root, relative path and SHA-256;
8. creates a guarded `patch.json` skeleton compatible with `Apply-SpecimenPatch.mjs`;
9. writes operator instructions for dry-run → one observation → recapture/compare → rollback.

It does **not** modify the specimen and does not authorize applying a patch.

## Upstream fusion metadata

This slice extends `Fuse-SpecimenEvidence.mjs` so fused candidates preserve the target metadata needed for safe handoff:

- ordinary files: `root`, `relativePath`, `fullPath`, `sha256`, `size`;
- ASAR members: `archiveRelativePath`, `memberPath`, `memberSha256`.

The evidence-fusion regression now asserts those fields survive fusion.

## Use on the disposable PC

After baseline capture and evidence fusion:

```powershell
$packet = Join-Path $env:USERPROFILE 'clcode-specimen-lab\experiments\exp-001'

node .\tools\specimen\Prepare-SurgeryExperiment.mjs `
  --hypotheses "$env:USERPROFILE\clcode-specimen-lab\maps\fusion\hypotheses.json" `
  --baseline "$env:USERPROFILE\clcode-specimen-lab\captures\baseline-..." `
  --rank 1 `
  --objective 'Determine whether this candidate controls principal-model selection before the embedded agent loop starts.' `
  --out $packet
```

Outputs:

- `experiment.json` — evidence provenance + baseline capture identity + exact target binding;
- `patch.json` — hash-pinned patch skeleton with deliberately unusable placeholders;
- `PACKET.md` — procedure, cautions and dry-run command.

Review the packet and edit **one** replacement in `patch.json`. The placeholders intentionally fail closed until replaced.

Then dry-run:

```powershell
node .\tools\specimen\Apply-SpecimenPatch.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --spec (Join-Path $packet 'patch.json')
```

Do not add `--apply` until the exact replacement count and predicted output hash are understood.

## Fail-closed behavior

Packet generation refuses:

- a candidate not marked `firstExperimentEligible`;
- a shortlist rank that does not exist;
- a blank/whitespace objective;
- an ASAR-member target;
- a baseline captured with `-SkipFileHashes`;
- zero or multiple matching baseline file rows;
- baseline rows with hash errors or invalid SHA-256;
- a fused candidate SHA that disagrees with the baseline capture;
- unsafe relative paths.

This means a newer/reinstalled specimen or stale evidence cannot silently become a patch target.

## Synthetic verification

Executed locally against the exact packet generator/test bytes:

```text
CLcode surgery experiment packet self-test: PASS
```

The test verifies:

- happy-path packet + patch skeleton generation;
- baseline capture ID propagation;
- exact SHA binding;
- stale fused SHA refusal;
- ineligible candidate refusal;
- whitespace-only objective refusal;
- ASAR-member refusal.

The packet generator and its test both pass `node --check`.

The updated evidence-fusion regression was added to pin target-metadata preservation, but that updated full fusion test has not been rerun in this chat environment. FIRST-WINDOWS-001 remains the canonical aggregate preflight.

## Evidence boundary

A generated packet proves only that a shortlisted hypothesis has been bound reproducibly to one captured file/hash. It does not prove the candidate owns the behavior and it does not make the modification safe or useful.

Behavioral proof still requires one controlled before/after experiment, post-change capture/comparison and an explicit result. Negative results remain useful.
