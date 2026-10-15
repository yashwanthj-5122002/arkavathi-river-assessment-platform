$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root 'backend'
$Py = Join-Path $Backend '.venv\Scripts\python.exe'
if (-not (Test-Path $Py)) { throw 'Run PRODUCTION_SETUP.ps1 first.' }
& $Py (Join-Path $Backend 'scripts\production_readiness_check.py')
try {
    $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8766/health' -TimeoutSec 5
    Write-Host ('Live health: ' + $h.status + ' | ' + $h.service + ' | ' + $h.version) -ForegroundColor Green
} catch {
    Write-Host 'Live server is not responding on 127.0.0.1:8766. Start RUN_PRODUCTION.ps1 if you want the live check.' -ForegroundColor Yellow
}
