import { useEffect, useState } from 'react'
import { BadgeCheck, RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import type { WorkflowItem } from '../lib/types'
import { fmtDate, sourceTitle, WorkflowStatusPill } from './WorkflowCommon'

export function CnnlApprovedData(){
  const [items,setItems]=useState<WorkflowItem[]>([]);const [error,setError]=useState('')
  async function load(){setError('');try{setItems(await api.cnnlApproved())}catch(e){setError(e instanceof Error?e.message:String(e))}}
  useEffect(()=>{load()},[])
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex items-center justify-between gap-3"><div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.16em] text-emerald-700"><BadgeCheck size={15}/>Approved Outputs</div><h2 className="mt-1 text-2xl font-black">CNNL Approved Data</h2><p className="mt-1 text-sm text-slate-500">Only Nakshatech Final Approved or Integrated outputs are exposed here.</p></div><button onClick={load} className="rounded-xl border border-slate-300 p-2.5"><RefreshCw size={17}/></button></div>{error&&<div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div>}<div className="mt-5 space-y-2">{items.map(item=><div key={item.public_id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="font-black">{sourceTitle(item)}</div><div className="mt-1 text-xs text-slate-500">{item.source_ref} · Final approval {fmtDate(item.final_approved_at)}</div></div><WorkflowStatusPill status={item.current_status}/></div>)}{items.length===0&&<div className="py-10 text-center text-sm text-slate-500">No final-approved outputs have been published to CNNL yet.</div>}</div></section>
}
