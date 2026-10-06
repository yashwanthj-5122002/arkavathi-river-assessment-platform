import { useEffect, useState } from 'react'
import { CalendarDays, Clock3, MapPin, X } from 'lucide-react'
import { api } from '../lib/api'
import type { ProjectEvent } from '../lib/types'

function readableDate(value:string){
  if(!value)return 'Date to be announced'
  const date=new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{day:'2-digit',month:'long',year:'numeric'})
}

export function UpcomingEventPopup({open,onClose}:{open:boolean;onClose:()=>void}) {
  const [event,setEvent]=useState<ProjectEvent|null>(null)
  const [loading,setLoading]=useState(false)

  useEffect(()=>{
    if(!open)return
    let active=true
    setLoading(true)
    api.upcomingEvent().then(value=>{if(active)setEvent(value?.public_id?{...value,images:Array.isArray(value.images)?value.images:[]}:null)}).catch(()=>{if(active)setEvent(null)}).finally(()=>{if(active)setLoading(false)})
    return()=>{active=false}
  },[open])

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (keyboardEvent: KeyboardEvent) => { if (keyboardEvent.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => { window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = previousOverflow }
  }, [open, onClose])

  if (!open) return null
  const cover=event?.images?.[0]

  return <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/72 px-4 py-8 backdrop-blur-[3px]" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}} role="presentation">
    <section aria-labelledby="upcoming-event-title" aria-modal="true" className="relative w-full max-w-[880px] overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-[0_30px_90px_rgba(2,20,48,.45)]" onMouseDown={e=>e.stopPropagation()} role="dialog">
      <button aria-label="Close upcoming event popup" className="absolute right-4 top-4 z-20 grid h-11 w-11 place-items-center rounded-full border border-white/30 bg-slate-950/65 text-white shadow-lg backdrop-blur transition hover:bg-navy-800 focus:outline-none focus:ring-4 focus:ring-blue-200" onClick={onClose} title="Close" type="button"><X size={22} strokeWidth={2.6}/></button>
      {loading?<div className="grid min-h-[430px] place-items-center bg-white text-sm font-semibold text-slate-500">Loading upcoming event…</div>:event?<div className="grid md:grid-cols-[1.05fr_.95fr]">
        <div className="relative min-h-[330px] bg-gradient-to-br from-navy-950 to-blue-700 md:min-h-[520px]">{cover?<img src={cover.url} alt={event.title} className="absolute inset-0 h-full w-full object-cover"/>:<div className="absolute inset-0 grid place-items-center text-center text-blue-100"><div><CalendarDays className="mx-auto" size={44}/><div className="mt-3 text-sm font-black uppercase tracking-[.16em]">Upcoming Event</div></div></div>}<div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-slate-950/15"/><div className="absolute bottom-5 left-5 rounded-full border border-white/25 bg-slate-950/50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.16em] text-white backdrop-blur">Upcoming Event</div></div>
        <div className="flex flex-col justify-center p-7 sm:p-9"><div className="text-[10px] font-black uppercase tracking-[.22em] text-blue-700">Arkavati River Population Assessment Project</div><h2 id="upcoming-event-title" className="mt-3 text-3xl font-black leading-tight text-navy-950">{event.title}</h2><div className="mt-5 space-y-3 text-sm font-semibold text-slate-600"><div className="flex items-center gap-3"><CalendarDays size={18} className="text-blue-700"/>{readableDate(event.event_date)}</div>{event.event_time&&<div className="flex items-center gap-3"><Clock3 size={18} className="text-blue-700"/>{event.event_time}</div>}{event.location&&<div className="flex items-center gap-3"><MapPin size={18} className="text-blue-700"/>{event.location}</div>}</div><p className="mt-6 text-sm leading-7 text-slate-600">{event.short_description||event.description||'Additional event details will be updated soon.'}</p><div className="mt-7 rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-navy-900">This event is published from the project Event Handler. Close this window to continue to the portal.</div></div>
      </div>:<div className="flex min-h-[430px] flex-col items-center justify-center bg-gradient-to-br from-white via-blue-50/40 to-white px-6 py-12 text-center"><div className="mb-4 text-xs font-black uppercase tracking-[0.28em] text-blue-700">Upcoming Event</div><h2 id="upcoming-event-title" className="text-4xl font-black tracking-tight text-navy-950 sm:text-5xl">Coming Soon</h2><p className="mt-4 max-w-md text-sm leading-6 text-slate-500">Upcoming project event information will appear here when published from Event Handler.</p></div>}
    </section>
  </div>
}
