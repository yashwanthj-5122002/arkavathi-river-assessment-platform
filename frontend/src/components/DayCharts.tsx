import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DaySummary } from '../lib/types'

export function DayCharts({days}:{days:DaySummary[]}) {
  return <div className="grid gap-4 xl:grid-cols-2">
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-4"><h3 className="font-extrabold text-slate-900">Flight distance by survey day</h3><p className="text-xs text-slate-500">Distance values reported in the supplied Merged.kmz.</p></div>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={days}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day" tickFormatter={(v)=>`Day ${v}`} fontSize={12}/><YAxis fontSize={12} unit=" km"/><Tooltip formatter={(v)=>[`${Number(v).toFixed(2)} km`,'Distance']} labelFormatter={(v)=>`Day ${v}`}/><Bar dataKey="distance_km" fill="#0a4d94" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
    </div>
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-4"><h3 className="font-extrabold text-slate-900">Flight clips by survey day</h3><p className="text-xs text-slate-500">118 source video clips across six survey days.</p></div>
      <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={days}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day" tickFormatter={(v)=>`Day ${v}`} fontSize={12}/><YAxis fontSize={12}/><Tooltip formatter={(v)=>[`${v} clips`,'Flights']} labelFormatter={(v)=>`Day ${v}`}/><Bar dataKey="clips" fill="#00a6a6" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div>
    </div>
  </div>
}
