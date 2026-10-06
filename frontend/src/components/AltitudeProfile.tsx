import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { FlightDetail } from '../lib/types'

export function AltitudeProfile({flight}:{flight:FlightDetail|null}) {
  if (!flight) return <div className="grid h-72 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-sm text-slate-500">Select a flight to view its altitude profile.</div>
  const source = flight.playback.length
    ? flight.playback.map((p,i)=>({x:i,alt:p.abs_alt_m ?? 0,label:p.time?.slice(11,19) ?? `Point ${i+1}`}))
    : flight.coordinates.map((p,i)=>({x:i,alt:p[2] ?? 0,label:`Point ${i+1}`}))
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
    <div className="mb-3"><h3 className="font-extrabold text-slate-900">Altitude profile</h3><p className="truncate text-xs text-slate-500">{flight.clip} · absolute altitude</p></div>
    <div className="h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={source}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="x" hide/><YAxis width={62} domain={['dataMin - 5','dataMax + 5']} fontSize={11} unit=" m"/><Tooltip labelFormatter={(label)=>source[Number(label)]?.label ?? ''} formatter={(v)=>[`${Number(v).toFixed(1)} m`,'Abs altitude']}/><Line type="monotone" dataKey="alt" stroke="#0a4d94" dot={false} strokeWidth={2}/></LineChart></ResponsiveContainer></div>
  </div>
}
