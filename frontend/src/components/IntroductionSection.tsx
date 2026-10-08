import { useEffect, useState, type ReactNode } from 'react'
import {
  ArrowLeft,
  ChevronRight,
  CircleDot,
  Droplets,
  Factory,
  Info,
  Landmark,
  MapPinned,
  School,
  Target,
  UsersRound,
  Waves,
  Workflow,
} from 'lucide-react'
import { api } from '../lib/api'
import type { PortalConfig } from '../lib/types'
import {
  fromDataToActionIntro,
  fromDataToActionPoints,
  keyFocusAreas,
  participatingNgos,
  riverSystemDetails,
  understandingPollutionIntro,
  understandingPollutionPoints,
} from '../data/projectOverview'

type IntroductionView = 'menu' | 'about' | 'pollution' | 'action' | 'focus' | 'collaboration' | 'study-area' | 'vision' | 'mission' | 'chairman-desk' | 'project-team'

const introductionItems = [
  { key: 'about', label: 'About Us', icon: Info },
  { key: 'pollution', label: 'Understanding the Pollution', icon: Waves },
  { key: 'action', label: 'From Data to Action', icon: Workflow },
  { key: 'focus', label: 'Key Focus Areas', icon: Target },
  { key: 'collaboration', label: 'Collaboration', icon: UsersRound },
  { key: 'study-area', label: 'Study Area Map', icon: MapPinned },
  { key: 'vision', label: 'Vision', icon: Landmark },
  { key: 'mission', label: 'Mission', icon: Landmark },
  { key: 'chairman-desk', label: "Chairman's Desk", icon: CircleDot },
  { key: 'project-team', label: 'Project Team', icon: UsersRound },
] as const

const focusIcons = [Waves, Droplets, MapPinned, Factory, MapPinned, Landmark, CircleDot, Target]

function SectionHeader({ title, subtitle, onBack }: { title: string; subtitle: string; onBack: () => void }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">Project Information</div>
        <h3 className="mt-1 text-lg font-black text-navy-950">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-navy-900 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
      >
        <ArrowLeft size={15} /> Back to Introduction
      </button>
    </div>
  )
}

function AboutUsView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <SectionHeader
        title="About Us"
        subtitle="Arkavathi River Pollution Assessment Project"
        onBack={onBack}
      />

      <div className="p-4 md:p-5">
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 text-sm leading-7 text-slate-700">
          <div className="space-y-4">

            <p>
              The Arkavathi River Pollution Assessment Project brings together
              field evidence, water-quality assessment, and geospatial
              technologies to build a clear, scientific, and auditable
              understanding of pollution conditions across the Arkavathi River
              system and to support its protection and rejuvenation.
            </p>

            <p>
              The Arkavathi River Pollution Assessment Project, initiated by the
              Government of Karnataka through Cauvery Neeravari Nigam Limited
              (CNNL) in collaboration with Naksha Tech Pvt. Ltd., is a
              comprehensive initiative aimed at assessing and mapping
              industrial, domestic, and associated pollution sources affecting
              the Arkavathi River and its tributaries.
            </p>

            <p>
              The study encompasses the approximately 178.30 km-long Arkavathi
              River system, along with its major tributaries â€” Kumudavathi,
              Vrishabhavathi, and Suvarnamukhi â€” and covers a basin area of
              approximately 4,156 kmÂ².
            </p>

            <ul className="list-disc space-y-3 pl-6">
              <li>
                The study integrates LiDAR and UAV/drone surveys, GIS and spatial
                analysis, water-quality and quantity assessment, field
                investigations, hydrological and hydraulic analysis, and
                environmental assessment. It covers major industrial areas and
                pollution-prone locations across the Arkavathi basin to identify,
                assess, and quantify pollution sources and their impacts on the
                river system.
              </li>

              <li>
                The project aims to develop a comprehensive spatial and
                environmental understanding of the Arkavathi River basin,
                identify pollution hotspots and contributing sources, and support
                the formulation of appropriate mitigation, rejuvenation, and
                river-management measures. The findings will ultimately
                contribute to the preparation of a Comprehensive Project Report
                (CPR) for effective pollution control and sustainable management
                of the Arkavathi River and its tributaries.
              </li>
            </ul>

          </div>
        </article>
      </div>
    </div>
  )
}

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

function KeyFocusAreasView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <SectionHeader
        title="Key Focus Areas"
        subtitle="Eight technical and environmental priorities guiding the assessment."
        onBack={onBack}
      />
      <div className="grid gap-3 p-4 md:grid-cols-2 md:p-5">
        {keyFocusAreas.map((area, index) => {
          const Icon = focusIcons[index]
          return (
            <article key={area} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-50 text-violet-700"><Icon size={18} /></div>
              <div className="text-sm font-bold leading-5 text-slate-700">{area}</div>
            </article>
          )
        })}
      </div>
    </div>
  )
}

function VisionView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <SectionHeader
        title="Vision"
        subtitle="A shared long-term direction for the Arkavathy River Basin."
        onBack={onBack}
      />

      <div className="p-4 md:p-5">
        <article className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700">
              <Landmark size={19} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">
                Vision
              </div>
              <h4 className="mt-1 text-base font-black text-slate-900">
                Arkavathy River Basin
              </h4>
            </div>
          </div>

          <p className="mt-4 text-sm leading-7 text-slate-700">
            A clean, healthy and resilient Arkavathy River Basin through integrated pollution control,
            ecological restoration and shared responsibility.
          </p>
        </article>
      </div>
    </div>
  )
}

function MissionView({ onBack }: { onBack: () => void }) {
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
        title="Mission"
        subtitle="From identification and prevention to monitoring and restoration."
        onBack={onBack}
      />

      <div className="p-4 md:p-5">
        <article className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-5">
          <div className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">
            Mission
          </div>
          <h4 className="mt-1 text-base font-black text-slate-900">
            From identification to restoration
          </h4>

          <div className="mt-5 grid gap-2 lg:grid-cols-5">
            {missionSteps.map((step, index) => (
              <div key={step} className="relative">
                <div className="flex min-h-[88px] items-center justify-center rounded-xl border border-emerald-100 bg-white px-3 py-4 text-center">
                  <div>
                    <div className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-[11px] font-black text-emerald-800">
                      {index + 1}
                    </div>
                    <div className="text-xs font-extrabold leading-5 text-slate-700">
                      {step}
                    </div>
                  </div>
                </div>

                {index < missionSteps.length - 1 && (
                  <div className="py-1 text-center text-lg font-black text-emerald-500 lg:absolute lg:-right-[9px] lg:top-1/2 lg:z-10 lg:-translate-y-1/2 lg:py-0">
                    &rarr;
                  </div>
                )}
              </div>
            ))}
          </div>
        </article>
      </div>
    </div>
  )
}

function ProjectTeamView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <SectionHeader
        title="Project Team"
        subtitle="Project team information."
        onBack={onBack}
      />

      <div className="p-4 md:p-5">
        <article className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <UsersRound size={19} />
            </div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">
                Project Team
              </div>
              <h4 className="mt-1 text-base font-black text-slate-900">
                Team information will be added here.
              </h4>
            </div>
          </div>
        </article>
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
function CollaborationView({ onBack, config }: { onBack: () => void; config: PortalConfig | null }) {
  const institutions = config?.institutions?.length
    ? config.institutions.map(institution => institution.name)
    : Array.from({ length: 12 }, (_, index) => `Institution ${String(index + 1).padStart(2, '0')}`)

  return (
    <div>
      <SectionHeader
        title="Collaboration"
        subtitle="Participating NGOs and institutes supporting the Arkavathi River Pollution Assessment Project."
        onBack={onBack}
      />
      <div className="grid gap-4 p-4 md:p-5 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><UsersRound size={19} /></div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-emerald-700">Project Partners</div>
              <h4 className="font-black text-slate-900">Participating NGOs</h4>
            </div>
          </div>
          {participatingNgos.length > 0 ? (
            <div className="mt-4 grid gap-2">
              {participatingNgos.map(name => <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{name}</div>)}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              Official NGO names were not included in the supplied project package. The section is ready for client-approved NGO names without any backend change.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700"><School size={19} /></div>
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-blue-700">Academic Collaboration</div>
              <h4 className="font-black text-slate-900">Participating Institutes</h4>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {institutions.map(name => <div key={name} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{name}</div>)}
          </div>
          {config?.institution_names_status && (
            <div className="mt-3 text-[11px] leading-5 text-slate-500">{config.institution_names_status}</div>
          )}
        </section>
      </div>
    </div>
  )
}

function StudyAreaView({ onBack }: { onBack: () => void }) {
  return (
    <div>
      <SectionHeader
        title="Study Area Map"
        subtitle="Arkavathi River basin, Cauvery basin context, major tributaries and relevant project study area."
        onBack={onBack}
      />
      <div className="space-y-5 p-4 md:p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <img src="/project/arkavathi-study-area-map.png" alt="Arkavathi River system study area map" className="mx-auto max-h-[620px] w-full object-contain" />
          </div>
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">Study Area Summary</div>
            <h4 className="mt-1 text-xl font-black text-navy-950">Arkavathi River Basin</h4>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-3"><span className="font-semibold text-slate-600">Total River Length</span><strong className="text-slate-900">178 km</strong></div>
              <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-3"><span className="font-semibold text-slate-600">Catchment Area</span><strong className="text-slate-900">4,156 sq. km</strong></div>
              <div className="flex items-center justify-between gap-4 border-b border-blue-100 pb-3"><span className="font-semibold text-slate-600">Major River Basin</span><strong className="text-slate-900">Cauvery</strong></div>
              <div className="flex items-center justify-between gap-4"><span className="font-semibold text-slate-600">Major Tributaries</span><strong className="text-slate-900">3</strong></div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">River System</div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {riverSystemDetails.map((river, index) => (
              <article key={river.name} className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className={`grid h-9 w-9 place-items-center rounded-xl ${index === 0 ? 'bg-blue-100 text-blue-800' : 'bg-cyan-50 text-cyan-700'}`}><Waves size={18} /></div>
                <div className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{river.kind}</div>
                <h5 className="mt-1 text-base font-black text-slate-900">{river.name}</h5>
                <p className="mt-2 text-xs leading-5 text-slate-600">{river.description}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function IntroductionSideNavigation({
  activeView,
  onSelect,
}: {
  activeView: IntroductionView
  onSelect: (view: IntroductionView) => void
}) {
  return (
    <aside className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
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

      <div className="flex flex-1 flex-col divide-y divide-slate-200">
        {introductionItems.map(item => {
          const Icon = item.icon
          const isActive = activeView === item.key

          return (
            <button
              type="button"
              key={item.key}
              onClick={() => onSelect(item.key as IntroductionView)}
              aria-current={isActive ? 'page' : undefined}
              className={`group flex min-h-[58px] flex-1 w-full items-center gap-3 px-4 py-3 text-left transition ${
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
    <div className="grid items-stretch gap-4 xl:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="h-full xl:sticky xl:top-4">
        <IntroductionSideNavigation
          activeView={activeView}
          onSelect={onSelect}
        />
      </div>

      <section className="h-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
        {children}
      </section>
    </div>
  )
}
export function IntroductionSection() {
  const [view, setView] = useState<IntroductionView>('menu')
  const [portalConfig, setPortalConfig] = useState<PortalConfig | null>(null)

  useEffect(() => {
    let cancelled = false
    api.portalConfig().then(config => {
      if (!cancelled) setPortalConfig(config)
    }).catch(() => {
      // Collaboration remains usable with safe Institution 01-12 fallbacks.
    })
    return () => { cancelled = true }
  }, [])

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
  if (view === 'vision') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <VisionView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }

  if (view === 'mission') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <MissionView onBack={() => setView('menu')} />
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

  if (view === 'project-team') {
    return (
      <IntroductionDetailLayout activeView={view} onSelect={setView}>
        <ProjectTeamView onBack={() => setView('menu')} />
      </IntroductionDetailLayout>
    )
  }
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-col gap-3 bg-gradient-to-r from-navy-950 via-navy-900 to-blue-700 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-200">Project Information</div>
          <h2 className="mt-1 text-lg font-black uppercase tracking-[0.08em] md:text-xl">Introduction</h2>
        </div>
        <div className="hidden rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.10em] text-blue-100 lg:block">
          Arkavati River Population Assessment Project
        </div>
      </div>

      <div className="grid gap-px bg-slate-200 md:grid-cols-2">
        {introductionItems.map(item => {
          const Icon = item.icon
          return (
            <button
              type="button"
              key={item.key}
              onClick={() => setView(item.key as IntroductionView)}
              className="group flex min-h-[72px] w-full items-center gap-3 bg-white px-4 py-3 text-left transition-colors hover:bg-blue-50/70 md:px-5"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-blue-100 bg-blue-50 text-blue-700 transition group-hover:border-blue-200 group-hover:bg-blue-100">
                <Icon size={18} strokeWidth={2.1} />
              </div>
              <div className="min-w-0 flex-1 text-sm font-extrabold text-slate-800 md:text-[15px]">{item.label}</div>
              <ChevronRight size={18} className="shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
            </button>
          )
        })}
      </div>
    </section>
  )
}





