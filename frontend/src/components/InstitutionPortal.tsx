import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, Database, FileText, FolderOpen,
  Home, Landmark, ListChecks, MapPinned, Paperclip, PlusCircle, RefreshCw, Send, ShieldCheck,
  FlaskConical, TestTube2, Upload, Waves
} from 'lucide-react'
import { api } from '../lib/api'
import type { AuthUser, CivilEntry, CivilEntryType, CivilStatus, InstitutionOverview } from '../lib/types'
import { AuthenticatedHeader } from './AuthenticatedHeader'
import { Bell, GitPullRequest } from 'lucide-react'
import { TaskWorkspace } from './TaskWorkspace'
import { MySubmissionsV18 } from './MySubmissionsV18'
import { NotificationsCentre } from './NotificationsCentre'
import { ScientificModules } from './ScientificModules'

type PortalView = 'dashboard'|'new'|'records'|'submissions'|'scientific'|'tasks'|'workflow'|'notifications'
type FieldKind = 'text'|'number'|'date'|'select'|'textarea'
type FieldDef = {key:string;label:string;kind?:FieldKind;required?:boolean;options?:string[];placeholder?:string}
type EntryDef = {type:CivilEntryType;title:string;description:string;icon:any;fields:FieldDef[]}

const ENTRY_DEFS:EntryDef[]=[
  {type:'RIVER_SURVEY',title:'River Survey',description:'Location, chainage, GPS, channel geometry and condition',icon:Waves,fields:[
    {key:'location_id',label:'Location ID',required:true,placeholder:'LOC-001'},
    {key:'river_tributary',label:'River / Tributary Name',required:true,placeholder:'Arkavathi River'},
    {key:'chainage_km',label:'Chainage (km)',kind:'number',required:true},
    {key:'latitude',label:'Latitude',kind:'number',required:true},{key:'longitude',label:'Longitude',kind:'number',required:true},
    {key:'river_width_m',label:'River Width (m)',kind:'number'},{key:'water_depth_m',label:'Water Depth (m)',kind:'number'},
    {key:'bed_level_rl',label:'Bed Level (RL)',kind:'number'},
    {key:'bank_condition',label:'Bank Condition',kind:'select',options:['Good','Poor','Critical']},
    {key:'flow_condition',label:'Flow Condition',kind:'select',options:['Flowing','Low','Dry']},
    {key:'remarks',label:'Remarks',kind:'textarea',placeholder:'Short field observation'}
  ]},
  {type:'DRAIN_SURVEY',title:'Drain Survey',description:'Drain dimensions, flow condition and outfall connectivity',icon:MapPinned,fields:[
    {key:'drain_id',label:'Drain ID',required:true,placeholder:'DR-001'},{key:'drain_name',label:'Drain Name',required:true},
    {key:'location_chainage',label:'Location / Chainage'},{key:'latitude',label:'Latitude',kind:'number',required:true},{key:'longitude',label:'Longitude',kind:'number',required:true},
    {key:'drain_width_m',label:'Drain Width (m)',kind:'number'},{key:'drain_depth_m',label:'Drain Depth (m)',kind:'number'},
    {key:'flow_condition',label:'Flow Condition',kind:'select',options:['Flowing','Low','Dry','Moderate','High']},
    {key:'outfall_connection',label:'Outfall Connection',kind:'select',options:['Yes','No','Unknown']},
    {key:'remarks',label:'Remarks',kind:'textarea'}
  ]},
  {type:'STRUCTURE',title:'Hydraulic Structure',description:'Bridge, culvert, check dam, weir and related structure inventory',icon:Landmark,fields:[
    {key:'structure_id',label:'Structure ID',required:true,placeholder:'STR-001'},
    {key:'structure_type',label:'Structure Type',kind:'select',required:true,options:['Bridge','Culvert','Causeway','Check Dam','Weir / Anicut','Drain Crossing','Outfall Structure','Other']},
    {key:'location_chainage',label:'Location / Chainage'},{key:'latitude',label:'Latitude',kind:'number',required:true},{key:'longitude',label:'Longitude',kind:'number',required:true},
    {key:'length_m',label:'Length (m)',kind:'number'},{key:'width_m',label:'Width (m)',kind:'number'},{key:'height_m',label:'Height (m)',kind:'number'},
    {key:'condition',label:'Condition',kind:'select',options:['Good','Fair','Poor','Critical']},
    {key:'hydraulic_status',label:'Hydraulic Status',kind:'select',options:['Adequate','Marginal','Inadequate','Not Assessed']},
    {key:'remarks',label:'Remarks',kind:'textarea'}
  ]},
  {type:'OUTFALL',title:'Outfall',description:'Industrial, sewage, stormwater and treatment-plant discharge points',icon:Database,fields:[
    {key:'outfall_id',label:'Outfall ID',required:true,placeholder:'OUT-001'},{key:'location_chainage',label:'Location / Chainage'},
    {key:'latitude',label:'Latitude',kind:'number',required:true},{key:'longitude',label:'Longitude',kind:'number',required:true},
    {key:'source_type',label:'Source / Type',kind:'select',required:true,options:['Industrial','Sewage','Stormwater','ETP Outlet','STP Outlet','Mixed','Unknown']},
    {key:'flow_condition',label:'Flow Condition',kind:'select',options:['No Flow','Low','Moderate','High','Continuous','Intermittent']},
    {key:'connected_drain_river',label:'Connected Drain / River'},{key:'remarks',label:'Remarks',kind:'textarea'}
  ]},
  {type:'WATER_SAMPLE',title:'Water Sample',description:'Sample tracking and laboratory-report reference',icon:TestTube2,fields:[
    {key:'sample_id',label:'Sample ID',required:true,placeholder:'SMP-001'},{key:'location_id',label:'Location ID',required:true,placeholder:'LOC-001'},
    {key:'sampling_date',label:'Sampling Date',kind:'date',required:true},
    {key:'latitude',label:'Latitude',kind:'number'},{key:'longitude',label:'Longitude',kind:'number'},
    {key:'sample_status',label:'Sample Status',kind:'select',required:true,options:['Collected','Sent to Lab','Under Analysis','Report Received']},
    {key:'laboratory_name',label:'Laboratory Name'},{key:'report_reference',label:'Laboratory Report Reference'},
    {key:'remarks',label:'Remarks',kind:'textarea'}
  ]},
  {type:'CRITICAL_LOCATION',title:'Critical Location',description:'Problem category, priority and recommended action',icon:AlertTriangle,fields:[
    {key:'critical_location_id',label:'Critical Location ID',required:true,placeholder:'CRIT-001'},
    {key:'location_chainage',label:'Location / Chainage'},{key:'latitude',label:'Latitude',kind:'number'},{key:'longitude',label:'Longitude',kind:'number'},
    {key:'category',label:'Category',kind:'select',required:true,options:['Hydraulic','Morphology','Pollution Infrastructure','Infrastructure Deficiency']},
    {key:'problem',label:'Problem',kind:'textarea',required:true},{key:'priority',label:'Priority',kind:'select',required:true,options:['High','Medium','Low']},
    {key:'recommended_action',label:'Recommended Action',kind:'textarea'},
    {key:'field_status',label:'Field Status',kind:'select',options:['Pending','Proposed','Completed']},{key:'remarks',label:'Remarks',kind:'textarea'}
  ]}
]

const statusStyle:Record<CivilStatus,string>={
  DRAFT:'bg-slate-100 text-slate-700',SUBMITTED:'bg-blue-100 text-blue-800',UNDER_REVIEW:'bg-violet-100 text-violet-800',
  RETURNED:'bg-amber-100 text-amber-900',APPROVED:'bg-emerald-100 text-emerald-800'
}
const labelType=(t:CivilEntryType)=>ENTRY_DEFS.find(x=>x.type===t)?.title ?? t.replace(/_/g,' ')

function viewFromHash():PortalView{
  const hash=window.location.hash.toLowerCase()
  if(hash.includes('/new'))return 'new'
  if(hash.includes('/records'))return 'records'
  if(hash.includes('/submissions'))return 'submissions'
  if(hash.includes('/scientific'))return 'scientific'
  if(hash.includes('/tasks'))return 'tasks'
  if(hash.includes('/workflow'))return 'workflow'
  if(hash.includes('/notifications'))return 'notifications'
  return 'dashboard'
}

export function InstitutionPortal({user,onLogout}:{user:AuthUser;onLogout:()=>void}){
  const [view,setView]=useState<PortalView>(viewFromHash())
  const [data,setData]=useState<InstitutionOverview|null>(null)
  const [entries,setEntries]=useState<CivilEntry[]>([])
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const canWrite=user.role==='INSTITUTION_ADMIN'||user.role==='INSTITUTION_USER'

  function navigate(next:PortalView){window.location.hash=`institution/${next}`;setView(next)}
  async function load(){
    setError('')
    try{const [overview,records]=await Promise.all([api.institutionOverview(),api.institutionEntries()]);setData(overview);setEntries(records)}
    catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  useEffect(()=>{load();const fn=()=>setView(viewFromHash());window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[])

  return <div className="min-h-screen bg-slate-100">
    <AuthenticatedHeader user={user} onLogout={onLogout} subtitle="Institution field-data entry, submission & tracking portal"/>
    <div className="mx-auto flex max-w-[1700px] gap-5 p-4 md:p-6">
      <aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col rounded-2xl bg-navy-950 p-3 text-white shadow-card lg:flex">
        <div className="p-3"><div className="text-[11px] font-black uppercase tracking-[.18em] text-cyan-200">Institution Workspace</div><div className="mt-2 text-xl font-black">{user.organization_name}</div><div className="mt-1 text-xs text-blue-200">{user.display_name}</div></div>
        <nav className="mt-4 space-y-1">{([
          ['dashboard',Home,'Dashboard'],['new',PlusCircle,'Add Field Data'],['records',FolderOpen,'My Records'],['submissions',ListChecks,'Submissions'],['scientific',FlaskConical,'Scientific Data'],['tasks',ClipboardCheck,'My Tasks'],['workflow',GitPullRequest,'Approval Workflow'],['notifications',Bell,'Notifications']
        ] as const).map(([key,Icon,label])=><button key={String(key)} onClick={()=>navigate(key as PortalView)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold ${view===key?'bg-white text-navy-950':'text-blue-50 hover:bg-white/10'}`}><Icon size={18}/>{label}</button>)}</nav>
        <div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-blue-100"><ShieldCheck size={16} className="mb-2"/>All records created here are automatically scoped to <strong className="text-white">{user.organization_id}</strong>.</div>
      </aside>

      <main className="min-w-0 flex-1 space-y-4">
        <div className="flex gap-2 overflow-x-auto lg:hidden">{[
          ['dashboard','Dashboard'],['new','Add Data'],['records','My Records'],['submissions','Submissions'],['tasks','My Tasks'],['workflow','Workflow'],['notifications','Notifications']
        ].map(([key,label])=><button key={key} onClick={()=>navigate(key as PortalView)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black ${view===key?'bg-navy-950 text-white':'border border-slate-300 bg-white text-slate-700'}`}>{label}</button>)}</div>
        {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
        {view==='dashboard'&&<DashboardView user={user} data={data} entries={entries} canWrite={canWrite} onNavigate={navigate} onRefresh={load}/>}
        {view==='new'&&<NewEntryView canWrite={canWrite} onCreated={async()=>{await load();navigate('records')}} setError={setError} loading={loading} setLoading={setLoading}/>}
        {view==='records'&&<RecordsView entries={entries} onRefresh={load} onNew={()=>navigate('new')}/>} 
        {view==='submissions'&&<SubmissionsView entries={entries} onRefresh={load}/>}
        {view==='scientific'&&<ScientificModules user={user}/>}  
        {view==='tasks'&&<TaskWorkspace title="My Institution Tasks" subtitle="Tasks assigned by Nakshatech to this institution. Start work, submit outputs and respond to corrections here."/>}
        {view==='workflow'&&<MySubmissionsV18/>}
        {view==='notifications'&&<NotificationsCentre/>}
      </main>
    </div>
  </div>
}

function DashboardView({user,data,entries,canWrite,onNavigate,onRefresh}:{user:AuthUser;data:InstitutionOverview|null;entries:CivilEntry[];canWrite:boolean;onNavigate:(v:PortalView)=>void;onRefresh:()=>void}){
  const m=data?.metrics
  return <>
    <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-2xl bg-gradient-to-br from-navy-950 to-navy-800 p-6 text-white shadow-card"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-200"><ShieldCheck size={15}/> Institution isolation active</div><h2 className="mt-3 text-3xl font-black">{user.organization_name}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-blue-100">Institution users can enter field records, receive Nakshatech tasks, submit evidence and follow technical/final approval without seeing other institutions. Records remain restricted to <strong className="text-white">{user.organization_id}</strong>.</p><div className="mt-5 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">{user.role.replace(/_/g,' ')}</span><span className="rounded-full bg-white/10 px-3 py-2 text-xs font-bold">Organization {user.organization_id}</span></div></div>
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><div className="flex items-center gap-2 font-black text-emerald-900"><CheckCircle2 size={18}/>Data Entry Enabled</div><p className="mt-2 text-sm leading-6 text-emerald-900">Civil field-data capture is active. Official watershed/location allocation has not yet been supplied, so assignment-based progress percentage remains blank.</p>{canWrite&&<button onClick={()=>onNavigate('new')} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-black text-white"><PlusCircle size={17}/>Add field record</button>}</div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{[
      ['Total Records',m?.total_records??entries.length],['Field Surveys',m?.surveyed],['Samples',m?.samples],['Drafts',m?.drafts],['Submitted / Review',(m?.submitted??0)+(m?.under_review??0)],['Approved',m?.approved]
    ].map(([label,value])=><div key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"><div className="text-[11px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-2 text-2xl font-black text-slate-900">{value==null?'—':String(value)}</div></div>)}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-black text-slate-900">Field Data Modules</h2><p className="mt-1 text-sm text-slate-500">Choose a Civil record type and enter observations directly from the field.</p></div><button onClick={onRefresh} className="rounded-xl border border-slate-300 p-2 text-slate-600"><RefreshCw size={17}/></button></div><div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{ENTRY_DEFS.map(def=><button key={def.type} disabled={!canWrite} onClick={()=>onNavigate('new')} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:-translate-y-0.5 hover:bg-white hover:shadow-card disabled:cursor-not-allowed disabled:opacity-60"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-navy-800 shadow-sm"><def.icon size={19}/></div><div><div className="font-black text-slate-800">{def.title}</div><div className="mt-1 text-xs leading-5 text-slate-500">{def.description}</div><div className="mt-3 inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800">Data entry active</div></div></div></button>)}</div></section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><h2 className="text-lg font-black">Submission workflow</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">{['Draft','Submitted','Under Review','Correction Required','Technical Approved','Final Approved','Integrated'].map((s,i)=><div key={s} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs font-black text-slate-700"><div className="mx-auto mb-2 grid h-7 w-7 place-items-center rounded-full bg-navy-950 text-[10px] text-white">{i+1}</div>{s}</div>)}</div></section>
  </>
}

function NewEntryView({canWrite,onCreated,setError,loading,setLoading}:{canWrite:boolean;onCreated:()=>void;setError:(v:string)=>void;loading:boolean;setLoading:(v:boolean)=>void}){
  const [selected,setSelected]=useState<CivilEntryType>('RIVER_SURVEY')
  const [fields,setFields]=useState<Record<string,string>>({})
  const [files,setFiles]=useState<File[]>([])
  const def=useMemo(()=>ENTRY_DEFS.find(x=>x.type===selected)!,[selected])
  const changeType=(t:CivilEntryType)=>{setSelected(t);setFields({});setFiles([]);setError('')}
  async function save(e:FormEvent,submit:boolean){
    e.preventDefault();if(!canWrite)return;setLoading(true);setError('')
    try{
      const created=await api.createCivilEntry({entry_type:selected,fields,submit:false})
      for(const file of files)await api.uploadCivilAttachment(created.public_id,file)
      if(submit)await api.submitCivilEntry(created.public_id)
      onCreated()
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }
  if(!canWrite)return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-semibold text-amber-900">This account is read-only. Use an Institution Admin or Institution User/Student account to enter field data.</div>
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-navy-700">Institution data entry</div><h2 className="mt-1 text-2xl font-black text-slate-900">Add Civil Field Record</h2><p className="mt-1 text-sm text-slate-500">Required fields follow the Civil dashboard input structure. Attachments are optional for this prototype.</p></div><div className="flex flex-wrap gap-2">{ENTRY_DEFS.map(x=><button key={x.type} onClick={()=>changeType(x.type)} className={`rounded-full border px-3 py-2 text-xs font-black ${selected===x.type?'border-navy-950 bg-navy-950 text-white':'border-slate-300 bg-white text-slate-600'}`}>{x.title}</button>)}</div></div>
    <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-navy-900 shadow-sm"><def.icon size={20}/></div><div><div className="font-black text-slate-900">{def.title}</div><div className="text-xs text-slate-500">{def.description}</div></div></div></div>
    <form className="mt-5" onSubmit={e=>save(e,false)}><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{def.fields.map(f=><FieldInput key={f.key} def={f} value={fields[f.key]??''} onChange={v=>setFields(old=>({...old,[f.key]:v}))}/>)}</div>
      <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4"><div className="flex items-center gap-2 font-black text-slate-800"><Paperclip size={17}/>Attachments</div><p className="mt-1 text-xs leading-5 text-slate-500">Photos, PDF, CSV/Excel, KML or KMZ. Maximum 15 MB per file.</p><input multiple type="file" accept="image/*,.pdf,.csv,.xls,.xlsx,.kml,.kmz" onChange={e=>setFiles(Array.from(e.target.files??[]))} className="mt-3 block w-full text-xs text-slate-600"/>{files.length>0&&<div className="mt-3 flex flex-wrap gap-2">{files.map(f=><span key={`${f.name}-${f.size}`} className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm">{f.name} · {(f.size/1024/1024).toFixed(2)} MB</span>)}</div>}</div>
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button disabled={loading} type="submit" className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">{loading?'Saving…':'Save Draft'}</button><button disabled={loading} type="button" onClick={e=>save(e as any,true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-950 px-5 py-3 text-sm font-black text-white disabled:opacity-50"><Send size={17}/>{loading?'Processing…':'Save & Submit'}</button></div>
    </form>
  </section>
}

function FieldInput({def,value,onChange}:{def:FieldDef;value:string;onChange:(v:string)=>void}){
  const cls='mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-blue-100'
  return <label className={`${def.kind==='textarea'?'md:col-span-2 xl:col-span-3':''} text-xs font-bold text-slate-700`}>{def.label}{def.required&&<span className="text-rose-600"> *</span>}
    {def.kind==='select'?<select required={def.required} value={value} onChange={e=>onChange(e.target.value)} className={cls}><option value="">Select…</option>{def.options?.map(o=><option key={o}>{o}</option>)}</select>:
      def.kind==='textarea'?<textarea required={def.required} rows={3} value={value} onChange={e=>onChange(e.target.value)} placeholder={def.placeholder} className={cls}/>:
      <input required={def.required} type={def.kind==='number'?'number':def.kind==='date'?'date':'text'} step={def.kind==='number'?'any':undefined} value={value} onChange={e=>onChange(e.target.value)} placeholder={def.placeholder} className={cls}/>}</label>
}

function RecordsView({entries,onRefresh,onNew}:{entries:CivilEntry[];onRefresh:()=>void;onNew:()=>void}){
  const [status,setStatus]=useState<'ALL'|CivilStatus>('ALL')
  const shown=status==='ALL'?entries:entries.filter(e=>e.status===status)
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-2xl font-black text-slate-900">My Institution Records</h2><p className="mt-1 text-sm text-slate-500">Records are shared only within your institution scope until approved.</p></div><div className="flex gap-2"><select value={status} onChange={e=>setStatus(e.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"><option value="ALL">All statuses</option>{['DRAFT','SUBMITTED','UNDER_REVIEW','RETURNED','APPROVED'].map(s=><option key={s}>{s}</option>)}</select><button onClick={onRefresh} className="rounded-xl border border-slate-300 p-2"><RefreshCw size={17}/></button><button onClick={onNew} className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-3 py-2 text-xs font-black text-white"><PlusCircle size={16}/>New</button></div></div>
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Record</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Key Data</th><th className="px-3 py-3">Attachments</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th></tr></thead><tbody>{shown.map(e=><tr key={e.public_id} className="border-t border-slate-100 align-top"><td className="px-3 py-3 font-mono text-[11px] font-bold text-navy-900">{e.public_id}</td><td className="px-3 py-3 font-bold">{labelType(e.entry_type)}</td><td className="px-3 py-3 text-slate-600"><KeyFields entry={e}/>{e.review_comment&&<div className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] text-amber-900"><strong>Review:</strong> {e.review_comment}</div>}</td><td className="px-3 py-3">{e.attachments.length}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-black ${statusStyle[e.status]}`}>{e.status.replace(/_/g,' ')}</span></td><td className="px-3 py-3 text-slate-500">{new Date(e.updated_at).toLocaleString()}</td></tr>)}{shown.length===0&&<tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">No institution records yet.</td></tr>}</tbody></table></div>
  </section>
}

function SubmissionsView({entries,onRefresh}:{entries:CivilEntry[];onRefresh:()=>void}){
  const groups=['DRAFT','SUBMITTED','UNDER_REVIEW','RETURNED','APPROVED'] as CivilStatus[]
  return <section className="space-y-4"><div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex items-center justify-between"><div><h2 className="text-2xl font-black">Submission Tracker</h2><p className="mt-1 text-sm text-slate-500">Follow every institution record from Draft through Company review and approval.</p></div><button onClick={onRefresh} className="rounded-xl border border-slate-300 p-2"><RefreshCw size={17}/></button></div><div className="mt-5 grid gap-3 sm:grid-cols-5">{groups.map((s,i)=><div key={s} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center"><div className="mx-auto grid h-8 w-8 place-items-center rounded-full bg-navy-950 text-xs font-black text-white">{i+1}</div><div className="mt-2 text-xs font-black">{s.replace(/_/g,' ')}</div><div className="mt-2 text-2xl font-black text-slate-900">{entries.filter(e=>e.status===s).length}</div></div>)}</div></div>
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><h3 className="font-black">Recent submission activity</h3><div className="mt-4 space-y-2">{entries.slice(0,12).map(e=><div key={e.public_id} className="flex flex-col gap-2 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-xs font-black text-slate-900">{e.public_id} · {labelType(e.entry_type)}</div><div className="mt-1 text-[11px] text-slate-500">Created by {e.created_by_name} · {new Date(e.updated_at).toLocaleString()}</div></div><span className={`w-fit rounded-full px-2 py-1 text-[10px] font-black ${statusStyle[e.status]}`}>{e.status.replace(/_/g,' ')}</span></div>)}{entries.length===0&&<div className="py-8 text-center text-sm text-slate-500">No submissions yet.</div>}</div></div>
  </section>
}

function KeyFields({entry}:{entry:CivilEntry}){
  const preferred=['location_id','river_tributary','drain_id','drain_name','structure_id','structure_type','outfall_id','source_type','sample_id','critical_location_id','category','priority','chainage_km','location_chainage','latitude','longitude']
  const pairs=preferred.filter(k=>entry.fields[k]!==undefined&&entry.fields[k]!==''&&entry.fields[k]!==null).slice(0,4)
  return <div className="space-y-0.5">{pairs.map(k=><div key={k}><span className="text-slate-400">{k.replace(/_/g,' ')}:</span> {String(entry.fields[k])}</div>)}</div>
}
