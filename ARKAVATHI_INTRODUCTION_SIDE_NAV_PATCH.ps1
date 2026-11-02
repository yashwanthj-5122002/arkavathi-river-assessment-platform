param()

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Join-Path $ProjectRoot "frontend\src\components\IntroductionSection.tsx"

if (-not (Test-Path $Target)) {
    throw "Could not find: $Target`nPlace this patch inside the ARKAVTHI_80PERCENT project root and run it again."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $ProjectRoot "patch_backups\introduction_side_navigation_$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$backupFile = Join-Path $backupDir "IntroductionSection.tsx"
Copy-Item $Target $backupFile -Force

Write-Host ""
Write-Host "ARKAVATHI - Introduction persistent side-navigation patch" -ForegroundColor Cyan
Write-Host "Target: $Target"
Write-Host "Backup: $backupFile"
Write-Host ""

try {
    $content = Get-Content $Target -Raw

    if ($content -match "function IntroductionSideNavigation" -or $content -match "IntroductionDetailLayout") {
        Write-Host "Persistent Introduction side-navigation already appears to be present. No changes applied." -ForegroundColor Yellow
        Write-Host "Backup created at: $backupDir"
        exit 0
    }

    # 1) Add ReactNode type for the shared detail layout.
    $oldImport = "import { useEffect, useState } from 'react'"
    $newImport = "import { useEffect, useState, type ReactNode } from 'react'"

    if (-not $content.Contains($oldImport)) {
        throw "Expected React import was not found. Your IntroductionSection.tsx differs from the expected version."
    }
    $content = $content.Replace($oldImport, $newImport)

    # 2) Insert reusable persistent right-side navigation and detail layout
    # immediately before the IntroductionSection export.
    $exportAnchor = "export function IntroductionSection() {"

    if (-not $content.Contains($exportAnchor)) {
        throw "Could not find IntroductionSection export. No files were changed."
    }

    $navigationComponents = @'
function IntroductionSideNavigation({
  activeView,
  onSelect,
}: {
  activeView: IntroductionView
  onSelect: (view: IntroductionView) => void
}) {
  return (
    <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 bg-gradient-to-r from-navy-950 to-blue-800 px-4 py-4 text-white">
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-200">
          Project Information
        </div>
        <h3 className="mt-1 text-sm font-black uppercase tracking-[0.08em]">
          Introduction Sections
        </h3>
        <p className="mt-1 text-[11px] leading-4 text-blue-100">
          Select another section without returning to the main Introduction screen.
        </p>
      </div>

      <div className="divide-y divide-slate-200">
        {introductionItems.map(item => {
          const Icon = item.icon
          const isActive = activeView === item.key

          return (
            <button
              type="button"
              key={item.key}
              onClick={() => onSelect(item.key as IntroductionView)}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                isActive
                  ? 'bg-blue-50 text-blue-800'
                  : 'bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition ${
                  isActive
                    ? 'border-blue-200 bg-blue-100 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-500 group-hover:border-blue-100 group-hover:bg-blue-50 group-hover:text-blue-700'
                }`}
              >
                <Icon size={17} strokeWidth={2.1} />
              </div>

              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs leading-5 ${
                    isActive ? 'font-black text-blue-900' : 'font-bold text-slate-700'
                  }`}
                >
                  {item.label}
                </div>

                {isActive && (
                  <div className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-blue-600">
                    Currently viewing
                  </div>
                )}
              </div>

              <ChevronRight
                size={16}
                className={`shrink-0 transition ${
                  isActive
                    ? 'text-blue-600'
                    : 'text-slate-300 group-hover:translate-x-0.5 group-hover:text-blue-600'
                }`}
              />
            </button>
          )
        })}
      </div>
    </aside>
  )
}

function IntroductionDetailLayout({
  activeView,
  onSelect,
  children,
}: {
  activeView: IntroductionView
  onSelect: (view: IntroductionView) => void
  children: ReactNode
}) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] 2xl:grid-cols-[minmax(0,1fr)_320px]">
      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {children}
      </section>

      <div className="xl:sticky xl:top-4">
        <IntroductionSideNavigation
          activeView={activeView}
          onSelect={onSelect}
        />
      </div>
    </div>
  )
}

'@

    $content = $content.Replace($exportAnchor, $navigationComponents + $exportAnchor)

    # 3) Replace only the detail-view routing block.
    $oldRoutes = @'
  if (view === 'about') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><AboutUsView onBack={() => setView('menu')} /></section>
  if (view === 'pollution') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><UnderstandingPollutionView onBack={() => setView('menu')} /></section>
  if (view === 'action') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><FromDataToActionView onBack={() => setView('menu')} /></section>
  if (view === 'focus') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><KeyFocusAreasView onBack={() => setView('menu')} /></section>
  if (view === 'collaboration') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><CollaborationView config={portalConfig} onBack={() => setView('menu')} /></section>
  if (view === 'study-area') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><StudyAreaView onBack={() => setView('menu')} /></section>
  if (view === 'vision-mission') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><VisionMissionView onBack={() => setView('menu')} /></section>
  if (view === 'chairman-desk') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><ChairmanDeskView onBack={() => setView('menu')} /></section>
'@

    $newRoutes = @'
  if (view === 'about') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <AboutUsView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'pollution') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <UnderstandingPollutionView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'action') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <FromDataToActionView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'focus') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <KeyFocusAreasView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'collaboration') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <CollaborationView config={portalConfig} onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'study-area') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <StudyAreaView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'vision-mission') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <VisionMissionView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'chairman-desk') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <ChairmanDeskView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }
'@

    if (-not $content.Contains($oldRoutes)) {
        throw "Expected Introduction detail-routing block was not found. No files were changed. This protects your current code from an unsafe partial patch."
    }

    $content = $content.Replace($oldRoutes, $newRoutes)

    # Save only IntroductionSection.tsx.
    Set-Content -Path $Target -Value $content -Encoding UTF8

    # Optional local TypeScript validation.
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
        Write-Host "TypeScript validation skipped because Node/TypeScript is not available in this terminal." -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "PATCH APPLIED SUCCESSFULLY" -ForegroundColor Green
    Write-Host ""
    Write-Host "Only this file was modified:"
    Write-Host "  frontend\src\components\IntroductionSection.tsx"
    Write-Host ""
    Write-Host "New behavior:"
    Write-Host "  - The main 8-panel Introduction grid remains unchanged."
    Write-Host "  - Opening any section shows its existing content on the left."
    Write-Host "  - All 8 Introduction sections remain visible in a right-side navigation panel."
    Write-Host "  - The active section is highlighted."
    Write-Host "  - Clicking another right-side item switches sections immediately."
    Write-Host "  - The existing Back to Introduction button remains available."
    Write-Host "  - On smaller screens, the navigation safely stacks below the content."
    Write-Host ""
    Write-Host "Not changed:"
    Write-Host "  - Any section content"
    Write-Host "  - Backend"
    Write-Host "  - Authentication / APIs / database"
    Write-Host "  - Overview / video / maps"
    Write-Host "  - Other application modules"
    Write-Host ""
    Write-Host "Backup created at: $backupDir"
    Write-Host ""
    Write-Host "To preview:"
    Write-Host '  cd .\frontend'
    Write-Host '  $env:Path = "C:\Program Files\nodejs;$env:Path"'
    Write-Host '  npm.cmd run dev'
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
