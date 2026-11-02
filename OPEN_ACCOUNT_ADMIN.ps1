$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Py = Join-Path $Root 'backend\.venv\Scripts\python.exe'
if (-not (Test-Path $Py)) { throw 'Run PRODUCTION_SETUP.ps1 first.' }
Write-Host 'Existing login account map:' -ForegroundColor Cyan
& $Py (Join-Path $Root 'backend\scripts\manage_users.py') list
Write-Host ''
Write-Host 'To reset a lost password:' -ForegroundColor Yellow
Write-Host '& ".\backend\.venv\Scripts\python.exe" ".\backend\scripts\manage_users.py" reset-password --email "user@example.com" --generate --must-change'
