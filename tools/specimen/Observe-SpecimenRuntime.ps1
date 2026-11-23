#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$LabRoot = (Join-Path $env:USERPROFILE 'clcode-specimen-lab'),
    [ValidateRange(5,3600)][int]$DurationSeconds = 120,
    [ValidateRange(200,10000)][int]$PollMilliseconds = 1000,
    [string]$ProcessNameRegex = '(?i)claude|anthropic',
    [string]$LaunchPath,
    [string[]]$LaunchArguments = @(),
    [switch]$StopLaunchedProcessAtEnd
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$observations = Join-Path $LabRoot 'observations'
New-Item -ItemType Directory -Force -Path $observations | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$observationId = 'runtime-{0}-{1}' -f $stamp, ([Guid]::NewGuid().ToString('N').Substring(0,8))
$out = Join-Path $observations $observationId
New-Item -ItemType Directory -Force -Path $out | Out-Null

$launched = $null
if ($LaunchPath) {
    if (-not (Test-Path -LiteralPath $LaunchPath -PathType Leaf)) { throw "LaunchPath does not exist: $LaunchPath" }
    $startParams = @{ FilePath = $LaunchPath; PassThru = $true }
    if ($LaunchArguments.Count -gt 0) { $startParams.ArgumentList = $LaunchArguments }
    $launched = Start-Process @startParams
}

$processSamples = New-Object System.Collections.Generic.List[object]
$connectionSamples = New-Object System.Collections.Generic.List[object]
$seenPids = New-Object 'System.Collections.Generic.HashSet[int]'

function Get-AllProcesses {
    try { return @(Get-CimInstance Win32_Process) } catch { return @() }
}

function Get-WatchedPids {
    param([object[]]$Processes, [Nullable[int]]$RootPid)
    $ids = New-Object 'System.Collections.Generic.HashSet[int]'
    foreach ($p in $Processes) {
        if ($p.Name -match $ProcessNameRegex -or $p.ExecutablePath -match $ProcessNameRegex) {
            [void]$ids.Add([int]$p.ProcessId)
        }
    }
    if ($RootPid.HasValue) { [void]$ids.Add($RootPid.Value) }

    $changed = $true
    while ($changed) {
        $changed = $false
        foreach ($p in $Processes) {
            if ($ids.Contains([int]$p.ParentProcessId) -and -not $ids.Contains([int]$p.ProcessId)) {
                [void]$ids.Add([int]$p.ProcessId)
                $changed = $true
            }
        }
    }
    return $ids
}

$startedUtc = (Get-Date).ToUniversalTime()
$deadline = (Get-Date).AddSeconds($DurationSeconds)

try {
    while ((Get-Date) -lt $deadline) {
        $now = (Get-Date).ToUniversalTime().ToString('o')
        $procs = @(Get-AllProcesses)
        $rootPid = if ($launched) { [Nullable[int]]([int]$launched.Id) } else { [Nullable[int]]$null }
        $watched = Get-WatchedPids -Processes $procs -RootPid $rootPid

        foreach ($p in $procs) {
            if (-not $watched.Contains([int]$p.ProcessId)) { continue }
            [void]$seenPids.Add([int]$p.ProcessId)
            $processSamples.Add([PSCustomObject]@{
                TimestampUtc = $now
                ProcessId = $p.ProcessId
                ParentProcessId = $p.ParentProcessId
                Name = $p.Name
                ExecutablePath = $p.ExecutablePath
            })
        }

        if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
            try {
                Get-NetTCPConnection -State Established -ErrorAction Stop | Where-Object {
                    $watched.Contains([int]$_.OwningProcess)
                } | ForEach-Object {
                    $connectionSamples.Add([PSCustomObject]@{
                        TimestampUtc = $now
                        OwningProcess = $_.OwningProcess
                        LocalAddress = $_.LocalAddress
                        LocalPort = $_.LocalPort
                        RemoteAddress = $_.RemoteAddress
                        RemotePort = $_.RemotePort
                        State = [string]$_.State
                    })
                }
            } catch {}
        }

        Start-Sleep -Milliseconds $PollMilliseconds
    }
}
finally {
    if ($StopLaunchedProcessAtEnd -and $launched) {
        try { Stop-Process -Id $launched.Id -Force -ErrorAction Stop } catch {}
    }
}

$processCsv = Join-Path $out 'process-samples.csv'
$connectionCsv = Join-Path $out 'connections.csv'
if ($processSamples.Count) { $processSamples | Export-Csv -LiteralPath $processCsv -NoTypeInformation -Encoding UTF8 }
else { 'TimestampUtc,ProcessId,ParentProcessId,Name,ExecutablePath' | Set-Content -LiteralPath $processCsv -Encoding UTF8 }
if ($connectionSamples.Count) { $connectionSamples | Export-Csv -LiteralPath $connectionCsv -NoTypeInformation -Encoding UTF8 }
else { 'TimestampUtc,OwningProcess,LocalAddress,LocalPort,RemoteAddress,RemotePort,State' | Set-Content -LiteralPath $connectionCsv -Encoding UTF8 }

$summary = [ordered]@{
    schemaVersion = 1
    observationId = $observationId
    startedAtUtc = $startedUtc.ToString('o')
    finishedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    durationSeconds = $DurationSeconds
    pollMilliseconds = $PollMilliseconds
    processNameRegex = $ProcessNameRegex
    launchedPath = $LaunchPath
    launchedProcessId = if ($launched) { $launched.Id } else { $null }
    uniqueProcessIds = @($seenPids)
    processSampleCount = $processSamples.Count
    connectionSampleCount = $connectionSamples.Count
    processCsv = 'process-samples.csv'
    connectionCsv = 'connections.csv'
    note = 'No command lines, request payloads, cookies, auth headers or process memory were captured.'
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $out 'summary.json') -Encoding UTF8

Write-Host "CLcode runtime observation: $observationId"
Write-Host "Output: $out"
Write-Host "Unique watched PIDs: $($seenPids.Count)"
Write-Host "Established TCP samples: $($connectionSamples.Count)"
