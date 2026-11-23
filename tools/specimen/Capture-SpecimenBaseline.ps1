#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$LabRoot = (Join-Path $env:USERPROFILE 'clcode-specimen-lab'),
    [string[]]$InstallRoot,
    [switch]$SkipFileHashes
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-CommandVersion {
    param([Parameter(Mandatory=$true)][string]$Name, [string[]]$Arguments = @('--version'))
    $cmd = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $cmd) { return $null }
    try {
        $text = (& $cmd.Source @Arguments 2>&1 | Select-Object -First 1 | Out-String).Trim()
        return [ordered]@{ path = $cmd.Source; version = $text }
    } catch {
        return [ordered]@{ path = $cmd.Source; version = $null }
    }
}

function Resolve-SpecimenRoots {
    param([string[]]$ExplicitRoots)
    $roots = New-Object System.Collections.Generic.List[string]

    foreach ($candidate in @($ExplicitRoots)) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
            $roots.Add([IO.Path]::GetFullPath($candidate).TrimEnd('\'))
        }
    }

    if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
        try {
            Get-AppxPackage | Where-Object {
                $_.Name -match '(?i)claude|anthropic' -or
                $_.PackageFamilyName -match '(?i)claude|anthropic' -or
                $_.Publisher -match '(?i)anthropic'
            } | ForEach-Object {
                if ($_.InstallLocation -and (Test-Path -LiteralPath $_.InstallLocation -PathType Container)) {
                    $roots.Add([IO.Path]::GetFullPath($_.InstallLocation).TrimEnd('\'))
                }
            }
        } catch {}
    }

    $common = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Claude'),
        (Join-Path $env:LOCALAPPDATA 'Claude'),
        (Join-Path $env:LOCALAPPDATA 'AnthropicClaude'),
        (Join-Path $env:ProgramFiles 'Claude')
    )
    if (${env:ProgramFiles(x86)}) { $common += (Join-Path ${env:ProgramFiles(x86)} 'Claude') }

    foreach ($candidate in $common) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Container)) {
            $roots.Add([IO.Path]::GetFullPath($candidate).TrimEnd('\'))
        }
    }

    return @($roots | Select-Object -Unique)
}

function Get-AppPackages {
    if (-not (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue)) { return @() }
    try {
        return @(Get-AppxPackage | Where-Object {
            $_.Name -match '(?i)claude|anthropic' -or
            $_.PackageFamilyName -match '(?i)claude|anthropic' -or
            $_.Publisher -match '(?i)anthropic'
        } | ForEach-Object {
            [ordered]@{
                name = $_.Name
                version = [string]$_.Version
                packageFullName = $_.PackageFullName
                packageFamilyName = $_.PackageFamilyName
                publisher = $_.Publisher
                installLocation = $_.InstallLocation
                signatureKind = [string]$_.SignatureKind
            }
        })
    } catch { return @() }
}

function Get-SpecimenProcesses {
    try {
        return @(Get-CimInstance Win32_Process | Where-Object {
            $_.Name -match '(?i)claude|anthropic' -or $_.ExecutablePath -match '(?i)claude|anthropic'
        } | ForEach-Object {
            [ordered]@{
                processId = $_.ProcessId
                parentProcessId = $_.ParentProcessId
                name = $_.Name
                executablePath = $_.ExecutablePath
            }
        })
    } catch { return @() }
}

function Get-FileRows {
    param([Parameter(Mandatory=$true)][string]$Root, [switch]$NoHash)
    $rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    Get-ChildItem -LiteralPath $rootFull -Recurse -File -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $relative = $_.FullName.Substring($rootFull.Length).TrimStart('\')
        $hash = $null
        $hashError = $null
        if (-not $NoHash) {
            try { $hash = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256 -ErrorAction Stop).Hash }
            catch { $hashError = $_.Exception.Message }
        }
        [PSCustomObject]@{
            Root = $rootFull
            RelativePath = $relative
            Length = $_.Length
            LastWriteTimeUtc = $_.LastWriteTimeUtc.ToString('o')
            SHA256 = $hash
            HashError = $hashError
        }
    }
}

$captures = Join-Path $LabRoot 'captures'
New-Item -ItemType Directory -Force -Path $captures | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$captureId = 'baseline-{0}-{1}' -f $stamp, ([Guid]::NewGuid().ToString('N').Substring(0,8))
$out = Join-Path $captures $captureId
New-Item -ItemType Directory -Force -Path $out | Out-Null

$roots = @(Resolve-SpecimenRoots -ExplicitRoots $InstallRoot)
$packages = @(Get-AppPackages)
$processes = @(Get-SpecimenProcesses)

$os = Get-CimInstance Win32_OperatingSystem
$computer = Get-CimInstance Win32_ComputerSystem
$cpu = @(Get-CimInstance Win32_Processor | ForEach-Object {
    [ordered]@{ name = $_.Name; cores = $_.NumberOfCores; logicalProcessors = $_.NumberOfLogicalProcessors }
})
$gpu = @()
try {
    $gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object {
        [ordered]@{ name = $_.Name; driverVersion = $_.DriverVersion; adapterRam = $_.AdapterRAM }
    })
} catch {}

$fileCount = 0
$filesCsv = Join-Path $out 'files.csv'
if ($roots.Count -gt 0) {
    $rows = foreach ($root in $roots) { Get-FileRows -Root $root -NoHash:$SkipFileHashes }
    $rows = @($rows)
    $fileCount = $rows.Count
    $rows | Export-Csv -LiteralPath $filesCsv -NoTypeInformation -Encoding UTF8
} else {
    'Root,RelativePath,Length,LastWriteTimeUtc,SHA256,HashError' | Set-Content -LiteralPath $filesCsv -Encoding UTF8
}

$manifest = [ordered]@{
    schemaVersion = 1
    captureId = $captureId
    captureType = 'specimen-baseline'
    createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    machine = [ordered]@{
        computerName = $env:COMPUTERNAME
        userName = $env:USERNAME
        osCaption = $os.Caption
        osVersion = $os.Version
        osBuild = $os.BuildNumber
        architecture = $os.OSArchitecture
        totalPhysicalMemory = [int64]$computer.TotalPhysicalMemory
        cpu = $cpu
        gpu = $gpu
        powershell = $PSVersionTable.PSVersion.ToString()
    }
    tools = [ordered]@{
        git = Get-CommandVersion -Name 'git'
        node = Get-CommandVersion -Name 'node'
        npm = Get-CommandVersion -Name 'npm.cmd'
    }
    appxPackages = $packages
    installRoots = $roots
    fileCount = $fileCount
    hashesSkipped = [bool]$SkipFileHashes
    runningSpecimenProcesses = $processes
    filesCsv = 'files.csv'
    note = 'Metadata and hashes only. No vendor application files are copied into this capture.'
}
$manifest | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $out 'manifest.json') -Encoding UTF8

Write-Host "CLcode specimen baseline: $captureId"
Write-Host "Output: $out"
Write-Host "Install roots found: $($roots.Count)"
Write-Host "Files inventoried: $fileCount"
if ($roots.Count -eq 0) {
    Write-Warning 'No specimen install root was found. Re-run with -InstallRoot after installing/pinning the target Desktop application.'
}
