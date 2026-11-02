import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { FlightListItem } from '../lib/types'

export function FlightExplorer({flights,selectedId,onSelect}:{flights:FlightListItem[];selectedId?:string;onSelect:(id:string)=>void}){
  const [day,setDay]=useState<number|0>(0);const [q,setQ]=useState('')
  const items=useMemo(()=>flights.filter(f=>(day===0||f.day===day)&&(!q||f.clip.toLowerCase().includes(q.toLowerCase())||f.id.toLowerCase().includes(q.toLowerCase()))),[flights,day,q])
  return <div className="rounded-2xl border border-slate-200 bg-white shadow-card">
    <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between"><div><h3 className="font-extrabold text-slate-900">Flight explorer</h3><p className="text-xs text-slate-500">Select a real source video clip to inspect its mapped flight path.</p></div><div className="flex gap-2"><select value={day} onChange={e=>setDay(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"><option value={0}>All days</option>{[3,4,5,6,7,8].map(d=><option key={d} value={d}>Day {d}</option>)}</select><label className="flex items-center gap-2 rounded-xl border border-slate-300 px-3"><Search size={15}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search clip" className="w-40 border-0 bg-transparent py-2 text-sm outline-none"/></label></div></div>
    <div className="max-h-[440px] overflow-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="sticky top-0 bg-slate-50 text-slate-500"><tr><th className="px-4 py-3">Flight</th><th>Source clip</th><th>Distance</th><th>Duration</th><th>Altitude</th><th>Start</th><th>End</th></tr></thead><tbody>{items.map(f=><tr key={f.id} onClick={()=>onSelect(f.id)} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${selectedId===f.id?'bg-blue-50':''}`}><td className="px-4 py-3 font-bold text-navy-800">{f.id}<div className="font-normal text-slate-500">Day {f.day}</div></td><td className="max-w-[260px] truncate pr-4 font-mono text-[11px]">{f.clip}</td><td>{f.distance_km.toFixed(2)} km</td><td>{f.duration_label}</td><td>{f.alt_min_m?.toFixed(1)}–{f.alt_max_m?.toFixed(1)} m</td><td>{f.start.lat?.toFixed(5)}, {f.start.lon?.toFixed(5)}</td><td>{f.end.lat?.toFixed(5)}, {f.end.lon?.toFixed(5)}</td></tr>)}</tbody></table></div>
    <div className="border-t border-slate-200 px-4 py-3 text-xs text-slate-500">Showing {items.length} of {flights.length} verified flight clips.</div>
  </div>
}
