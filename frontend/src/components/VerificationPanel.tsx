import { BadgeCheck, CircleAlert } from 'lucide-react'
import type { Verification } from '../lib/types'

export function VerificationPanel({data}:{data:Verification}){
  return <div className={`rounded-2xl border p-5 ${data.validation_passed?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3">{data.validation_passed?<BadgeCheck className="mt-0.5 text-emerald-700"/>:<CircleAlert className="mt-0.5 text-amber-700"/>}<div className="min-w-0"><h3 className="font-extrabold text-slate-900">Dataset verification: {data.validation_passed?'PASSED':'REVIEW'}</h3><div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{Object.entries(data.checks).map(([k,v])=><div key={k} className="rounded-lg bg-white/80 px-3 py-2 text-xs"><div className="font-semibold text-slate-500">{k.replace(/_/g,' ')}</div><div className="mt-1 font-black text-slate-800">{typeof v==='boolean'?(v?'PASS':'FAIL'):String(v)}</div></div>)}</div><p className="mt-3 text-xs leading-5 text-slate-600">{data.note}</p>{data.issues.length>0&&<ul className="mt-2 list-disc pl-5 text-xs text-amber-800">{data.issues.map(i=><li key={i}>{i}</li>)}</ul>}</div></div></div>
}
