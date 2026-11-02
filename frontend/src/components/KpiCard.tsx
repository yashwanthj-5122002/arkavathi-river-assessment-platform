import type { ReactNode } from 'react'

export function KpiCard({label,value,detail,icon,accent='blue'}:{label:string;value:string;detail?:string;icon:ReactNode;accent?:'blue'|'green'|'cyan'|'violet'|'amber'|'rose'}) {
  const tone = {
    blue:'bg-blue-50 text-blue-700 border-blue-100',
    green:'bg-emerald-50 text-emerald-700 border-emerald-100',
    cyan:'bg-cyan-50 text-cyan-700 border-cyan-100',
    violet:'bg-violet-50 text-violet-700 border-violet-100',
    amber:'bg-amber-50 text-amber-700 border-amber-100',
    rose:'bg-rose-50 text-rose-700 border-rose-100'
  }[accent]
  return <div className={`rounded-2xl border bg-white p-4 shadow-card ${tone.split(' ')[2]}`}>
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0"><div className="text-[11px] font-bold uppercase tracking-[.08em] text-slate-500">{label}</div><div className="mt-1 truncate text-2xl font-black text-slate-900">{value}</div>{detail && <div className="mt-1 text-xs text-slate-500">{detail}</div>}</div>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tone.split(' ').slice(0,2).join(' ')}`}>{icon}</div>
    </div>
  </div>
}
