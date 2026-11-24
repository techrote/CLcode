#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$LabRoot = (Join-Path $env:USERPROFILE 'clcode-specimen-lab'),
    [Parameter(Mandatory=$true)][string]$Title,
    [Parameter(Mandatory=$true)][string]$BaselineCapture,
    [Parameter(Mandatory=$true)][string]$Objective,
    [string]$ExpectedChange = '',
    [string]$CLcodeCommit = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$baseline = [IO.Path]::GetFullPath($BaselineCapture)
if (Test-Path -LiteralPath $baseline -PathType Leaf) { $baseline = Split-Path -Parent $baseline }
$manifestPath = Join-Path $baseline 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    throw "BaselineCapture must contain manifest.json: $baseline"
}
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

$slug = ($Title.ToLowerInvariant() -replace '[^a-z0-9]+','-').Trim('-')
if (-not $slug) { $slug = 'experiment' }
if ($slug.Length -gt 48) { $slug = $slug.Substring(0,48).Trim('-') }

$experiments = Join-Path $LabRoot 'experiments'
New-Item -ItemType Directory -Force -Path $experiments | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$experimentId = 'exp-{0}-{1}-{2}' -f $stamp, ([Guid]::NewGuid().ToString('N').Substring(0,8)), $slug
$out = Join-Path $experiments $experimentId
New-Item -ItemType Directory -Force -Path $out | Out-Null

$record = [ordered]@{
    schemaVersion = 1
    experimentId = $experimentId
    createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    status = 'planned'
    title = $Title
    objective = $Objective
    expectedChange = $ExpectedChange
    baselineCaptureId = $manifest.captureId
    baselineDirectory = $baseline
    clcodeCommit = $CLcodeCommit
    modificationLedger = @()
    observations = @()
    result = $null
}
$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $out 'experiment.json') -Encoding UTF8

$notes = @"
# $Title

**Experiment ID:** $experimentId  
**Baseline:** $($manifest.captureId)  
**Created (UTC):** $($record.createdAtUtc)  

## Objective

$Objective

## Expected change

$ExpectedChange

## Planned modification

Describe exactly one modification before applying it.

## Procedure

1. Record the exact file/process/configuration target.
2. Record a rollback path.
3. Apply one bounded change.
4. Run the smallest observation that answers the objective.
5. Capture a post-change baseline and compare hashes.
6. Record result as CONFIRMED, NEGATIVE, INCONCLUSIVE or BLOCKED.

## Modification ledger

| UTC | Target | Before | Change | Rollback | Result |
| --- | --- | --- | --- | --- | --- |

## Observations

Record process IDs, UI behavior, network destinations and errors without secrets.

## Result

**Status:** PLANNED

**Finding:** 

**Next smallest experiment:** 
"@
$notes | Set-Content -LiteralPath (Join-Path $out 'NOTES.md') -Encoding UTF8

Write-Host "CLcode surgery experiment: $experimentId"
Write-Host "Output: $out"
