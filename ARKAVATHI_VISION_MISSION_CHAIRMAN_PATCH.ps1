param()

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Join-Path $ProjectRoot "frontend\src\components\IntroductionSection.tsx"

if (-not (Test-Path $Target)) {
    throw "Could not find: $Target`nPlace this patch in the ARKAVTHI_80PERCENT project root and run it again."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $ProjectRoot "patch_backups\vision_mission_chairman_$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null

$backupFile = Join-Path $backupDir "IntroductionSection.tsx"
Copy-Item $Target $backupFile -Force

Write-Host ""
Write-Host "ARKAVATHI - Vision & Mission + Chairman's Desk frontend patch" -ForegroundColor Cyan
Write-Host "Target: $Target"
Write-Host "Backup: $backupFile"
Write-Host ""

try {
    $content = Get-Content $Target -Raw

    if ($content -match "'vision-mission'" -or $content -match "function VisionMissionView") {
        Write-Host "Vision & Mission / Chairman's Desk already appear to be present. No changes applied." -ForegroundColor Yellow
        Write-Host "Backup created at: $backupDir"
        exit 0
    }

    $oldType = "type IntroductionView = 'menu' | 'about' | 'pollution' | 'action' | 'focus' | 'collaboration' | 'study-area'"
    $newType = "type IntroductionView = 'menu' | 'about' | 'pollution' | 'action' | 'focus' | 'collaboration' | 'study-area' | 'vision-mission' | 'chairman-desk'"

    if (-not $content.Contains($oldType)) {
        throw "Expected IntroductionView definition was not found. Your local file differs from the version this patch targets."
    }
    $content = $content.Replace($oldType, $newType)

    $oldItems = @'
  { key: 'collaboration', label: 'Collaboration', icon: UsersRound },
  { key: 'study-area', label: 'Study Area Map', icon: MapPinned },
'@

    $newItems = @'
  { key: 'collaboration', label: 'Collaboration', icon: UsersRound },
  { key: 'study-area', label: 'Study Area Map', icon: MapPinned },
  { key: 'vision-mission', label: 'Vision & Mission', icon: Landmark },
  { key: 'chairman-desk', label: "Chairman's Desk", icon: CircleDot },
'@

    if (-not $content.Contains($oldItems)) {
        throw "Expected Introduction menu anchor was not found. No files were changed."
    }
    $content = $content.Replace($oldItems, $newItems)

    $anchor = "function CollaborationView({ onBack, config }: { onBack: () => void; config: PortalConfig | null }) {"
    if (-not $content.Contains($anchor)) {
        throw "Could not find CollaborationView insertion point. No files were changed."
    }

    $newViews = @'
function VisionMissionView({ onBack }: { onBack: () => void }) {
  const missionSteps = [
    'Identify pollution sources',
    'Prevent pollution at source',
    'Ensure effective treatment',
    'Monitor performance',
    'Restore river health',
  ]

  return (
    <div>
      <SectionHeader
        title="Vision & Mission"
        subtitle="A shared direction for pollution control, ecological restoration and long-term river health."
        onBack={onBack}
      />

      <div className="space-y-5 p-4 md:p-5">
        <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <Landmark size={19} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">Vision</div>
              <h4 className="mt-1 text-base font-black text-slate-900">Arkavathy River Basin</h4>
            </div>
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-700">
            A clean, healthy and resilient Arkavathy River Basin through integrated pollution control,
            ecological restoration and shared responsibility.
          </p>
        </section>

        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Mission</div>
          <h4 className="mt-1 text-base font-black text-slate-900">From identification to restoration</h4>

          <div className="mt-5 grid gap-2 lg:grid-cols-5">
            {missionSteps.map((step, index) => (
              <div key={step} className="relative">
                <div className="flex min-h-[88px] items-center justify-center rounded-xl border border-emerald-100 bg-white px-3 py-4 text-center">
                  <div>
                    <div className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-800">
                      {index + 1}
                    </div>
                    <div className="text-xs font-extrabold leading-5 text-slate-700">{step}</div>
                  </div>
                </div>

                {index < missionSteps.length - 1 && (
                  <div className="py-1 text-center text-lg font-black text-emerald-500 lg:absolute lg:-right-[9px] lg:top-1/2 lg:z-10 lg:-translate-y-1/2 lg:py-0">
                    →
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function ChairmanDeskView({ onBack }: { onBack: () => void }) {
  const objectives = [
    'Prevent pollution at source',
    'Treat what cannot be prevented',
    'Monitor outcomes',
    'Progressively restore the river ecosystem',
  ]

  return (
    <div>
      <SectionHeader
        title="Chairman's Desk"
        subtitle="Message from the Chairman, Arkavathy River Basin Pollution Abatement Committee."
        onBack={onBack}
      />

      <div className="space-y-5 p-4 md:p-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="space-y-4 text-sm leading-7 text-slate-700">
            <p>
              The Arkavathy River Basin is an important natural resource and ecological system,
              requiring coordinated and sustained efforts for its protection, rejuvenation and
              long-term sustainability.
            </p>

            <p>
              The Committee has focused on three major pollution pressures — sewage, industrial
              effluent and solid waste — with emphasis on their identification, source control,
              treatment and continuous monitoring.
            </p>

            <p>
              This Dashboard is envisaged as a common basin-level decision and accountability
              platform, integrating pollution sources, remedial actions, agency responsibilities,
              implementation progress and river-health indicators.
            </p>
          </div>
        </article>

        <section className="rounded-2xl border border-amber-100 bg-amber-50/60 p-5">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-amber-700">
            Our objective is clear
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {objectives.map((objective, index) => (
              <div key={objective} className="flex items-center gap-3 rounded-xl border border-amber-100 bg-white p-4">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-amber-100 text-xs font-black text-amber-800">
                  {index + 1}
                </div>
                <div className="text-sm font-bold leading-5 text-slate-700">{objective}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
          <blockquote className="text-center text-base font-black leading-7 text-navy-950 md:text-lg">
            “One Basin — One Data Platform — One Shared Responsibility for River Health.”
          </blockquote>

          <div className="mt-5 border-t border-blue-100 pt-4 text-right">
            <div className="text-sm font-black text-slate-900">Dr. K. Jaiprakash</div>
            <div className="mt-0.5 text-xs font-bold text-blue-700">Chairman</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">
              Arkavathy River Basin Pollution Abatement Committee
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

'@

    $content = $content.Replace($anchor, $newViews + $anchor)

    $routeAnchor = "  if (view === 'study-area') return <section className=`"overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card`"><StudyAreaView onBack={() => setView('menu')} /></section>"
    if (-not $content.Contains($routeAnchor)) {
        throw "Could not find the Study Area routing anchor. No files were changed."
    }

    $newRoutes = @'
  if (view === 'study-area') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><StudyAreaView onBack={() => setView('menu')} /></section>
  if (view === 'vision-mission') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><VisionMissionView onBack={() => setView('menu')} /></section>
  if (view === 'chairman-desk') return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card"><ChairmanDeskView onBack={() => setView('menu')} /></section>
'@

    $content = $content.Replace($routeAnchor, $newRoutes.TrimEnd())
    Set-Content -Path $Target -Value $content -Encoding UTF8

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
    Write-Host "Added:"
    Write-Host "  - Vision & Mission tile and detail view"
    Write-Host "  - Chairman's Desk tile and detail view"
    Write-Host ""
    Write-Host "Not changed:"
    Write-Host "  - Backend"
    Write-Host "  - Authentication / APIs / database"
    Write-Host "  - Overview / video / maps"
    Write-Host "  - Existing six Introduction sections"
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
