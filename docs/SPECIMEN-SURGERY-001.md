# SPECIMEN-SURGERY-001 — hash-guarded reversible Desktop specimen patches

**Status:** implementation complete; synthetic apply/rollback self-test passes. No real Desktop Code specimen has been modified by this slice.

This work is stacked on **SPECIMEN-MAP-001 / PR #6** and **SPECIMEN-LAB-001 / PR #3**. Its purpose is to turn one bounded surgery hypothesis into a reproducible, reversible experiment rather than a manual edit.

## Design rule

A specimen modification is accepted only when all of these are true:

1. the target is a relative path inside the chosen specimen root;
2. the resolved target remains inside that root, including through parent-directory symlinks;
3. the target's current SHA-256 exactly matches the patch specification;
4. every replacement has an explicit expected occurrence count;
5. the dry-run computes a different expected output hash;
6. applying creates an external lab backup and receipt;
7. the post-write target hash matches the dry-run hash;
8. rollback is refused unless the live target still matches the receipt's post-patch hash and the backup still matches the pre-patch hash.

The tool therefore fails closed if the installed build changes, another edit touches the same target, or the patch specification no longer describes the bytes being modified.

## Tools

### `New-SpecimenPatchSpec.mjs`

Creates a patch-spec template from the **actual current target file** and records its SHA-256.

Example:

```powershell
node .\tools\specimen\New-SpecimenPatchSpec.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --target 'resources\candidate.js' `
  --out "$env:USERPROFILE\clcode-specimen-lab\experiments\exp-001\patch.json"
```

The generated template contains placeholders. Edit the replacement only after the specimen map/runtime evidence identifies a precise hypothesis.

### `Apply-SpecimenPatch.mjs`

Default behavior is **dry-run**:

```powershell
node .\tools\specimen\Apply-SpecimenPatch.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --spec "$env:USERPROFILE\clcode-specimen-lab\experiments\exp-001\patch.json" `
  --lab "$env:USERPROFILE\clcode-specimen-lab"
```

The dry-run returns JSON containing:

- target;
- pre-patch SHA-256;
- predicted post-patch SHA-256;
- byte lengths;
- exact replacement counts;
- patch mode.

It writes nothing.

Apply only after the dry-run is reviewed:

```powershell
node .\tools\specimen\Apply-SpecimenPatch.mjs `
  --root 'C:\Path\To\Pinned\Desktop\Install' `
  --spec "$env:USERPROFILE\clcode-specimen-lab\experiments\exp-001\patch.json" `
  --lab "$env:USERPROFILE\clcode-specimen-lab" `
  --apply
```

The command prints the path to `receipt.json`.

A patch directory contains:

- `original.bin` — exact pre-patch target bytes;
- `patch-spec.json` — the exact applied specification;
- `receipt.json` — before/after hashes, sizes, replacement results, backup path, spec hash and timestamp.

These stay in the local specimen lab and are not committed by default.

### `Rollback-SpecimenPatch.mjs`

Rollback accepts either the receipt path or its containing patch directory:

```powershell
node .\tools\specimen\Rollback-SpecimenPatch.mjs `
  'C:\Users\YOU\clcode-specimen-lab\patches\...\receipt.json'
```

Rollback refuses when:

- the patch was already rolled back;
- the target or backup is missing;
- the target is no longer within the recorded specimen root;
- the backup is outside the receipt directory;
- the live target hash differs from `afterSha256`;
- the backup hash differs from `beforeSha256`.

On success it verifies the restored target hash and records `rolledBackAtUtc` plus `rollback.json`.

## Patch modes

### UTF-8 text

```json
{
  "schemaVersion": 1,
  "id": "principal-model-probe",
  "target": "resources/candidate.js",
  "expectedSha256": "<exact current target SHA-256>",
  "mode": "utf8-text",
  "note": "One hypothesis only",
  "replacements": [
    {
      "old": "EXACT OLD TEXT",
      "new": "EXACT NEW TEXT",
      "expectedCount": 1
    }
  ]
}
```

The target must round-trip losslessly as UTF-8. Length-changing replacements are allowed.

### Binary exact

```json
{
  "schemaVersion": 1,
  "id": "binary-probe",
  "target": "candidate.bin",
  "expectedSha256": "<exact current target SHA-256>",
  "mode": "binary-exact",
  "replacements": [
    {
      "oldBase64": "<bytes>",
      "newBase64": "<same-length bytes>",
      "expectedCount": 1
    }
  ]
}
```

Binary replacements must have equal byte length. This intentionally avoids an implicit binary-layout rewrite.

## Self-test

Run before any real specimen edit:

```powershell
node .\tools\specimen\Test-SpecimenPatch.mjs
```

The synthetic suite currently verifies:

- dry-run changes no bytes;
- exact SHA gate;
- UTF-8 apply and receipt creation;
- backup hash matches pre-patch target;
- post-write hash matches predicted output;
- clean rollback restores exact bytes;
- wrong baseline SHA is refused;
- path escape is refused;
- ambiguous replacement count is refused;
- equal-length binary patch + rollback;
- patch-spec template generation.

The implementation also resolves the target's real path, preventing a parent-directory symlink from redirecting a nominally in-root target outside the specimen root.

## Intended first real use

Do **not** begin by patching every model/auth string found by SPECIMEN-MAP-001.

Instead:

1. capture the untouched specimen baseline;
2. map static control-surface candidates;
3. observe a normal Desktop Code task;
4. correlate the active process tree with candidate files;
5. choose one smallest architectural question;
6. create a surgery experiment ledger entry;
7. create a hash-pinned patch spec;
8. dry-run it;
9. apply one reversible change;
10. run one controlled observation;
11. capture the post-change specimen;
12. compare;
13. record the finding;
14. rollback unless the next experiment deliberately needs the modified state.

A negative result is useful: “changing this candidate did not alter principal-model selection” removes a branch from the search space.

## Evidence boundary

A successful patch proves only that the exact specified bytes changed and can be restored. It does **not** prove those bytes own the behavior under investigation.

Behavioral evidence comes from a controlled before/after observation tied to one change, with the baseline/post-change hashes and patch receipt preserved locally.

No proprietary specimen artifact is part of this repository.
