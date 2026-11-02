import { Clock3, MapPin, Mountain, Route, Video } from 'lucide-react'
import type { FlightDetail } from '../lib/types'

function Row({label,value}:{label:string;value:string}) { return <div className="grid grid-cols-[100px_1fr] gap-3 border-b border-slate-100 py-2 text-xs last:border-0"><span className="font-semibold text-slate-500">{label}</span><span className="break-all font-medium text-slate-800">{value}</span></div> }
function fmt(v:number|null|undefined,d=6){return v==null?'—':v.toFixed(d)}

export function FlightDetails({flight}:{flight:FlightDetail|null}) {
  if (!flight) return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="font-extrabold text-slate-900">Flight details</div><p className="mt-2 text-sm text-slate-500">Click a flight line, Start/End point, or table row.</p></div>
  return <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
    <div className="rounded-t-2xl bg-navy-900 px-4 py-3 text-white"><div className="text-xs font-semibold text-blue-100">Day {flight.day} · {flight.id}</div><div className="mt-1 flex items-center gap-2 font-bold"><Video size={16}/><span className="truncate">{flight.clip}</span></div></div>
    <div className="p-4">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-blue-50 p-2 text-center"><Route className="mx-auto text-blue-700" size={18}/><div className="mt-1 text-sm font-black">{flight.distance_km.toFixed(2)} km</div><div className="text-[10px] text-slate-500">Distance</div></div>
        <div className="rounded-xl bg-cyan-50 p-2 text-center"><Clock3 className="mx-auto text-cyan-700" size={18}/><div className="mt-1 text-sm font-black">{flight.duration_label}</div><div className="text-[10px] text-slate-500">Duration</div></div>
        <div className="rounded-xl bg-emerald-50 p-2 text-center"><Mountain className="mx-auto text-emerald-700" size={18}/><div className="mt-1 text-sm font-black">{fmt(flight.alt_max_m,1)} m</div><div className="text-[10px] text-slate-500">Max alt.</div></div>
      </div>
      <div className="mb-2 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-emerald-700"><MapPin size={14}/>Start</div>
      <Row label="Time" value={flight.start.time ?? 'Unavailable in Day 3 schema'}/><Row label="Frame" value={flight.start.frame?.toLocaleString() ?? '—'}/><Row label="Latitude" value={fmt(flight.start.lat)}/><Row label="Longitude" value={fmt(flight.start.lon)}/><Row label="Rel. Alt" value={flight.start.rel_alt_m==null?'—':`${flight.start.rel_alt_m.toFixed(1)} m`}/><Row label="Abs. Alt" value={flight.start.abs_alt_m==null?'—':`${flight.start.abs_alt_m.toFixed(3)} m`}/>
      <div className="mb-2 mt-4 flex items-center gap-2 text-xs font-extrabold uppercase tracking-wide text-rose-700"><MapPin size={14}/>End</div>
      <Row label="Time" value={flight.end.time ?? 'Unavailable in Day 3 schema'}/><Row label="Frame" value={flight.end.frame?.toLocaleString() ?? '—'}/><Row label="Latitude" value={fmt(flight.end.lat)}/><Row label="Longitude" value={fmt(flight.end.lon)}/><Row label="Abs. Alt" value={flight.end.abs_alt_m==null?'—':`${flight.end.abs_alt_m.toFixed(3)} m`}/>
      <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600"><b>{flight.reported_points?.toLocaleString() ?? '—'}</b> reported sampled track points · <b>{flight.rendered_vertices.toLocaleString()}</b> rendered line vertices</div>
    </div>
  </div>
}
