import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { api } from '../lib/api'
import type { WorkflowItem } from '../lib/types'
import { fmtDate, sourceTitle, WorkflowStatusPill } from './WorkflowCommon'

export function MySubmissionsV18(){
  const [items,setItems]=useState<WorkflowItem[]>([]);const [error,setError]=useState('')
  async function load(){setError('');try{setItems(await api.workflows({limit:1000}))}catch(e){setError(e instanceof Error?e.message:String(e))}}
  useEffect(()=>{load()},[])
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex items-center justify-between gap-3"><div><h2 className="text-2xl font-black">My Approval Workflow</h2><p className="mt-1 text-sm text-slate-500">Technical review status for data visible to this account. Nakshatech controls technical and final approval.</p></div><button onClick={load} className="rounded-xl border border-slate-300 p-2.5"><RefreshCw size={17}/></button></div>{error&&<div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div>}<div className="mt-5 space-y-2">{items.map(item=><div key={item.public_id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 p-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="font-black text-slate-900">{sourceTitle(item)}</div><div className="mt-1 text-xs text-slate-500">{item.source_ref} · Updated {fmtDate(item.updated_at)}</div></div><WorkflowStatusPill status={item.current_status}/></div>)}{items.length===0&&<div className="py-10 text-center text-sm text-slate-500">No workflow submissions are visible to this account yet.</div>}</div></section>
}
