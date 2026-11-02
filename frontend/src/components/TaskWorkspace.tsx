import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ClipboardList, Clock3, Plus, RefreshCw, Send, X } from 'lucide-react'
import { api } from '../lib/api'
import type { PermissionProfile, TaskItem, TaskPriority, TaskStatus, TaskTargets } from '../lib/types'
import { fmtDate } from './WorkflowCommon'

const taskStatusClass:Record<TaskStatus,string>={
  DRAFT:'bg-slate-100 text-slate-700',ASSIGNED:'bg-blue-100 text-blue-800',IN_PROGRESS:'bg-cyan-100 text-cyan-800',SUBMITTED:'bg-violet-100 text-violet-800',UNDER_REVIEW:'bg-indigo-100 text-indigo-800',CORRECTION_REQUIRED:'bg-amber-100 text-amber-900',RESUBMITTED:'bg-sky-100 text-sky-800',APPROVED:'bg-emerald-100 text-emerald-800',COMPLETED:'bg-teal-100 text-teal-900',CANCELLED:'bg-rose-100 text-rose-800'
}

export function TaskWorkspace({title='Task Management',subtitle='Create, assign, execute and approve Arkavati project tasks.'}:{title?:string;subtitle?:string}){
  const [permissions,setPermissions]=useState<PermissionProfile|null>(null)
  const [tasks,setTasks]=useState<TaskItem[]>([])
  const [targets,setTargets]=useState<TaskTargets|null>(null)
  const [selected,setSelected]=useState<TaskItem|null>(null)
  const [showCreate,setShowCreate]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')
  const [status,setStatus]=useState<'ALL'|TaskStatus>('ALL')
  const can=(p:string)=>permissions?.permissions.includes(p)??false

  async function load(){
    setError('')
    try{
      const profile=permissions??await api.permissionsMe()
      if(!permissions)setPermissions(profile)
      const list=await api.tasks(status==='ALL'?undefined:{status})
      setTasks(list)
      if(profile.permissions.includes('TASK.ASSIGN')&&!targets){try{setTargets(await api.taskTargets())}catch{} }
    }catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  useEffect(()=>{load()},[status])

  const counts=useMemo(()=>({open:tasks.filter(t=>!['APPROVED','COMPLETED','CANCELLED'].includes(t.status)).length,review:tasks.filter(t=>['SUBMITTED','RESUBMITTED','UNDER_REVIEW'].includes(t.status)).length,correction:tasks.filter(t=>t.status==='CORRECTION_REQUIRED').length,done:tasks.filter(t=>['APPROVED','COMPLETED'].includes(t.status)).length}),[tasks])

  async function openTask(id:string){setLoading(true);try{setSelected(await api.task(id))}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}}
  async function action(name:'start'|'submit'|'review'|'return'|'approve'|'complete',comment=''){
    if(!selected)return
    setLoading(true);setError('')
    try{const updated=await api.taskAction(selected.public_id,name,comment);setSelected(updated);await load()}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }

  return <div className="space-y-4">
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black uppercase tracking-[.16em] text-navy-700">Workflow</div><h2 className="mt-1 text-2xl font-black text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{subtitle}</p></div><div className="flex gap-2">{can('TASK.CREATE')&&<button onClick={()=>setShowCreate(true)} className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-4 py-2.5 text-sm font-black text-white"><Plus size={17}/>Create Task</button>}<button onClick={load} className="rounded-xl border border-slate-300 bg-white p-2.5 text-slate-600"><RefreshCw size={17}/></button></div></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Open',counts.open],['In Review',counts.review],['Correction Required',counts.correction],['Approved / Complete',counts.done]].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-2xl font-black text-slate-900">{value}</div></div>)}</div>
    </section>
    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black text-slate-900">Tasks visible to this account</h3><select value={status} onChange={e=>setStatus(e.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"><option value="ALL">All statuses</option>{['DRAFT','ASSIGNED','IN_PROGRESS','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUIRED','RESUBMITTED','APPROVED','COMPLETED'].map(s=><option key={s}>{s}</option>)}</select></div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Task</th><th className="px-3 py-3">Scope</th><th className="px-3 py-3">Priority</th><th className="px-3 py-3">Due</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th><th className="px-3 py-3"></th></tr></thead><tbody>{tasks.map(t=><tr key={t.public_id} className="border-t border-slate-100"><td className="px-3 py-3"><div className="font-black text-slate-900">{t.title}</div><div className="mt-1 font-mono text-[10px] text-slate-400">{t.public_id}</div></td><td className="px-3 py-3 text-slate-600">{t.department_id||t.institution_id||t.micro_catchment_id||'Project'}</td><td className="px-3 py-3 font-black">{t.priority}</td><td className="px-3 py-3 text-slate-500">{t.due_date||'—'}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${taskStatusClass[t.status]}`}>{t.status.replace(/_/g,' ')}</span></td><td className="px-3 py-3 text-slate-500">{fmtDate(t.updated_at)}</td><td className="px-3 py-3 text-right"><button onClick={()=>openTask(t.public_id)} className="rounded-lg border border-slate-300 px-3 py-2 font-black text-navy-900">Open</button></td></tr>)}{tasks.length===0&&<tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">No tasks are available for this account yet.</td></tr>}</tbody></table></div>
    </section>
    {showCreate&&<CreateTaskModal targets={targets} busy={loading} onClose={()=>setShowCreate(false)} onCreated={async task=>{setShowCreate(false);await load();await openTask(task.public_id)}}/>}
    {selected&&<TaskDetail task={selected} permissions={permissions} busy={loading} onClose={()=>setSelected(null)} onAction={action}/>} 
  </div>
}

function CreateTaskModal({targets,busy,onClose,onCreated}:{targets:TaskTargets|null;busy:boolean;onClose:()=>void;onCreated:(t:TaskItem)=>void}){
  const [title,setTitle]=useState('');const [description,setDescription]=useState('');const [priority,setPriority]=useState<TaskPriority>('MEDIUM');const [due,setDue]=useState('');const [targetType,setTargetType]=useState<'PROJECT'|'DEPARTMENT'|'INSTITUTION'>('DEPARTMENT');const [target,setTarget]=useState('');const [micro,setMicro]=useState('');const [error,setError]=useState('')
  async function submit(){
    if(!title.trim()){setError('Task title is required.');return}
    if(targetType!=='PROJECT'&&!target){setError('Select a task target.');return}
    setError('')
    try{
      const created=await api.createTask({title:title.trim(),description:description.trim(),priority,due_date:due||undefined,micro_catchment_id:micro||undefined,department_id:targetType==='DEPARTMENT'?target:undefined,institution_id:targetType==='INSTITUTION'?target:undefined})
      let result=created
      if(targetType==='INSTITUTION'&&target)result=await api.assignTask(created.public_id,{assignee_organization_id:target,comment:'Assigned from Task Management'})
      if(targetType==='DEPARTMENT'&&target){
        const uploader=targets?.eligible_users.find(u=>u.role==='COMPANY_DEPARTMENT_USER')
        result=await api.assignTask(created.public_id,{assignee_department_id:target,assignee_user_id:uploader?.id,comment:'Assigned to Nakshatech department team'})
      }
      onCreated(result)
    }catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  return <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-4"><div className="w-full max-w-3xl rounded-3xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-navy-700">Nakshatech Task Control</div><h3 className="mt-1 text-2xl font-black">Create project task</h3></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X size={18}/></button></div>{error&&<div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div>}<div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Task title"><input value={title} onChange={e=>setTitle(e.target.value)} className={input}/></Field><Field label="Priority"><select value={priority} onChange={e=>setPriority(e.target.value as TaskPriority)} className={input}>{['LOW','MEDIUM','HIGH','CRITICAL'].map(x=><option key={x}>{x}</option>)}</select></Field><Field label="Target type"><select value={targetType} onChange={e=>{setTargetType(e.target.value as any);setTarget('')}} className={input}><option value="DEPARTMENT">Nakshatech Department</option><option value="INSTITUTION">Engineering Institution</option><option value="PROJECT">Project-wide</option></select></Field>{targetType!=='PROJECT'&&<Field label="Target"><select value={target} onChange={e=>setTarget(e.target.value)} className={input}><option value="">Select…</option>{targetType==='DEPARTMENT'?targets?.departments.map(x=><option key={x.id} value={x.id}>{x.name}</option>):targets?.institutions.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>}<Field label="Due date"><input type="date" value={due} onChange={e=>setDue(e.target.value)} className={input}/></Field><Field label="Micro-catchment ID (optional)"><input value={micro} onChange={e=>setMicro(e.target.value)} placeholder="MC-05" className={input}/></Field><div className="md:col-span-2"><Field label="Description"><textarea rows={4} value={description} onChange={e=>setDescription(e.target.value)} className={input}/></Field></div></div><div className="mt-6 flex justify-end gap-2"><button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black">Cancel</button><button disabled={busy} onClick={submit} className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50"><Send size={16}/>Create & Assign</button></div></div></div>
}

function TaskDetail({task,permissions,busy,onClose,onAction}:{task:TaskItem;permissions:PermissionProfile|null;busy:boolean;onClose:()=>void;onAction:(a:'start'|'submit'|'review'|'return'|'approve'|'complete',comment?:string)=>void}){
  const [comment,setComment]=useState('');const can=(p:string)=>permissions?.permissions.includes(p)??false
  const actions:{key:'start'|'submit'|'review'|'return'|'approve'|'complete';label:string;show:boolean;danger?:boolean}[]=[
    {key:'start',label:'Start Task',show:can('TASK.UPDATE_ASSIGNED')&&['ASSIGNED','CORRECTION_REQUIRED'].includes(task.status)},
    {key:'submit',label:task.status==='CORRECTION_REQUIRED'?'Resubmit':'Submit Task',show:can('TASK.UPDATE_ASSIGNED')&&['IN_PROGRESS','CORRECTION_REQUIRED'].includes(task.status)},
    {key:'review',label:'Start Review',show:can('TASK.REVIEW')&&['SUBMITTED','RESUBMITTED'].includes(task.status)},
    {key:'return',label:'Return for Correction',show:can('TASK.REVIEW')&&['SUBMITTED','RESUBMITTED','UNDER_REVIEW'].includes(task.status),danger:true},
    {key:'approve',label:'Approve Task',show:can('TASK.APPROVE')&&task.status==='UNDER_REVIEW'},
    {key:'complete',label:'Mark Completed',show:can('TASK.APPROVE')&&task.status==='APPROVED'}]
  return <div className="fixed inset-0 z-[120] flex justify-end bg-slate-950/55"><div className="h-full w-full max-w-2xl overflow-y-auto bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><div className="font-mono text-[10px] font-bold text-slate-400">{task.public_id}</div><h3 className="mt-1 text-2xl font-black">{task.title}</h3><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${taskStatusClass[task.status]}`}>{task.status.replace(/_/g,' ')}</span></div><button onClick={onClose} className="rounded-xl border border-slate-200 p-2"><X size={18}/></button></div><p className="mt-5 text-sm leading-6 text-slate-600">{task.description||'No description supplied.'}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><Mini label="Department" value={task.department_id}/><Mini label="Institution" value={task.institution_id}/><Mini label="Micro-catchment" value={task.micro_catchment_id}/><Mini label="Priority" value={task.priority}/><Mini label="Due date" value={task.due_date}/><Mini label="Updated" value={fmtDate(task.updated_at)}/></div><div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 font-black"><ClipboardList size={17}/>Assignments</div><div className="mt-3 space-y-2">{task.assignments.map(a=><div key={a.id} className="rounded-xl bg-white p-3 text-xs"><strong>{a.assignee_name||a.assignee_organization_id||a.assignee_department_id||`User ${a.assignee_user_id}`}</strong><div className="mt-1 text-slate-500">{a.assignee_email||a.assignee_department_id||a.assignee_organization_id}</div></div>)}{task.assignments.length===0&&<div className="text-xs text-slate-500">No assignment yet.</div>}</div></div>{actions.some(a=>a.show)&&<div className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-4"><div className="text-xs font-black uppercase tracking-wider text-navy-700">Workflow action</div><textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} placeholder="Review / correction comment (required when returning)" className={`${input} mt-3 bg-white`}/><div className="mt-3 flex flex-wrap gap-2">{actions.filter(a=>a.show).map(a=><button disabled={busy||(a.key==='return'&&!comment.trim())} key={a.key} onClick={()=>onAction(a.key,comment)} className={`rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:opacity-40 ${a.danger?'bg-amber-700':'bg-navy-950'}`}>{a.label}</button>)}</div></div>}<div className="mt-6"><div className="flex items-center gap-2 font-black"><Clock3 size={17}/>Task history</div><div className="mt-3 space-y-2">{task.history?.map((h,i)=><div key={`${h.created_at}-${i}`} className="rounded-xl border border-slate-200 p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong>{h.action.replace(/_/g,' ')}</strong><span className="text-slate-400">{fmtDate(h.created_at)}</span></div><div className="mt-1 text-slate-500">{h.performed_by_name||'System'} · {h.from_status||'—'} → {h.to_status}</div>{h.comment&&<div className="mt-2 rounded-lg bg-slate-50 p-2 text-slate-600">{h.comment}</div>}</div>)}</div></div></div></div>
}

const input='mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-blue-100'
function Field({label,children}:{label:string;children:any}){return <label className="text-xs font-bold text-slate-700">{label}{children}</label>}
function Mini({label,value}:{label:string;value:any}){return <div className="rounded-xl border border-slate-200 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-sm font-bold text-slate-800">{value||'—'}</div></div>}
