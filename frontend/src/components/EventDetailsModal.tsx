import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, Images, MapPin, X } from 'lucide-react'
import type { ProjectEvent } from '../lib/types'

function readableDate(value:string){
  if(!value)return 'Date to be announced'
  const date=new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{day:'2-digit',month:'long',year:'numeric'})
}

export function EventDetailsModal({event,onClose}:{event:ProjectEvent|null;onClose:()=>void}){
  const [activeImage,setActiveImage]=useState(0)
  useEffect(()=>{setActiveImage(0)},[event?.public_id])
  useEffect(()=>{
    if(!event)return
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()}
    window.addEventListener('keydown',onKey)
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}
  },[event,onClose])
  if(!event)return null
  const images=Array.isArray(event.images)?event.images:[]
  const image=images[activeImage]
  return <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}>
    <section className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-[28px] border border-white/20 bg-white shadow-[0_32px_100px_rgba(2,20,48,.46)]" onMouseDown={e=>e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="event-details-title">
      <button type="button" onClick={onClose} className="absolute right-4 top-4 z-20 grid h-10 w-10 place-items-center rounded-full bg-slate-950/75 text-white shadow-lg backdrop-blur transition hover:bg-navy-800" aria-label="Close event details"><X size={20}/></button>
      <div className="grid lg:grid-cols-[1.15fr_.85fr]">
        <div className="bg-navy-950 p-4 sm:p-5">
          <div className="relative min-h-[280px] overflow-hidden rounded-2xl bg-slate-900 sm:min-h-[420px]">
            {image?<img src={image.url} alt={image.original_name} className="absolute inset-0 h-full w-full object-cover"/>:<div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-navy-900 to-blue-700 text-center text-blue-100"><div><Images className="mx-auto mb-3" size={38}/><div className="text-sm font-bold">Event gallery</div><div className="mt-1 text-xs text-blue-200">Images will appear here after upload.</div></div></div>}
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-slate-950/70 to-transparent"/>
          </div>
          {images.length>1&&<div className="mt-3 flex gap-2 overflow-x-auto pb-1">{images.map((item,index)=><button type="button" onClick={()=>setActiveImage(index)} key={item.public_id} className={`h-16 w-24 shrink-0 overflow-hidden rounded-xl border-2 transition ${activeImage===index?'border-cyan-300':'border-white/20 opacity-70 hover:opacity-100'}`}><img src={item.url} alt="" className="h-full w-full object-cover"/></button>)}</div>}
        </div>
        <div className="p-6 sm:p-8">
          <div className="text-[11px] font-black uppercase tracking-[.18em] text-blue-700">Arkavati Project Event</div>
          <h2 id="event-details-title" className="mt-2 text-2xl font-black leading-tight text-navy-950 sm:text-3xl">{event.title}</h2>
          <div className="mt-5 grid gap-3 text-sm text-slate-600">
            <div className="flex items-center gap-3"><CalendarDays size={18} className="text-blue-700"/><span className="font-semibold">{readableDate(event.event_date)}</span></div>
            {event.event_time&&<div className="flex items-center gap-3"><Clock3 size={18} className="text-blue-700"/><span className="font-semibold">{event.event_time}</span></div>}
            {event.location&&<div className="flex items-center gap-3"><MapPin size={18} className="text-blue-700"/><span className="font-semibold">{event.location}</span></div>}
          </div>
          {event.short_description&&<p className="mt-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm font-semibold leading-6 text-navy-900">{event.short_description}</p>}
          <div className="mt-6 whitespace-pre-wrap text-sm leading-7 text-slate-600">{event.description||'Additional event details will be updated here.'}</div>
        </div>
      </div>
    </section>
  </div>
}
