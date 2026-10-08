import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock3, Edit3, ImagePlus, MapPin, Plus, Save, Trash2, UploadCloud, X } from 'lucide-react'
import { api } from '../lib/api'
import type { AuthUser, ProjectEvent, ProjectEventStatus } from '../lib/types'
import { EventDetailsModal } from './EventDetailsModal'

type Tab='UPCOMING'|'COMPLETED'|'DRAFT'

type EventForm={
  title:string
  event_date:string
  event_time:string
  location:string
  short_description:string
  description:string
  status:ProjectEventStatus
}

const blankForm:EventForm={title:'',event_date:'',event_time:'',location:'',short_description:'',description:'',status:'UPCOMING'}

function readableDate(value:string){
  if(!value)return 'Date to be announced'
  const date=new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})
}

export function EventHandler({user}:{user:AuthUser}){
  const canManage=user.organization_type==='COMPANY'&&user.role==='COMPANY_ADMIN'
  const [events,setEvents]=useState<ProjectEvent[]>([])
  const [tab,setTab]=useState<Tab>('UPCOMING')
  const [loading,setLoading]=useState(true)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [showForm,setShowForm]=useState(false)
  const [editing,setEditing]=useState<ProjectEvent|null>(null)
  const [form,setForm]=useState<EventForm>(blankForm)
  const [files,setFiles]=useState<File[]>([])
  const [selected,setSelected]=useState<ProjectEvent|null>(null)

  const load=async()=>{
    setLoading(true);setError('')
    try{const value=await api.events();setEvents(Array.isArray(value)?value.map(event=>({...event,images:Array.isArray(event.images)?event.images:[]})):[])}catch(e){setEvents([]);setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[])

  const visible=useMemo(()=>events.filter(event=>event.status===tab),[events,tab])
  const counts=useMemo(()=>({
    UPCOMING:events.filter(e=>e.status==='UPCOMING').length,
    COMPLETED:events.filter(e=>e.status==='COMPLETED').length,
    DRAFT:events.filter(e=>e.status==='DRAFT').length,
  }),[events])

  const openCreate=()=>{setEditing(null);setForm({...blankForm,status:tab==='COMPLETED'?'COMPLETED':'UPCOMING'});setFiles([]);setShowForm(true)}
  const openEdit=(event:ProjectEvent)=>{setEditing(event);setForm({title:event.title,event_date:event.event_date,event_time:event.event_time,location:event.location,short_description:event.short_description,description:event.description,status:event.status});setFiles([]);setShowForm(true)}
  const closeForm=()=>{if(saving)return;setShowForm(false);setEditing(null);setFiles([]);setForm(blankForm)}

  const save=async()=>{
    if(!form.title.trim()){setError('Event title is required.');return}
    setSaving(true);setError('')
    try{
      const record=editing?await api.updateEvent(editing.public_id,form):await api.createEvent(form)
      for(const file of files)await api.uploadEventImage(record.public_id,file)
      setShowForm(false);setEditing(null);setFiles([]);setForm(blankForm);setTab(record.status as Tab);await load()
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setSaving(false)}
  }

  const changeStatus=async(event:ProjectEvent,status:ProjectEventStatus)=>{
    try{await api.setEventStatus(event.public_id,status);setTab(status as Tab);await load()}catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  const removeEvent=async(event:ProjectEvent)=>{
    if(!window.confirm(`Delete "${event.title}"? This will also remove its uploaded images.`))return
    try{await api.deleteEvent(event.public_id);await load()}catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  const removeImage=async(eventId:string,imageId:string)=>{
    if(!window.confirm('Remove this image from the event?'))return
    try{await api.deleteEventImage(eventId,imageId);const refreshed=await api.event(eventId);setEditing(refreshed);setEvents(prev=>prev.map(item=>item.public_id===refreshed.public_id?refreshed:item))}catch(e){setError(e instanceof Error?e.message:String(e))}
  }

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-col gap-4 bg-gradient-to-r from-navy-950 via-navy-900 to-blue-700 px-5 py-5 text-white lg:flex-row lg:items-center lg:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[.18em] text-blue-200">Project Communications</div><h2 className="mt-1 text-2xl font-black">Event Handler</h2><p className="mt-1 max-w-3xl text-sm text-blue-100">Manage upcoming project events and completed-event highlights used by the portal popup and Overview showcase.</p></div>
        {canManage&&<button type="button" onClick={openCreate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-navy-950 shadow-lg transition hover:bg-blue-50"><Plus size={18}/>Create Event</button>}
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3">
        {[['UPCOMING','Upcoming Events','Events scheduled / yet to come'],['COMPLETED','Completed Events','Events already conducted'],...(canManage?[[ 'DRAFT','Drafts','Not visible outside Event Handler' ]]:[])].map(([key,label,caption])=><button key={key} type="button" onClick={()=>setTab(key as Tab)} className={`rounded-2xl border p-4 text-left transition ${tab===key?'border-blue-300 bg-blue-50 shadow-sm':'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'}`}><div className="flex items-center justify-between"><div className={`text-sm font-black ${tab===key?'text-blue-800':'text-slate-800'}`}>{label}</div><span className="rounded-full bg-navy-950 px-2.5 py-1 text-xs font-black text-white">{counts[key as keyof typeof counts]??0}</span></div><div className="mt-1 text-xs text-slate-500">{caption}</div></button>)}
      </div>
    </section>

    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

    {loading?<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm font-semibold text-slate-500">Loading project events…</div>:visible.length===0?<div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><CalendarDays className="mx-auto text-blue-700" size={34}/><div className="mt-3 text-lg font-black text-navy-950">No {tab.toLowerCase()} events yet</div><div className="mt-1 text-sm text-slate-500">{canManage?'Create an event when information becomes available.':'Event information will appear here when published.'}</div></div>:<section className="grid gap-4 xl:grid-cols-2">{visible.map(event=>{
      const cover=event.images?.[0]
      return <article key={event.public_id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
        <div className="grid min-h-[220px] sm:grid-cols-[230px_1fr]">
          <button type="button" onClick={()=>setSelected(event)} className="relative min-h-[220px] overflow-hidden bg-gradient-to-br from-navy-950 to-blue-700 text-left">{cover?<img src={cover.url} alt={event.title} className="absolute inset-0 h-full w-full object-cover"/>:<div className="absolute inset-0 grid place-items-center text-blue-100"><ImagePlus size={38}/></div>}<div className="absolute inset-0 bg-gradient-to-t from-slate-950/65 via-transparent to-transparent"/><span className="absolute bottom-3 left-3 rounded-full border border-white/20 bg-slate-950/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">{event.status}</span></button>
          <div className="flex flex-col p-5"><button type="button" onClick={()=>setSelected(event)} className="text-left"><h3 className="text-lg font-black leading-snug text-navy-950 hover:text-blue-700">{event.title}</h3><div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-500"><span className="inline-flex items-center gap-1.5"><CalendarDays size={14}/>{readableDate(event.event_date)}</span>{event.event_time&&<span className="inline-flex items-center gap-1.5"><Clock3 size={14}/>{event.event_time}</span>}{event.location&&<span className="inline-flex items-center gap-1.5"><MapPin size={14}/>{event.location}</span>}</div><p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-600">{event.short_description||event.description||'Event details will be updated.'}</p></button>
            {canManage&&<div className="mt-auto flex flex-wrap gap-2 pt-5"><button type="button" onClick={()=>openEdit(event)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50"><Edit3 size={14}/>Edit</button>{event.status!=='UPCOMING'&&<button type="button" onClick={()=>changeStatus(event,'UPCOMING')} className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-800"><CalendarDays size={14}/>Upcoming</button>}{event.status!=='COMPLETED'&&<button type="button" onClick={()=>changeStatus(event,'COMPLETED')} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><CheckCircle2 size={14}/>Completed</button>}<button type="button" onClick={()=>removeEvent(event)} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-700"><Trash2 size={14}/>Delete</button></div>}
          </div>
        </div>
      </article>
    })}</section>}

    {showForm&&<div className="fixed inset-0 z-[1250] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.currentTarget===e.target)closeForm()}}><section className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-[28px] bg-white shadow-[0_32px_100px_rgba(2,20,48,.5)]" onMouseDown={e=>e.stopPropagation()}><div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-blue-700">Event Handler</div><h3 className="text-xl font-black text-navy-950">{editing?'Edit Event':'Create Event'}</h3></div><button type="button" onClick={closeForm} className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"><X size={18}/></button></div><div className="grid gap-5 p-6 md:grid-cols-2">
      <label className="md:col-span-2"><span className="text-xs font-black uppercase tracking-wider text-slate-600">Event title *</span><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} maxLength={180} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Example: Arkavati River Stakeholder Workshop"/></label>
      <label><span className="text-xs font-black uppercase tracking-wider text-slate-600">Date</span><input type="date" value={form.event_date} onChange={e=>setForm({...form,event_date:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/></label>
      <label><span className="text-xs font-black uppercase tracking-wider text-slate-600">Time</span><input type="time" value={form.event_time} onChange={e=>setForm({...form,event_time:e.target.value})} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/></label>
      <label className="md:col-span-2"><span className="text-xs font-black uppercase tracking-wider text-slate-600">Location</span><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} maxLength={220} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="Venue / location"/></label>
      <label className="md:col-span-2"><span className="text-xs font-black uppercase tracking-wider text-slate-600">Brief description</span><textarea value={form.short_description} onChange={e=>setForm({...form,short_description:e.target.value})} maxLength={500} rows={3} className="mt-2 w-full resize-none rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" placeholder="A short summary used in the popup and Overview cards."/></label>
      <label><span className="text-xs font-black uppercase tracking-wider text-slate-600">Status</span><select value={form.status} onChange={e=>setForm({...form,status:e.target.value as ProjectEventStatus})} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="UPCOMING">Upcoming</option><option value="COMPLETED">Completed</option><option value="DRAFT">Draft</option></select></label>
      <label><span className="text-xs font-black uppercase tracking-wider text-slate-600">Add images</span><div className="mt-2 flex min-h-[48px] cursor-pointer items-center gap-2 rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-800"><UploadCloud size={18}/><span>{files.length?`${files.length} image(s) selected`:'Choose event images'}</span><input type="file" accept="image/*" multiple className="hidden" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></div></label>
      {editing&&Array.isArray(editing.images)&&editing.images.length>0&&<div className="md:col-span-2"><div className="mb-2 text-xs font-black uppercase tracking-wider text-slate-600">Existing images</div><div className="flex flex-wrap gap-3">{editing.images.map(image=><div key={image.public_id} className="relative h-24 w-32 overflow-hidden rounded-xl border border-slate-200"><img src={image.url} alt="" className="h-full w-full object-cover"/><button type="button" onClick={()=>removeImage(editing.public_id,image.public_id)} className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-slate-950/75 text-white"><X size={14}/></button></div>)}</div></div>}
      <div className="md:col-span-2 flex justify-end gap-3 border-t border-slate-200 pt-5"><button type="button" onClick={closeForm} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-black text-slate-700">Cancel</button><button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-5 py-2.5 text-sm font-black text-white shadow-lg disabled:opacity-60"><Save size={17}/>{saving?'Saving…':'Save Event'}</button></div>
    </div></section></div>}
    <EventDetailsModal event={selected} onClose={()=>setSelected(null)}/>
  </div>
}
