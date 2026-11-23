#requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateRange(1,3600)][int]$DurationSeconds = 120
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$source = 'CLcodeProcessStart-' + [guid]::NewGuid().ToString('N')
$query = 'SELECT * FROM Win32_ProcessStartTrace'
$deadline = [DateTime]::UtcNow.AddSeconds($DurationSeconds)
Register-WmiEvent -Query $query -SourceIdentifier $source | Out-Null
try {
    while ([DateTime]::UtcNow -lt $deadline) {
        $event = Wait-Event -SourceIdentifier $source -Timeout 1
        if (-not $event) { continue }
        try {
            $trace = $event.SourceEventArgs.NewEvent
            $procId = [int]$trace.ProcessID
            $parentId = [int]$trace.ParentProcessID
            $name = [string]$trace.ProcessName
            Start-Sleep -Milliseconds 15
            $process = Get-CimInstance Win32_Process -Filter "ProcessId = $procId" -ErrorAction SilentlyContinue
            [pscustomobject]@{
                timestampUtc = [DateTime]::UtcNow.ToString('o')
                processId = $procId
                parentProcessId = $parentId
                name = $name
                executablePath = if ($process) { $process.ExecutablePath } else { $null }
                commandLine = if ($process) { $process.CommandLine } else { $null }
                detailsResolved = [bool]$process
            } | ConvertTo-Json -Compress -Depth 3
        } finally {
            Remove-Event -EventIdentifier $event.EventIdentifier -ErrorAction SilentlyContinue
        }
    }
} finally {
    Unregister-Event -SourceIdentifier $source -ErrorAction SilentlyContinue
    Get-Event -SourceIdentifier $source -ErrorAction SilentlyContinue | Remove-Event -ErrorAction SilentlyContinue
}
