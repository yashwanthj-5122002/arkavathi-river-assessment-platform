$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root 'backend'
$Py = Join-Path $Backend '.venv\Scripts\python.exe'
$Config = Join-Path $Root 'config\production.env'

if (-not (Test-Path $Py)) { throw 'Python environment missing. Run PRODUCTION_SETUP.ps1 first.' }
if (-not (Test-Path (Join-Path $Root 'frontend\dist\index.html'))) { throw 'Production frontend build missing. Run PRODUCTION_SETUP.ps1 first.' }
if (-not (Test-Path $Config)) { throw 'config\production.env missing. Run PRODUCTION_SETUP.ps1 first.' }

Get-Content $Config | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith('#') -or -not $line.Contains('=')) { return }
    $parts = $line.Split('=',2)
    [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
}
$env:ARKAVATI_PRODUCTION = 'true'
$env:PYTHONUNBUFFERED = '1'

Push-Location $Backend
try {
    Write-Host ''
    Write-Host 'ARKAVATI PRODUCTION SERVER' -ForegroundColor Cyan
    Write-Host 'Arkavati River Population Assessment Project' -ForegroundColor White
    & $Py -m app.simple_server
} finally { Pop-Location }
