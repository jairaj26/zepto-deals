$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir) { $ScriptDir = 'D:\Projects\ZeptoNew' }
$ScriptPath = Join-Path $ScriptDir 'zepto_quick_scan.py'

# Locate pythonw.exe safely
$PythonExe = 'C:\Users\jaira\AppData\Local\Programs\Python\Python313\pythonw.exe'
if (-not (Test-Path $PythonExe)) {
    $cmd = Get-Command 'pythonw.exe' -ErrorAction SilentlyContinue
    if ($cmd) {
        $PythonExe = $cmd.Source
    } else {
        $PythonExe = 'pythonw.exe'
    }
}

Write-Host "Configuring Windows Scheduled Task 'ZeptoQuickScanBot'..." -ForegroundColor Cyan
Write-Host "  Script:     $ScriptPath"
Write-Host "  Python:     $PythonExe"
Write-Host "  WorkingDir: $ScriptDir"

# Action with WorkingDirectory and quoted script path
$Action = New-ScheduledTaskAction -Execute $PythonExe -Argument "`"$ScriptPath`"" -WorkingDirectory $ScriptDir

# Trigger 1: Hourly repeat indefinitely (3650 days duration)
$TriggerHourly = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Hours 1) -RepetitionDuration (New-TimeSpan -Days 3650)

# Trigger 2: At user logon (when PC restarts/boots and user logs in)
$TriggerLogon = New-ScheduledTaskTrigger -AtLogOn

# Settings:
# - AllowStartIfOnBatteries: Run on battery power (fixes 0x800710e0)
# - DontStopIfGoingOnBatteries: Keep running if AC is unplugged
# - StartWhenAvailable: Automatically run missed tasks after PC was asleep/off
# - MultipleInstances IgnoreNew: Don't spawn duplicate scans if previous is still finishing
# - ExecutionTimeLimit: 2 hours
$Settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 2)

# Delete existing task if present to ensure clean registration
try {
    & schtasks /delete /tn "ZeptoQuickScanBot" /f 2>$null | Out-Null
} catch {}

# Register task with both triggers
Register-ScheduledTask -TaskName 'ZeptoQuickScanBot' `
    -Action $Action `
    -Trigger @($TriggerHourly, $TriggerLogon) `
    -Settings $Settings `
    -Description "Zepto Quick Scan Hourly Deal Tracker Bot" -Force | Out-Null

Write-Host "`n[OK] Successfully configured 'ZeptoQuickScanBot'!" -ForegroundColor Green
Write-Host "  - Triggers: Every 1 hour + Automatically on logon / PC restart."
Write-Host "  - Battery: Enabled (runs on battery and AC power, no more 0x800710e0 errors)."
Write-Host "  - Catch-up: Enabled (StartWhenAvailable runs missed tasks after sleep/restart)."
Write-Host "  - Working Directory: $ScriptDir`n"
