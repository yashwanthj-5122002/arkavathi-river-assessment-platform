$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$outDir = Join-Path $Root 'production_data\backups'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$stage = Join-Path $env:TEMP ("arkavati_backup_$stamp")
$zip = Join-Path $outDir ("ARKAVATI_PRODUCTION_BACKUP_$stamp.zip")
New-Item -ItemType Directory -Path $stage -Force | Out-Null
try {
    foreach ($path in @('backend\runtime','production_data\video_srt_pairs','production_data\showcase_videos','config\production.env')) {
        $src = Join-Path $Root $path
        if (Test-Path $src) {
            $dest = Join-Path $stage $path
            New-Item -ItemType Directory -Path (Split-Path $dest -Parent) -Force | Out-Null
            Copy-Item $src $dest -Recurse -Force
        }
    }
    Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
    Write-Host ('Backup created: ' + $zip) -ForegroundColor Green
} finally { Remove-Item $stage -Recurse -Force -ErrorAction SilentlyContinue }
