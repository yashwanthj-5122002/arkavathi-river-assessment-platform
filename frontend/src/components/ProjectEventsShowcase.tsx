import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Sparkles } from 'lucide-react'
import { api } from '../lib/api'
import type { ProjectEvent } from '../lib/types'
import { EventDetailsModal } from './EventDetailsModal'

const PAGE_SIZE = 4

function readableDate(value:string){
  if(!value)return 'Date to be announced'
  const date=new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined,{day:'2-digit',month:'short',year:'numeric'})
}

function normalizeEvents(value:ProjectEvent[]|unknown):ProjectEvent[]{
  if(!Array.isArray(value))return []
  return value.map(event=>({...event,images:Array.isArray(event.images)?event.images:[]}))
}

export function ProjectEventsShowcase(){
  const [events,setEvents]=useState<ProjectEvent[]>([])
  const [selected,setSelected]=useState<ProjectEvent|null>(null)
  const [page,setPage]=useState(0)

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

  const pageCount=Math.max(1,Math.ceil(events.length/PAGE_SIZE))

  useEffect(()=>{
    setPage(current=>Math.min(current,pageCount-1))
  },[pageCount])

  const visibleEvents=useMemo(
    ()=>events.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE),
    [events,page]
  )

  const previousPage=()=>setPage(current=>Math.max(0,current-1))
  const nextPage=()=>setPage(current=>Math.min(pageCount-1,current+1))

  const renderCard=(event:ProjectEvent)=>{
    const cover=event.images?.[0]

    return (
      <button
        type="button"
        key={event.public_id}
        onClick={()=>setSelected(event)}
        className="ark-event-card group min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-1 hover:border-blue-200 hover:shadow-lg"
      >
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-navy-950 to-blue-700">
          {cover
            ? <img
                src={cover.url}
                alt={event.title}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              />
            : <div className="grid h-full place-items-center text-blue-100">
                <CalendarDays size={38}/>
              </div>
          }

          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent"/>
          <span className="ark-event-status absolute bottom-3 left-3 rounded-full border border-white/25 bg-slate-950/55 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur">
            Completed
          </span>
        </div>

        <div className="p-4">
          <h3 className="line-clamp-2 text-base font-black leading-snug text-navy-950 group-hover:text-blue-700">
            {event.title}
          </h3>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-2 text-[11px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays size={13}/>
              {readableDate(event.event_date)}
            </span>

            {event.location&&(
              <span className="inline-flex items-center gap-1.5">
                <MapPin size={13}/>
                {event.location}
              </span>
            )}
          </div>

          <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-600">
            {event.short_description||event.description||'Project event details.'}
          </p>

          <div className="mt-4 text-xs font-black text-blue-700">
            View event details &rarr;
          </div>
        </div>
      </button>
    )
  }

  return (
    <section className="ark-events overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex flex-col gap-3 bg-gradient-to-r from-navy-950 via-navy-900 to-blue-700 px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.18em] text-blue-200">
            <Sparkles size={13}/>
            Project Highlights
          </div>

          <h2 className="mt-1 text-xl font-black uppercase tracking-[.06em]">
            Project Events
          </h2>

          <p className="mt-1 text-xs text-blue-100">
            Completed Arkavati project events are displayed four at a time.
          </p>
        </div>

        {events.length>0&&(
          <div className="flex items-center gap-3">
            <div className="rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[.14em] text-blue-50">
              {events.length} {events.length===1?'Event':'Events'}
            </div>

            <button
              type="button"
              aria-label="Previous events"
              title="Previous events"
              onClick={previousPage}
              disabled={page===0}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft size={19}/>
            </button>

            <button
              type="button"
              aria-label="Next events"
              title="Next events"
              onClick={nextPage}
              disabled={page>=pageCount-1}
              className="grid h-9 w-9 place-items-center rounded-lg border border-white/20 bg-white/10 text-white transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight size={19}/>
            </button>
          </div>
        )}
      </div>

      {events.length===0
        ? (
          <div className="p-8 text-center">
            <CalendarDays className="mx-auto text-blue-700" size={32}/>
            <div className="mt-3 font-black text-navy-950">
              Project event highlights will appear here
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Completed events published from Event Handler will automatically populate this section.
            </div>
          </div>
        )
        : (
          <div className="p-4 md:p-5">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {visibleEvents.map(renderCard)}
            </div>

            {pageCount>1&&(
              <div className="mt-4 flex items-center justify-center gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={previousPage}
                  disabled={page===0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-navy-900 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={15}/>
                  Previous
                </button>

                <span className="min-w-[80px] text-center text-xs font-bold text-slate-500">
                  {page+1} / {pageCount}
                </span>

                <button
                  type="button"
                  onClick={nextPage}
                  disabled={page>=pageCount-1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-navy-900 transition hover:border-blue-200 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={15}/>
                </button>
              </div>
            )}
          </div>
        )
      }

      <EventDetailsModal event={selected} onClose={()=>setSelected(null)}/>
    </section>
  )
}
