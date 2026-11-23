#requires -Version 5.1
[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$toolDir = $PSScriptRoot
$scripts = @(Get-ChildItem -LiteralPath $toolDir -Filter '*.ps1' -File | Where-Object Name -ne 'Test-SpecimenTooling.ps1')

foreach ($script in $scripts) {
    $tokens = $null
    $errors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile($script.FullName, [ref]$tokens, [ref]$errors)
    if ($errors.Count) {
        $detail = ($errors | ForEach-Object { "$($_.Extent.StartLineNumber):$($_.Extent.StartColumnNumber) $($_.Message)" }) -join [Environment]::NewLine
        throw ('PowerShell parse failure in {0}:{1}{2}' -f $script.Name, [Environment]::NewLine, $detail)
    }
}

$temp = Join-Path ([IO.Path]::GetTempPath()) ('clcode-specimen-tool-test-' + [Guid]::NewGuid().ToString('N'))
$lab = Join-Path $temp 'lab'
$fake = Join-Path $temp 'fake-specimen'
$compare = Join-Path $temp 'compare'

try {
    New-Item -ItemType Directory -Force -Path $fake | Out-Null
    Set-Content -LiteralPath (Join-Path $fake 'engine.bin') -Value 'alpha' -Encoding ASCII
    New-Item -ItemType Directory -Force -Path (Join-Path $fake 'resources') | Out-Null
    Set-Content -LiteralPath (Join-Path $fake 'resources\ui.dat') -Value 'ui-v1' -Encoding ASCII

    & (Join-Path $toolDir 'Capture-SpecimenBaseline.ps1') -LabRoot $lab -InstallRoot $fake -DisableAutoDiscovery
    $captures = @(Get-ChildItem -LiteralPath (Join-Path $lab 'captures') -Directory | Sort-Object Name)
    if ($captures.Count -ne 1) { throw "Expected one baseline capture; found $($captures.Count)." }
    $before = $captures[0].FullName

    & (Join-Path $toolDir 'New-SurgeryExperiment.ps1') -LabRoot $lab -Title 'synthetic principal path' -BaselineCapture $before -Objective 'Exercise local experiment ledger.'
    $experiments = @(Get-ChildItem -LiteralPath (Join-Path $lab 'experiments') -Directory)
    if ($experiments.Count -ne 1) { throw "Expected one experiment ledger; found $($experiments.Count)." }

    Set-Content -LiteralPath (Join-Path $fake 'engine.bin') -Value 'beta' -Encoding ASCII
    Set-Content -LiteralPath (Join-Path $fake 'resources\new.dat') -Value 'new' -Encoding ASCII

    & (Join-Path $toolDir 'Capture-SpecimenBaseline.ps1') -LabRoot $lab -InstallRoot $fake -DisableAutoDiscovery
    $captures = @(Get-ChildItem -LiteralPath (Join-Path $lab 'captures') -Directory | Sort-Object Name)
    if ($captures.Count -ne 2) { throw "Expected two baseline captures; found $($captures.Count)." }
    $after = $captures[1].FullName

    & (Join-Path $toolDir 'Compare-SpecimenCaptures.ps1') -Before $before -After $after -OutputDirectory $compare
    $summary = Get-Content -LiteralPath (Join-Path $compare 'summary.json') -Raw | ConvertFrom-Json

    if ([int]$summary.changed -ne 1) { throw "Expected 1 changed file; found $($summary.changed)." }
    if ([int]$summary.added -ne 1) { throw "Expected 1 added file; found $($summary.added)." }
    if ([int]$summary.removed -ne 0) { throw "Expected 0 removed files; found $($summary.removed)." }

    Write-Host 'CLcode specimen tooling self-test: PASS'
    Write-Host "Parsed scripts: $($scripts.Count)"
    Write-Host 'Synthetic capture/experiment/compare workflow: PASS'
}
finally {
    if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}
