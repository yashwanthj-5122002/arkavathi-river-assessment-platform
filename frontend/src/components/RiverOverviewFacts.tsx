import { Droplets, Factory, Landmark, Map, Route, Waves } from 'lucide-react'
import { riverOverviewFacts } from '../data/projectOverview'

const icons = [Route, Map, Landmark, Waves, Droplets, Factory]

const tones = {
  blue: 'border-blue-100 bg-blue-50 text-blue-700',
  cyan: 'border-cyan-100 bg-cyan-50 text-cyan-700',
  violet: 'border-violet-100 bg-violet-50 text-violet-700',
  green: 'border-emerald-100 bg-emerald-50 text-emerald-700',
  amber: 'border-amber-100 bg-amber-50 text-amber-700',
  rose: 'border-rose-100 bg-rose-50 text-rose-700',
} as const

export function RiverOverviewFacts() {
  return (
    <section aria-label="Arkavathi river overview facts" className="ark-overview-facts pb-1">
      <div className="ark-facts-grid grid gap-3">
        {riverOverviewFacts.map((fact, index) => {
          const Icon = icons[index]
          const tone = tones[fact.tone]
          return (
            <article key={fact.label} className="ark-fact-card rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="ark-fact-label text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{fact.label}</div>
                  <div className="ark-fact-value mt-1 text-2xl font-black leading-tight text-slate-900">{fact.value}</div>
                  {'detail' in fact && fact.detail && <div className="mt-2 text-xs leading-5 text-slate-500">{fact.detail}</div>}
                  {'detailLines' in fact && fact.detailLines && (
                    <div className="mt-2 space-y-0.5 text-[11px] leading-4 text-slate-600">
                      {fact.detailLines.map(line => <div key={line}>{line}</div>)}
                    </div>
                  )}
                </div>
                <div className={`ark-fact-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${tone}`}>
                  <Icon size={19} />
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
