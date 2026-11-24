# SPECIMEN-HYPOTHESIS-001 — fuse static, ASAR, runtime, launch and integrity evidence

**Status:** read-only evidence-fusion tooling implemented; synthetic multi-source self-test passed. No real Desktop evidence has been fused yet.

This slice follows SPECIMEN-MAP-001, SPECIMEN-LAUNCH-001, SPECIMEN-ASAR-001 and SPECIMEN-ASAR-INTEGRITY-001. Those tools deliberately produce separate evidence artifacts. The first Windows session should not require the operator to manually reconcile five reports before choosing the next bounded experiment.

## Purpose

`Fuse-SpecimenEvidence.mjs` consumes any available subset of:

- ordinary static `map.json`;
- ASAR internal `asar-map.json`;
- runtime `runtime-summary.json`;
- launch `summary.json`;
- ASAR integrity report from `Check-AsarIntegrity.mjs`.

It emits:

- `hypotheses.json` — machine-readable ranked candidates and evidence provenance;
- `HYPOTHESES.md` — compact operator report and first-experiment shortlist.

The tool does **not** choose or apply a patch.

## Two scores, not one

Every candidate receives:

- **evidence score** — how strongly multiple sources point at the candidate;
- **surgery score** — evidence score minus known patchability/risk penalties.

This distinction is intentional. For example:

- a native executable observed by static map + runtime + launch can be a very strong architectural hypothesis while still receiving a signing/update-risk penalty;
- an ASAR member can remain highly relevant while embedded ASAR validation makes direct archive surgery a poor first patch.

## Evidence rules

- `surface` and `asar` are static evidence.
- `runtime` and `launch` are live-process evidence.
- a second behavioral source adds a corroboration bonus.
- runtime endpoint ownership is not treated as proof of application-layer purpose.
- ASAR integrity modifies surgery suitability, not architectural relevance.
- `EnableEmbeddedAsarIntegrityValidation=enabled` strongly penalizes direct ASAR surgery.
- `OnlyLoadAppFromAsar=enabled` adds a further caution because ordinary unpacked-app fallback is unavailable.
- `.exe` candidates receive a signing/update-risk caution rather than being hidden.

A first-experiment candidate must have a high-value category and at least two behavioral evidence sources. ASAR candidates with an enabled integrity barrier are not promoted into the first-experiment shortlist merely because their string score is high.

## Use on the disposable PC

After collecting the component evidence:

```powershell
$fusion = Join-Path $env:USERPROFILE 'clcode-specimen-lab\maps\fusion'
node .\tools\specimen\Fuse-SpecimenEvidence.mjs `
  --surface 'C:\...\desktop-baseline\map.json' `
  --asar 'C:\...\desktop-asar\asar-map.json' `
  --runtime 'C:\...\runtime-...\runtime-summary.json' `
  --launch 'C:\...\launch-...\summary.json' `
  --integrity 'C:\...\asar-integrity.json' `
  --out $fusion
```

Review `HYPOTHESES.md` before creating a surgery experiment. An empty shortlist is a valid result: collect more evidence rather than lowering the multi-source threshold.

## Synthetic verification

Run:

```powershell
node .\tools\specimen\Test-EvidenceFusion.mjs
```

The synthetic test supplies:

- static executable and ASAR candidates;
- runtime process/network ownership;
- launch ancestry and model-selection command-line evidence;
- enforced ASAR integrity.

It verifies that:

- the executable receives surface + runtime + launch support;
- native executable surgery receives a signing/update penalty without losing relevance;
- the ASAR internal principal-model candidate receives an integrity penalty and is withheld from the first-experiment shortlist;
- a launched `claude-code.exe` is represented as an engine/principal-model process candidate;
- the Markdown report exposes the integrity assessment and shortlist.

Local result: **PASS**. Both JavaScript files pass `node --check`.

## Evidence boundary

This is triage tooling only. It cannot prove that a candidate owns a behavior and cannot authorize modifying a proprietary specimen. The first surgery must still be narrow, reversible, hash-pinned and designed to answer one explicit architectural question.
