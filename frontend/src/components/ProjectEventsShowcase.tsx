import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, MapPin, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import type { ProjectEvent } from '../lib/types'
import { EventDetailsModal } from './EventDetailsModal'

function readableDate(value:string){
  if(!value)return 'Date to be announced'
  const date=new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())?value:date.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})
}

function normalizeEvents(value:ProjectEvent[]|unknown):ProjectEvent[]{
  if(!Array.isArray(value))return []
  return value.map(event=>({...event,images:Array.isArray(event.images)?event.images:[]}))
}

export function ProjectEventsShowcase(){
  const [events,setEvents]=useState<ProjectEvent[]>([])
  const [selected,setSelected]=useState<ProjectEvent|null>(null)
  const trackRef=useRef<HTMLDivElement|null>(null)
  const sequenceRef=useRef<HTMLDivElement|null>(null)
  const frameRef=useRef<number|undefined>(undefined)
  const offsetRef=useRef(0)
  const loopWidthRef=useRef(0)
  const lastFrameRef=useRef<number|undefined>(undefined)

  const loadEvents=useCallback(()=>{
    api.completedEvents(50)
      .then(value=>setEvents(normalizeEvents(value)))
      .catch(()=>setEvents([]))
  },[])

  useEffect(()=>{
    loadEvents()
    const refresh=()=>loadEvents()
    window.addEventListener('focus',refresh)
    const timer=window.setInterval(loadEvents,20000)
    return()=>{
      window.removeEventListener('focus',refresh)
      window.clearInterval(timer)
    }
  },[loadEvents])

  const eventSignature=useMemo(()=>events.map(event=>event.public_id).join('|'),[events])
  const repeatCount=events.length<=1?8:events.length===2?5:events.length<=4?3:2

  useEffect(()=>{
    const track=trackRef.current
    const sequence=sequenceRef.current
    if(!track||!sequence||events.length===0)return

    offsetRef.current=0
    lastFrameRef.current=undefined
    track.style.transform='translate3d(0,0,0)'

    const measure=()=>{
      loopWidthRef.current=sequence.getBoundingClientRect().width
      if(loopWidthRef.current>0&&offsetRef.current>=loopWidthRef.current){
        offsetRef.current%=loopWidthRef.current
      }
    }

    measure()
    const resizeObserver=new ResizeObserver(measure)
    resizeObserver.observe(sequence)

    const speedPixelsPerSecond=46
    const animate=(timestamp:number)=>{
      const previous=lastFrameRef.current
      lastFrameRef.current=timestamp
      if(previous!==undefined&&document.visibilityState==='visible'){
        const delta=Math.min(timestamp-previous,64)
        offsetRef.current+=(speedPixelsPerSecond*delta)/1000
        const loopWidth=loopWidthRef.current
        if(loopWidth>0&&offsetRef.current>=loopWidth){
          offsetRef.current%=loopWidth
        }
        track.style.transform=`translate3d(${-offsetRef.current}px,0,0)`
      }
      frameRef.current=window.requestAnimationFrame(animate)
    }

    frameRef.current=window.requestAnimationFrame(animate)
    return()=>{
      if(frameRef.current!==undefined)window.cancelAnimationFrame(frameRef.current)
      resizeObserver.disconnect()
      lastFrameRef.current=undefined
    }
  },[eventSignature,events.length])

  const renderCard=(event:ProjectEvent,copyIndex:number)=>{
    const cover=event.images?.[0]
    return <button
      type="button"
      key={`${copyIndex}-${event.public_id}`}
      tabIndex={copyIndex===0?0:-1}
      aria-hidden={copyIndex===0?undefined:true}
      onClick={()=>setSelected(event)}
      className="ark-event-card group w-[300px] shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg sm:w-[360px]"
    >
      <div className="relative h-44 overflow-hidden bg-gradient-to-br from-navy-950 to-blue-700">
        {cover?<img src={cover.url} alt={event.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"/>:<div className="grid h-full place-items-center text-blue-100"><CalendarDays size={38}/></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent"/>
        <span className="ark-event-status absolute bottom-3 left-3 rounded-full border border-white/25 bg-slate-950/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">Completed</span>
      </div>
      <div className="p-4">
        <h3 className="line-clamp-2 text-base font-black leading-snug text-navy-950 group-hover:text-blue-700">{event.title}</h3>
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-[11px] font-semibold text-slate-500">
          <span className="inline-flex items-center gap-1.5"><CalendarDays size={13}/>{readableDate(event.event_date)}</span>
          {event.location&&<span className="inline-flex items-center gap-1.5"><MapPin size={13}/>{event.location}</span>}
        </div>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">{event.short_description||event.description||'Project event details.'}</p>
        <div className="mt-4 text-xs font-black text-blue-700">View event details →</div>
      </div>
    </button>
  }

  return <section className="ark-events overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
    <div className="flex flex-col gap-3 bg-gradient-to-r from-navy-950 via-navy-900 to-blue-700 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-blue-200"><Sparkles size={13}/>Project Highlights</div>
        <h2 className="mt-1 text-xl font-black uppercase tracking-[.06em]">Project Events</h2>
        <p className="mt-1 text-xs text-blue-100">Completed Arkavati project events move continuously from right to left.</p>
      </div>
      {events.length>0&&<div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-blue-50">
        <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,.12)]"/>
        Live • {events.length} {events.length===1?'Event':'Events'}
      </div>}
    </div>

    {events.length===0?<div className="p-8 text-center">
      <CalendarDays className="mx-auto text-blue-700" size={32}/>
      <div className="mt-3 font-black text-navy-950">Project event highlights will appear here</div>
      <div className="mt-1 text-sm text-slate-500">Completed events published from Event Handler will automatically populate this section.</div>
    </div>:<div className="relative overflow-hidden py-4">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent"/>
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent"/>
      <div ref={trackRef} className="flex w-max will-change-transform">
        {Array.from({length:repeatCount},(_,copyIndex)=><div
          ref={copyIndex===0?sequenceRef:undefined}
          key={`event-sequence-${copyIndex}`}
          className="flex shrink-0 gap-4 pr-4"
        >
          {events.map(event=>renderCard(event,copyIndex))}
        </div>)}
      </div>
    </div>}

    <EventDetailsModal event={selected} onClose={()=>setSelected(null)}/>
  </section>
}
