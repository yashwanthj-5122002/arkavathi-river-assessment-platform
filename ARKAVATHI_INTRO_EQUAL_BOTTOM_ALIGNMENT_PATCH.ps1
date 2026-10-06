param()

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Join-Path $ProjectRoot "frontend\src\components\IntroductionSection.tsx"

if (-not (Test-Path $Target)) {
    throw "Could not find: $Target`nPlace this patch in the ARKAVTHI_80PERCENT project root and run it again."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $ProjectRoot "patch_backups\intro_equal_bottom_alignment_$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$backupFile = Join-Path $backupDir "IntroductionSection.tsx"
Copy-Item $Target $backupFile -Force

Write-Host ""
Write-Host "ARKAVATHI - Introduction equal bottom alignment patch" -ForegroundColor Cyan
Write-Host "Target : $Target"
Write-Host "Backup : $backupFile"
Write-Host ""

try {
    $content = Get-Content $Target -Raw

    # -------------------------------------------------------------------------
    # 1) Make the shared detail grid stretch both columns to the same height.
    #    Do NOT touch any right-panel inner content.
    # -------------------------------------------------------------------------
    $oldGrid = 'className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]"'
    $newGrid = 'className="grid items-stretch gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]"'

    if (-not $content.Contains($oldGrid)) {
        throw "Could not find the expected IntroductionDetailLayout grid class. No changes were applied."
    }

    $content = $content.Replace($oldGrid, $newGrid)

    # -------------------------------------------------------------------------
    # 2) Make LEFT navigation wrapper stretch the full shared row height.
    #    Preserve sticky behavior on desktop.
    # -------------------------------------------------------------------------
    $oldLeftWrapper = 'className="xl:sticky xl:top-4"'
    $newLeftWrapper = 'className="h-full xl:sticky xl:top-4"'

    if (-not $content.Contains($oldLeftWrapper)) {
        throw "Could not find the expected left navigation wrapper. No changes were applied."
    }

    $content = $content.Replace($oldLeftWrapper, $newLeftWrapper)

    # -------------------------------------------------------------------------
    # 3) Make the right information panel stretch to the full grid-row height.
    #    This changes only the OUTER section box, never its inner contents.
    # -------------------------------------------------------------------------
    $oldRightSection = 'className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"'
    $newRightSection = 'className="h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"'

    if (-not $content.Contains($oldRightSection)) {
        throw "Could not find the expected right information section wrapper. No changes were applied."
    }

    $content = $content.Replace($oldRightSection, $newRightSection)

    # -------------------------------------------------------------------------
    # 4) Make the Introduction side-navigation card fill its wrapper height.
    #    This keeps the outer left box aligned to the right box bottom.
    # -------------------------------------------------------------------------
    $oldAside = '<aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">'
    $newAside = '<aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">'

    if (-not $content.Contains($oldAside)) {
        throw "Could not find IntroductionSideNavigation aside. No changes were applied."
    }

    $content = $content.Replace($oldAside, $newAside)

    # -------------------------------------------------------------------------
    # 5) Make the menu-list area fill remaining height.
    #    Existing rows remain unchanged in content.
    # -------------------------------------------------------------------------
    $oldList = '<div className="divide-y divide-slate-200">'
    $newList = '<div className="flex flex-1 flex-col divide-y divide-slate-200">'

    if (-not $content.Contains($oldList)) {
        throw "Could not find the Introduction navigation list container. No changes were applied."
    }

    $content = $content.Replace($oldList, $newList)

    # -------------------------------------------------------------------------
    # 6) Give every navigation row equal vertical distribution.
    #    Same icon/text/chevron content, only spacing/alignment changes.
    # -------------------------------------------------------------------------
    $oldButtonClass = 'className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition ${'
    $newButtonClass = 'className={`group flex min-h-[58px] flex-1 w-full items-center gap-3 px-4 py-3 text-left transition ${'

    if (-not $content.Contains($oldButtonClass)) {
        throw "Could not find the Introduction navigation row class. No changes were applied."
    }

    $content = $content.Replace($oldButtonClass, $newButtonClass)

    # -------------------------------------------------------------------------
    # SAVE
    # -------------------------------------------------------------------------
    Set-Content -Path $Target -Value $content -Encoding UTF8

    # -------------------------------------------------------------------------
    # TypeScript validation
    # -------------------------------------------------------------------------
    $nodeDir = "C:\Program Files\nodejs"
    if (Test-Path $nodeDir) {
        $env:Path = "$nodeDir;$env:Path"
    }

    $frontendDir = Join-Path $ProjectRoot "frontend"
    $npx = Get-Command "npx.cmd" -ErrorAction SilentlyContinue

    if ($npx -and (Test-Path (Join-Path $frontendDir "node_modules\typescript"))) {
        Write-Host ""
        Write-Host "Running TypeScript validation..." -ForegroundColor Cyan

        Push-Location $frontendDir
        try {
            & npx.cmd tsc --noEmit
            if ($LASTEXITCODE -ne 0) {
                throw "TypeScript validation failed."
            }
        }
        finally {
            Pop-Location
        }

        Write-Host "TypeScript validation passed." -ForegroundColor Green
    }
    else {
        Write-Host ""
        Write-Host "TypeScript validation skipped because Node/TypeScript was not found in this terminal." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "PATCH APPLIED SUCCESSFULLY" -ForegroundColor Green
    Write-Host ""
    Write-Host "Modified ONLY:"
    Write-Host "  frontend\src\components\IntroductionSection.tsx"
    Write-Host ""
    Write-Host "Changed ONLY:"
    Write-Host "  - Left and right detail panels now stretch to the same row height"
    Write-Host "  - Bottom edges align"
    Write-Host "  - Left menu rows distribute evenly"
    Write-Host "  - Existing right-side information content is untouched"
    Write-Host ""
    Write-Host "Backup:"
    Write-Host "  $backupDir"
}
catch {
    Write-Host ""
    Write-Host "PATCH FAILED - restoring original IntroductionSection.tsx..." -ForegroundColor Red

    if (Test-Path $backupFile) {
        Copy-Item $backupFile $Target -Force
        Write-Host "Original file restored from backup." -ForegroundColor Yellow
    }

    throw
}
