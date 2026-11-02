import { ArrowUpRight, CheckCircle2, CircleAlert, Database, FolderOpen, LockKeyhole } from 'lucide-react'
import type { DataAvailability } from '../lib/types'

export function DataReadiness({data}:{data:DataAvailability}){
  return <div className="grid gap-4 xl:grid-cols-2">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="mb-4 flex items-center gap-2"><Database className="text-emerald-600"/><div><h3 className="font-extrabold text-slate-900">Data available now</h3><p className="text-xs text-slate-500">Everything below is supported by the attached XLSX/KMZ dataset.</p></div></div><div className="space-y-2">{data.available_now.map(item=><div key={item.key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3"><div className="flex items-center gap-3">{item.status==='available'?<CheckCircle2 size={18} className="text-emerald-600"/>:<CircleAlert size={18} className="text-amber-600"/>}<div><div className="text-sm font-bold text-slate-800">{item.label}</div><div className="text-xs text-slate-500">{item.source}</div></div></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase ${item.status==='available'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{item.status}</span></div>)}</div></div>
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><div className="mb-4 flex items-center gap-2"><LockKeyhole className="text-amber-700"/><div><h3 className="font-extrabold text-amber-950">Data to request next</h3><p className="text-xs text-amber-800">Give this exact list to Civil/GIS/institutions to unlock the next dashboard modules.</p></div></div><div className="space-y-2">{data.needed_next.map((item,i)=><div key={item.module} className="rounded-xl border border-amber-200 bg-white/70 p-3"><div className="text-xs font-black text-amber-800">{String(i+1).padStart(2,'0')} · {item.module}</div><div className="mt-1 text-sm text-slate-700">{item.data}</div></div>)}</div></div>
    <a
      className="group col-span-full flex items-center justify-between gap-4 rounded-2xl border border-slate-200 p-5 shadow-card transition hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
      href="https://drive.google.com/drive/folders/1XXpzlZMkJfIbnfHAhcDPeni27F0qsGHz"
      target="_blank"
      rel="noreferrer"
      aria-label="Open Arkavati River Data Repo in Google Drive"
    >
      <span className="flex min-w-0 items-center gap-3">
        <FolderOpen className="shrink-0 text-emerald-700" size={22}/>
        <span className="font-extrabold text-slate-900">Arkavati River Data Repo</span>
      </span>
      <ArrowUpRight className="shrink-0 text-slate-500 transition group-hover:text-emerald-700" size={19}/>
    </a>
  </div>
}
