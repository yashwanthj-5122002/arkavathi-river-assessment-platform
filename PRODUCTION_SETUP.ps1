$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Backend = Join-Path $Root 'backend'
$Frontend = Join-Path $Root 'frontend'
$Venv = Join-Path $Backend '.venv'
$Py = Join-Path $Venv 'Scripts\python.exe'
$Config = Join-Path $Root 'config\production.env'
$ConfigExample = Join-Path $Root 'config\production.env.example'

Write-Host ''
Write-Host 'ARKAVATI PRODUCTION SETUP' -ForegroundColor Cyan
Write-Host 'Arkavati River Population Assessment Project' -ForegroundColor White
Write-Host ('Root: ' + $Root)

if (-not (Test-Path $Config)) {
    Copy-Item $ConfigExample $Config
    Write-Host 'Created config\production.env from safe template.' -ForegroundColor Yellow
}

foreach ($d in @('production_data\showcase_videos','production_data\video_srt_pairs','production_data\imports','production_data\backups')) {
    New-Item -ItemType Directory -Path (Join-Path $Root $d) -Force | Out-Null
}

if (Test-Path (Join-Path $Backend 'runtime\auth.db')) {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $backup = Join-Path $Root ("production_data\backups\auth_before_setup_$stamp.db")
    Copy-Item (Join-Path $Backend 'runtime\auth.db') $backup -Force
    Write-Host ('Database backup: ' + $backup) -ForegroundColor Green
}

if (-not (Test-Path $Py)) {
    $python = Get-Command python -ErrorAction SilentlyContinue
    if (-not $python) { throw 'Python was not found. Install Python 3.10+ and run setup again.' }
    & python -m venv $Venv
}

& $Py -m pip install --upgrade pip
& $Py -m pip install -r (Join-Path $Backend 'requirements.txt')

Write-Host 'Running database migrations...' -ForegroundColor Cyan
& $Py (Join-Path $Backend 'scripts\migrate_v18_phase1.py') --db (Join-Path $Backend 'runtime\auth.db')
& $Py (Join-Path $Backend 'scripts\migrate_v18_phase2.py') --db (Join-Path $Backend 'runtime\auth.db')

Write-Host 'Validating backend...' -ForegroundColor Cyan
& $Py -m compileall -q (Join-Path $Backend 'app') (Join-Path $Backend 'scripts')
& $Py (Join-Path $Backend 'scripts\production_readiness_check.py')

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) { throw 'npm was not found. Install Node.js LTS (includes npm) and run setup again.' }

Write-Host 'Installing locked frontend dependencies...' -ForegroundColor Cyan
Push-Location $Frontend
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    Write-Host 'Building production frontend...' -ForegroundColor Cyan
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
} finally { Pop-Location }

Write-Host 'Final readiness check...' -ForegroundColor Cyan
& $Py (Join-Path $Backend 'scripts\production_readiness_check.py')

Write-Host ''
Write-Host 'PRODUCTION SETUP COMPLETE' -ForegroundColor Green
Write-Host 'Next: edit config\production.env if you are using HTTPS/reverse proxy, then run .\RUN_PRODUCTION.ps1'
