@echo off
setlocal
cd /d "%~dp0"

echo ========================================================
echo   Setting up Zepto Quick Scan Hourly Scheduled Task
echo ========================================================
echo.

:: Check for Administrative Rights and elevate if needed
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges to register Scheduled Task...
    powershell -NoProfile -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

:: Run PowerShell script with ExecutionPolicy Bypass
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_task.ps1"

if %errorlevel% equ 0 (
    echo.
    echo Task configured to run every 1 hour silently in the background:
    echo   - Runs on AC and Battery power
    echo   - Working Directory: %~dp0
    echo   - Starts automatically on schedule
    echo.
    echo Useful commands:
    echo   Run now:    schtasks /run /tn "ZeptoQuickScanBot"
    echo   Status:     schtasks /query /tn "ZeptoQuickScanBot"
    echo   Delete:     schtasks /delete /tn "ZeptoQuickScanBot" /f
) else (
    echo.
    echo [!] Failed to register task.
)
echo.
pause
