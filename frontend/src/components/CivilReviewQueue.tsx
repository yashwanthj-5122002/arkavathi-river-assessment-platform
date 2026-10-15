import { useEffect, useState } from 'react'
import { CheckCircle2, ClipboardCheck, RefreshCw, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import type { CivilEntry, CivilStatus } from '../lib/types'

const style:Record<CivilStatus,string>={DRAFT:'bg-slate-100 text-slate-700',SUBMITTED:'bg-blue-100 text-blue-800',UNDER_REVIEW:'bg-violet-100 text-violet-800',RETURNED:'bg-amber-100 text-amber-900',APPROVED:'bg-emerald-100 text-emerald-800'}
const label=(v:string)=>v.replace(/_/g,' ')

export function CivilReviewQueue(){
  const [entries,setEntries]=useState<CivilEntry[]>([])
  const [error,setError]=useState('')
  const [busy,setBusy]=useState('')
  async function load(){setError('');try{setEntries(await api.reviewEntries())}catch(e){setError(e instanceof Error?e.message:String(e))}}
  useEffect(()=>{load()},[])
  async function act(entry:CivilEntry,action:'review'|'approve'|'return'){
    let comment=''
    if(action==='return'){
      comment=window.prompt('Enter the correction / return comment for the institution:','')?.trim()||''
      if(!comment)return
    }else if(action==='approve'){
      comment=window.prompt('Optional approval comment:','')?.trim()||''
    }
    setBusy(entry.public_id);setError('')
    try{await api.reviewCivilEntry(entry.public_id,action,comment);await load()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setBusy('')}
  }
  const queue=entries.filter(e=>['SUBMITTED','UNDER_REVIEW'].includes(e.status))
  return <section id="civil-review" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-navy-700"><ClipboardCheck size={15}/> Company review workflow</div><h2 className="mt-1 text-xl font-black text-slate-900">Institution Submission Review Queue</h2><p className="mt-1 text-sm text-slate-500">Submitted institution records appear here. Approve them for CNNL visibility or return them with a correction note.</p></div><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold"><RefreshCw size={15}/>Refresh</button></div>
    {error&&<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div>}
    <div className="mt-5 space-y-3">{queue.map(e=><article key={e.public_id} className="rounded-2xl border border-slate-200 p-4"><div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between"><div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-black text-navy-900">{e.public_id}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${style[e.status]}`}>{label(e.status)}</span></div><div className="mt-2 text-lg font-black text-slate-900">{label(e.entry_type)}</div><div className="mt-1 text-xs text-slate-500">{e.institution_name} · {e.institution_id} · Submitted by {e.created_by_name}</div><div className="mt-3 grid gap-1 text-xs text-slate-700 sm:grid-cols-2 xl:grid-cols-3">{Object.entries(e.fields).slice(0,9).map(([k,v])=><div key={k}><span className="text-slate-400">{label(k)}:</span> {String(v)}</div>)}</div>{e.attachments.length>0&&<div className="mt-3 text-xs font-semibold text-slate-600">Attachments: {e.attachments.map(a=>a.original_name).join(', ')}</div>}</div><div className="flex shrink-0 flex-wrap gap-2"><button disabled={busy===e.public_id||e.status!=='SUBMITTED'} onClick={()=>act(e,'review')} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-40">Under Review</button><button disabled={busy===e.public_id} onClick={()=>act(e,'return')} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900 disabled:opacity-40"><RotateCcw size={14}/>Return</button><button disabled={busy===e.public_id} onClick={()=>act(e,'approve')} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><CheckCircle2 size={14}/>Approve</button></div></div></article>)}{queue.length===0&&<div className="rounded-xl bg-slate-50 py-10 text-center text-sm text-slate-500">No submitted institution records are waiting for review.</div>}</div>
    <div className="mt-5 grid gap-3 sm:grid-cols-4">{(['DRAFT','RETURNED','APPROVED'] as CivilStatus[]).map(s=><div key={s} className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label(s)}</div><div className="mt-1 text-xl font-black">{entries.filter(e=>e.status===s).length}</div></div>)}</div>
  </section>
}
