import { Clock3, FileSpreadsheet, MapPin, Mountain, Navigation } from 'lucide-react'
import type { TrackPoint } from '../lib/types'

function Row({label,value}:{label:string;value:string}){
  return <div className="grid grid-cols-[110px_1fr] gap-3 border-b border-slate-100 py-1.5 text-[11px] last:border-0"><span className="font-semibold text-slate-500">{label}</span><span className="break-all font-semibold text-slate-800">{value}</span></div>
}
const num=(v:number|null,d:number,suffix='')=>v==null?'Not supplied':`${v.toFixed(d)}${suffix}`

export function PointInspector({point}:{point:TrackPoint|null}){
  if(!point)return null
  return <div className="rounded-2xl border border-amber-200 bg-white shadow-card">
    <div className="rounded-t-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-3 text-white">
      <div className="text-[10px] font-black uppercase tracking-wider text-amber-50">Selected survey point · {point.point_index}/{point.point_count}</div>
      <div className="mt-1 flex items-center gap-2 font-black"><MapPin size={16}/><span>{point.point_id}</span></div>
    </div>
    <div className="p-4">
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-50 p-2 text-center"><Clock3 className="mx-auto text-slate-600" size={16}/><div className="mt-1 text-[11px] font-black">{point.frame?.toLocaleString() ?? '—'}</div><div className="text-[9px] text-slate-500">Frame</div></div>
        <div className="rounded-xl bg-blue-50 p-2 text-center"><Navigation className="mx-auto text-blue-700" size={16}/><div className="mt-1 text-[11px] font-black">{point.progress_pct.toFixed(1)}%</div><div className="text-[9px] text-slate-500">Flight progress</div></div>
        <div className="rounded-xl bg-emerald-50 p-2 text-center"><Mountain className="mx-auto text-emerald-700" size={16}/><div className="mt-1 text-[11px] font-black">{num(point.abs_alt_m,1,' m')}</div><div className="text-[9px] text-slate-500">Abs. altitude</div></div>
      </div>
      <Row label="Clip" value={point.clip}/>
      <Row label="Time" value={point.time?.replace('T',' ') ?? (point.day===3?'Not supplied in Day 3 schema':'—')}/>
      <Row label="Latitude" value={point.lat.toFixed(6)}/>
      <Row label="Longitude" value={point.lon.toFixed(6)}/>
      <Row label="Relative alt." value={num(point.rel_alt_m,1,' m')}/>
      <Row label="Absolute alt." value={num(point.abs_alt_m,3,' m')}/>
      <Row label="From start" value={`${point.distance_from_start_m.toFixed(2)} m`}/>
      <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-[10px] leading-4 text-slate-600"><FileSpreadsheet size={15} className="mt-0.5 shrink-0 text-emerald-700"/><div><b>{point.source_workbook ?? 'Source workbook'}</b> · row <b>{point.source_row?.toLocaleString() ?? '—'}</b><br/>{point.schema_note}</div></div>
    </div>
  </div>
}
