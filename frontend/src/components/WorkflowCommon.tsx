import type { WorkflowItem, WorkflowStatus } from '../lib/types'

export const workflowStatuses:WorkflowStatus[]=['DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUIRED','RESUBMITTED','TECHNICALLY_APPROVED','FINAL_APPROVED','INTEGRATED','REJECTED']

const statusClass:Record<WorkflowStatus,string>={
  DRAFT:'bg-slate-100 text-slate-700',
  SUBMITTED:'bg-blue-100 text-blue-800',
  UNDER_REVIEW:'bg-violet-100 text-violet-800',
  CORRECTION_REQUIRED:'bg-amber-100 text-amber-900',
  RESUBMITTED:'bg-cyan-100 text-cyan-800',
  TECHNICALLY_APPROVED:'bg-indigo-100 text-indigo-800',
  FINAL_APPROVED:'bg-emerald-100 text-emerald-800',
  INTEGRATED:'bg-teal-100 text-teal-900',
  REJECTED:'bg-rose-100 text-rose-800'
}

export function WorkflowStatusPill({status}:{status:WorkflowStatus}){
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${statusClass[status]}`}>{status.replace(/_/g,' ')}</span>
}

export function fmtDate(value:string|null|undefined){
  if(!value)return '—'
  const d=new Date(value)
  return Number.isNaN(d.getTime())?value:d.toLocaleString()
}

export function fmtBytes(value:number|undefined|null){
  const n=Number(value||0)
  if(n<1024)return `${n} B`
  if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`
  if(n<1024*1024*1024)return `${(n/1024/1024).toFixed(1)} MB`
  return `${(n/1024/1024/1024).toFixed(2)} GB`
}

export function sourceTitle(item:WorkflowItem){
  if(item.source_type==='REPOSITORY_BATCH')return `${item.source.department_name||item.department_id||'Department'} · ${item.source.category||'Repository batch'}`
  return `${item.source.institution_name||item.institution_id||'Institution'} · ${(item.source.entry_type||'Field record').replace(/_/g,' ')}`
}

export function WorkflowSourceSummary({item}:{item:WorkflowItem}){
  if(item.source_type==='REPOSITORY_BATCH')return <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
    <Info label="Department" value={item.source.department_name||item.department_id}/>
    <Info label="Category" value={item.source.category}/>
    <Info label="Data date" value={item.source.data_date}/>
    <Info label="Files / Size" value={`${item.source.total_files??0} · ${fmtBytes(item.source.total_bytes)}`}/>
    <div className="sm:col-span-2 xl:col-span-4"><Info label="Description" value={item.source.description||'—'}/></div>
  </div>
  const fields=item.source.fields||{}
  const keys=Object.keys(fields).filter(k=>fields[k]!==''&&fields[k]!=null).slice(0,8)
  return <div className="space-y-2 text-xs text-slate-600">
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><Info label="Institution" value={item.source.institution_name||item.institution_id}/><Info label="Record type" value={String(item.source.entry_type||'').replace(/_/g,' ')}/><Info label="Created by" value={item.source.created_by_name}/><Info label="Record" value={item.source_ref}/></div>
    {keys.length>0&&<div className="grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-4">{keys.map(k=><Info key={k} label={k.replace(/_/g,' ')} value={String(fields[k])}/>)}</div>}
  </div>
}

function Info({label,value}:{label:string;value:any}){
  return <div><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-0.5 break-words font-semibold text-slate-700">{value==null||value===''?'—':String(value)}</div></div>
}
