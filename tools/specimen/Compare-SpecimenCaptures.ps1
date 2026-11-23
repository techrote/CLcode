#requires -Version 5.1
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)][string]$Before,
    [Parameter(Mandatory=$true)][string]$After,
    [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-Capture {
    param([Parameter(Mandatory=$true)][string]$Path)
    $full = [IO.Path]::GetFullPath($Path)
    if (Test-Path -LiteralPath $full -PathType Leaf) {
        if ([IO.Path]::GetFileName($full) -ne 'manifest.json') { throw "Expected a capture directory or manifest.json: $Path" }
        $full = Split-Path -Parent $full
    }
    $manifestPath = Join-Path $full 'manifest.json'
    $filesPath = Join-Path $full 'files.csv'
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Missing manifest.json in $full" }
    if (-not (Test-Path -LiteralPath $filesPath -PathType Leaf)) { throw "Missing files.csv in $full" }
    return [ordered]@{
        directory = $full
        manifest = (Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json)
        files = @(Import-Csv -LiteralPath $filesPath)
    }
}

function To-Map {
    param([object[]]$Rows)
    $map = @{}
    foreach ($row in $Rows) {
        $key = '{0}|{1}' -f $row.Root, $row.RelativePath
        $map[$key] = $row
    }
    return $map
}

$beforeCapture = Resolve-Capture -Path $Before
$afterCapture = Resolve-Capture -Path $After
$beforeMap = To-Map -Rows $beforeCapture.files
$afterMap = To-Map -Rows $afterCapture.files

if (-not $OutputDirectory) {
    $base = Split-Path -Parent $afterCapture.directory
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    $OutputDirectory = Join-Path $base ("compare-$stamp")
}
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null

$allKeys = @($beforeMap.Keys + $afterMap.Keys | Sort-Object -Unique)
$changes = foreach ($key in $allKeys) {
    $b = $beforeMap[$key]
    $a = $afterMap[$key]
    if (-not $b) {
        [PSCustomObject]@{ Change='Added'; Root=$a.Root; RelativePath=$a.RelativePath; BeforeLength=$null; AfterLength=$a.Length; BeforeSHA256=$null; AfterSHA256=$a.SHA256 }
        continue
    }
    if (-not $a) {
        [PSCustomObject]@{ Change='Removed'; Root=$b.Root; RelativePath=$b.RelativePath; BeforeLength=$b.Length; AfterLength=$null; BeforeSHA256=$b.SHA256; AfterSHA256=$null }
        continue
    }
    if ($b.Length -ne $a.Length -or $b.SHA256 -ne $a.SHA256) {
        [PSCustomObject]@{ Change='Changed'; Root=$a.Root; RelativePath=$a.RelativePath; BeforeLength=$b.Length; AfterLength=$a.Length; BeforeSHA256=$b.SHA256; AfterSHA256=$a.SHA256 }
    }
}
$changes = @($changes)
$changes | Export-Csv -LiteralPath (Join-Path $OutputDirectory 'file-changes.csv') -NoTypeInformation -Encoding UTF8

$summary = [ordered]@{
    schemaVersion = 1
    createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    beforeCaptureId = $beforeCapture.manifest.captureId
    afterCaptureId = $afterCapture.manifest.captureId
    beforeDirectory = $beforeCapture.directory
    afterDirectory = $afterCapture.directory
    added = @($changes | Where-Object Change -eq 'Added').Count
    removed = @($changes | Where-Object Change -eq 'Removed').Count
    changed = @($changes | Where-Object Change -eq 'Changed').Count
    totalDifferences = $changes.Count
    changesCsv = 'file-changes.csv'
}
$summary | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'summary.json') -Encoding UTF8

Write-Host "Compared $($beforeCapture.manifest.captureId) -> $($afterCapture.manifest.captureId)"
Write-Host "Added: $($summary.added)  Removed: $($summary.removed)  Changed: $($summary.changed)"
Write-Host "Output: $OutputDirectory"
