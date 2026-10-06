param()

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$Target = Join-Path $ProjectRoot "frontend\src\components\IntroductionSection.tsx"

if (-not (Test-Path $Target)) {
    throw "Could not find: $Target`nPlace this patch in the ARKAVTHI_80PERCENT project root and run it again."
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $ProjectRoot "patch_backups\introduction_left_nav_unified_cards_$timestamp"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$backupFile = Join-Path $backupDir "IntroductionSection.tsx"
Copy-Item $Target $backupFile -Force

Write-Host ""
Write-Host "ARKAVATHI - Introduction left navigation + unified information cards patch" -ForegroundColor Cyan
Write-Host "Target : $Target"
Write-Host "Backup : $backupFile"
Write-Host ""

try {
    $content = Get-Content $Target -Raw

    # 1) Move Introduction navigation from RIGHT to LEFT.
    $layoutPattern = '(?s)function IntroductionDetailLayout\(\{.*?\n\}\)\s*\{.*?\n\}\s*(?=export function IntroductionSection\(\))'
    if (-not [regex]::IsMatch($content, $layoutPattern)) {
        throw "Could not find IntroductionDetailLayout. Apply the persistent side-navigation patch first."
    }

    $newLayout = @'
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
    <div className="grid items-start gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="xl:sticky xl:top-4">
        <IntroductionSideNavigation
          activeView={activeView}
          onSelect={onSelect}
        />
      </div>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {children}
      </section>
    </div>
  )
}

'@
    $content = [regex]::Replace($content, $layoutPattern, $newLayout, 1)

    # 2) Understanding the Pollution -> one information box.
    $pollutionPattern = '(?s)function UnderstandingPollutionView\(\{ onBack \}: \{ onBack: \(\) => void \}\) \{.*?(?=\nfunction FromDataToActionView)'
    if (-not [regex]::IsMatch($content, $pollutionPattern)) { throw "Could not find UnderstandingPollutionView." }

    $newPollution = @'
function UnderstandingPollutionView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <SectionHeader
        title="Understanding the Pollution"
        subtitle="Pollution sources, surveys, GIS, LiDAR / Drone and basin assessment."
        onBack={onBack}
      />
      <div className="p-4 md:p-5">
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <p className="text-sm leading-7 text-slate-700">{understandingPollutionIntro}</p>
          <div className="mt-5 space-y-4">
            {understandingPollutionPoints.map(point => (
              <div key={point} className="flex gap-3">
                <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                <p className="text-sm leading-7 text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

'@
    $content = [regex]::Replace($content, $pollutionPattern, $newPollution, 1)

    # 3) From Data to Action -> one outer box; keep 5 process cards separate.
    $actionPattern = '(?s)function FromDataToActionView\(\{ onBack \}: \{ onBack: \(\) => void \}\) \{.*?(?=\nfunction KeyFocusAreasView)'
    if (-not [regex]::IsMatch($content, $actionPattern)) { throw "Could not find FromDataToActionView." }

    $newAction = @'
function FromDataToActionView({ onBack }: { onBack: () => void }) {
  const steps = ['Identify hotspots', 'Evaluate impacts', 'Scientific basis', 'Mitigation & rejuvenation', 'River-basin management']

  return (
    <div>
      <SectionHeader
        title="From Data to Action"
        subtitle="Turning field and spatial evidence into mitigation, rejuvenation and pollution-control action."
        onBack={onBack}
      />
      <div className="p-4 md:p-5">
        <article className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <p className="text-sm leading-7 text-slate-700">{fromDataToActionIntro}</p>

          <div className="mt-5 grid gap-2 md:grid-cols-5">
            {steps.map((step, index) => (
              <div key={step} className="rounded-xl border border-emerald-100 bg-white p-3 text-center text-xs font-bold leading-5 text-slate-700">
                <div className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full bg-emerald-50 text-[11px] font-black text-emerald-700">{index + 1}</div>
                {step}
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-4">
            {fromDataToActionPoints.map(point => (
              <div key={point} className="flex gap-3">
                <div className="mt-2 h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                <p className="text-sm leading-7 text-slate-700">{point}</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

'@
    $content = [regex]::Replace($content, $actionPattern, $newAction, 1)

    # 4) Vision & Mission -> one outer box; keep 5 mission cards separate.
    $visionPattern = '(?s)function VisionMissionView\(\{ onBack \}: \{ onBack: \(\) => void \}\) \{.*?(?=\nfunction ChairmanDeskView)'
    if (-not [regex]::IsMatch($content, $visionPattern)) { throw "Could not find VisionMissionView." }

    $newVision = @'
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
      <div className="p-4 md:p-5">
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
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

          <div className="my-5 border-t border-blue-100" />

          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Mission</div>
          <h4 className="mt-1 text-base font-black text-slate-900">From identification to restoration</h4>

          <div className="mt-5 grid gap-2 lg:grid-cols-5">
            {missionSteps.map((step, index) => (
              <div key={step} className="relative">
                <div className="flex min-h-[88px] items-center justify-center rounded-xl border border-emerald-100 bg-white px-3 py-4 text-center">
                  <div>
                    <div className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-800">{index + 1}</div>
                    <div className="text-xs font-extrabold leading-5 text-slate-700">{step}</div>
                  </div>
                </div>
                {index < missionSteps.length - 1 && (
                  <div className="py-1 text-center text-lg font-black text-emerald-500 lg:absolute lg:-right-[9px] lg:top-1/2 lg:z-10 lg:-translate-y-1/2 lg:py-0">→</div>
                )}
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

'@
    $content = [regex]::Replace($content, $visionPattern, $newVision, 1)

    Set-Content -Path $Target -Value $content -Encoding UTF8

    # TypeScript validation.
    $nodeDir = "C:\Program Files\nodejs"
    if (Test-Path $nodeDir) { $env:Path = "$nodeDir;$env:Path" }

    $frontendDir = Join-Path $ProjectRoot "frontend"
    $npx = Get-Command "npx.cmd" -ErrorAction SilentlyContinue
    if ($npx -and (Test-Path (Join-Path $frontendDir "node_modules\typescript"))) {
        Write-Host ""
        Write-Host "Running TypeScript validation..." -ForegroundColor Cyan
        Push-Location $frontendDir
        try {
            & npx.cmd tsc --noEmit
            if ($LASTEXITCODE -ne 0) { throw "TypeScript validation failed." }
        }
        finally { Pop-Location }
        Write-Host "TypeScript validation passed." -ForegroundColor Green
    }

    Write-Host ""
    Write-Host "PATCH APPLIED SUCCESSFULLY" -ForegroundColor Green
    Write-Host ""
    Write-Host "Modified ONLY: frontend\src\components\IntroductionSection.tsx"
    Write-Host ""
    Write-Host "Applied changes:"
    Write-Host "  - Introduction navigation moved from RIGHT to LEFT"
    Write-Host "  - Selected information/content moved from LEFT to RIGHT"
    Write-Host "  - Understanding Pollution uses one unified information box"
    Write-Host "  - From Data to Action uses one unified outer box"
    Write-Host "  - Its 5 numbered process cards remain separate"
    Write-Host "  - Vision & Mission uses one unified outer box"
    Write-Host "  - Its 5 mission cards remain separate"
    Write-Host "  - Back to Introduction remains unchanged"
    Write-Host ""
    Write-Host "Backup: $backupDir"
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
