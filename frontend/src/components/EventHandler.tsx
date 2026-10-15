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
  <section className="overflow-hidden">

    <div className="flex flex-col gap-4 bg-gradient-to-r from-navy-950 via-navy-900 to-blue-700 px-5 py-5 text-white lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.18em] text-blue-200">
          Project Communications
        </div>

        <h2 className="mt-1 text-2xl font-black">
          Event Handler
        </h2>

        <p className="mt-1 max-w-3xl text-sm text-blue-100">
          Manage upcoming project events and completed-event highlights used by the portal popup and Overview showcase.
        </p>
      </div>

      {canManage && (
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-black text-white"
        >
          <Plus size={18}/>
          Create Event
        </button>
      )}
    </div>

    <div className="grid gap-3 p-4 sm:grid-cols-3">
      {[
        ['UPCOMING','Upcoming Events','Events scheduled / yet to come'],
        ['COMPLETED','Completed Events','Events already conducted'],
        ...(canManage ? [['DRAFT','Drafts','Not visible outside Event Handler']] : [])
      ].map(([key,label,caption]) => (
        <button
          key={key}
          type="button"
          onClick={() => setTab(key as Tab)}
          className={`p-4 text-left transition ${
            tab===key
              ? 'text-blue-800'
              : 'text-slate-800 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="text-sm font-black">
              {label}
            </div>

            <span className="rounded-full bg-navy-950 px-2.5 py-1 text-xs font-black text-white">
              {counts[key as keyof typeof counts] ?? 0}
            </span>
          </div>

          <div className="mt-1 text-xs text-slate-500">
            {caption}
          </div>
        </button>
      ))}
    </div>
  </section>
</div>}