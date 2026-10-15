import { useMemo, useState } from 'react'
import { Activity, CheckCircle2, ChevronDown, ChevronUp, Crosshair, Download, Factory, Gauge, MapPin, Navigation, PlayCircle, Route as RouteIcon, Satellite, Timer, TriangleAlert } from 'lucide-react'
import type { IndustryCandidate } from '../lib/types'

type RouteSample = {time:number;lat:number;lng:number}
type StreetLocation = {lat:number;lng:number}

type Props = {
  active:boolean
  route:RouteSample[]
  location:StreetLocation|null
  heading:number|null
  currentTime:number
  duration:number
  playing:boolean
  videoName:string
  srtName:string
  industries:IndustryCandidate[]
  liveIndustries:IndustryCandidate[]
  radiusM:number
  riverRadiusM:number
  onFocusIndustry?:(candidate:IndustryCandidate)=>void
  onSeekIndustry?:(candidate:IndustryCandidate)=>void
}

type XY={time:number;value:number}

const EARTH_RADIUS_M=6371000

function finite(value:unknown):number|null{
  const n=Number(value)
  return Number.isFinite(n)?n:null
}

function distanceMeters(aLat:number,aLng:number,bLat:number,bLng:number){
  const p1=aLat*Math.PI/180,p2=bLat*Math.PI/180
  const dLat=(bLat-aLat)*Math.PI/180,dLng=(bLng-aLng)*Math.PI/180
  const x=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLng/2)**2
  return 2*EARTH_RADIUS_M*Math.asin(Math.min(1,Math.sqrt(x)))
}

function routeDistanceMeters(route:RouteSample[]){
  let total=0
  for(let i=1;i<route.length;i++)total+=distanceMeters(route[i-1].lat,route[i-1].lng,route[i].lat,route[i].lng)
  return total
}

function formatDuration(seconds:number){
  const s=Math.max(0,Number.isFinite(seconds)?seconds:0)
  const hours=Math.floor(s/3600),minutes=Math.floor((s%3600)/60),secs=Math.floor(s%60)
  return hours>0?`${String(hours).padStart(2,'0')}:${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`:`${String(minutes).padStart(2,'0')}:${String(secs).padStart(2,'0')}`
}

function formatDistance(meters:number){return meters>=1000?`${(meters/1000).toFixed(2)} km`:`${Math.round(meters)} m`}
function formatSpeed(kmh:number|null){return kmh===null?'—':`${kmh.toFixed(1)} km/h`}

function sampleAltitude(sample:RouteSample):number|null{
  const row=sample as any
  for(const key of ['abs_alt_m','absolute_altitude','altitude','alt','rel_alt_m','relative_altitude','height']){
    const n=finite(row?.[key]);if(n!==null)return n
  }
  return null
}

function candidateResolvedName(candidate:IndustryCandidate):string{
  const row=candidate as any,meta=row.metadata??{}
  const explicit=String(row.company_name||row.allottee||meta.resolved_industry_name||meta.company_name||meta.allottee||'').trim()
  if(explicit)return explicit
  const display=String(row.display_name||row.name||'').trim()
  const status=String(row.identity_status||meta.identity_status||'').toUpperCase()
  if(display&&!/industrial( area| site| building)? \(osm context\)/i.test(display)&&status!=='INDUSTRIAL_CONTEXT_ONLY')return display
  return ''
}

function candidateDisplayName(candidate:IndustryCandidate){
  return candidateResolvedName(candidate)||'Industrial Building Detected — Company Name Unavailable'
}

function identityLabel(candidate:IndustryCandidate){
  const row=candidate as any,meta=row.metadata??{}
  const source=String(row.identity_source||meta.identity_source||row.source||'').toUpperCase()
  const status=String(row.identity_status||meta.identity_status||'').toUpperCase()
  if(source.includes('KIADB'))return 'KIADB OFFICIAL'
  if(source.includes('KSRSAC')||source.includes('REGISTRY'))return 'REGISTRY MATCH'
  if(source.includes('OVERTURE'))return 'OVERTURE MATCH'
  if(status==='INDUSTRIAL_CONTEXT_ONLY')return 'GEOMETRY ONLY'
  if(source.includes('OSM')||row.source==='OPENSTREETMAP')return candidateResolvedName(candidate)?'OSM NAMED':'GEOMETRY ONLY'
  return candidateResolvedName(candidate)?'RESOLVED':'UNVERIFIED'
}

function identitySource(candidate:IndustryCandidate){
  const row=candidate as any,meta=row.metadata??{}
  return String(row.identity_source||meta.identity_source||row.source||'Unknown').replace(/_/g,' ')
}

function buildSpeedSeries(route:RouteSample[]):XY[]{
  if(route.length<2)return []
  const out:XY[]=[]
  let anchor=0
  for(let i=1;i<route.length;i++){
    const dt=Number(route[i].time)-Number(route[anchor].time)
    if(dt<0.8&&i<route.length-1)continue
    if(dt>0){
      const d=distanceMeters(route[anchor].lat,route[anchor].lng,route[i].lat,route[i].lng)
      const speed=(d/dt)*3.6
      if(Number.isFinite(speed)&&speed>=0&&speed<250)out.push({time:Number(route[i].time),value:speed})
    }
    anchor=i
  }
  return out
}

function nearestSpeed(series:XY[],time:number):number|null{
  if(!series.length)return null
  let best=series[0],delta=Math.abs(series[0].time-time)
  for(let i=1;i<series.length;i++){const d=Math.abs(series[i].time-time);if(d<delta){best=series[i];delta=d}else if(series[i].time>time&&d>delta)break}
  return best.value
}

function nearestRouteSample(route:RouteSample[],time:number):RouteSample|null{
  if(!route.length)return null
  let lo=0,hi=route.length-1
  while(lo<hi){const mid=Math.floor((lo+hi)/2);if(Number(route[mid].time)<time)lo=mid+1;else hi=mid}
  const a=route[lo],b=lo>0?route[lo-1]:a
  return Math.abs(Number(a.time)-time)<Math.abs(Number(b.time)-time)?a:b
}

function altitudeSeries(route:RouteSample[]):XY[]{
  const out:XY[]=[]
  for(const sample of route){const alt=sampleAltitude(sample);if(alt!==null)out.push({time:Number(sample.time),value:alt})}
  return out
}

function downsample(series:XY[],max=180){
  if(series.length<=max)return series
  const step=Math.ceil(series.length/max)
  return series.filter((_,i)=>i%step===0||i===series.length-1)
}

function MiniLineChart({series,label,unit,currentTime}:{series:XY[];label:string;unit:string;currentTime:number}){
  if(series.length<2)return <div className="grid h-40 place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 text-center text-xs font-semibold text-slate-500">{label} data is not exposed by the current Video + SRT sync route.</div>
  const data=downsample(series)
  const minT=Math.min(...data.map(x=>x.time)),maxT=Math.max(...data.map(x=>x.time));const spanT=Math.max(0.001,maxT-minT)
  const minV=Math.min(...data.map(x=>x.value)),maxV=Math.max(...data.map(x=>x.value));const spanV=Math.max(0.001,maxV-minV)
  const pts=data.map(x=>`${4+92*((x.time-minT)/spanT)},${94-86*((x.value-minV)/spanV)}`).join(' ')
  const cx=4+92*Math.max(0,Math.min(1,(currentTime-minT)/spanT))
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="mb-1 flex items-center justify-between text-[10px] font-black uppercase tracking-wider text-slate-500"><span>{label}</span><span>{minV.toFixed(1)}–{maxV.toFixed(1)} {unit}</span></div>
    <svg viewBox="0 0 100 100" className="h-36 w-full" preserveAspectRatio="none" aria-label={label}>
      <line x1="4" y1="94" x2="96" y2="94" stroke="currentColor" className="text-slate-300" strokeWidth="0.7"/>
      <line x1="4" y1="8" x2="4" y2="94" stroke="currentColor" className="text-slate-300" strokeWidth="0.7"/>
      <polyline points={pts} fill="none" stroke="currentColor" className="text-cyan-700" strokeWidth="1.6" vectorEffect="non-scaling-stroke"/>
      <line x1={cx} y1="8" x2={cx} y2="94" stroke="currentColor" className="text-amber-500" strokeWidth="1.2" strokeDasharray="3 2" vectorEffect="non-scaling-stroke"/>
    </svg>
  </div>
}

function Stat({label,value,detail,icon}:{label:string;value:string;detail?:string;icon:React.ReactNode}){
  return <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div><div className="mt-1 text-lg font-black text-slate-900">{value}</div>{detail&&<div className="mt-0.5 text-[10px] font-semibold text-slate-500">{detail}</div>}</div><div className="rounded-lg bg-slate-100 p-2 text-slate-600">{icon}</div></div></div>
}

function csvCell(value:unknown){const text=String(value??'');return /[",\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text}

export function SrtFlightAnalyticsDashboard({active,route,location,heading,currentTime,duration,playing,videoName,srtName,industries,liveIndustries,radiusM,riverRadiusM,onFocusIndustry,onSeekIndustry}:Props){
  const [expanded,setExpanded]=useState(true)
  const metrics=useMemo(()=>{
    const distanceM=routeDistanceMeters(route)
    const start=route[0]??null,end=route[route.length-1]??null
    const effectiveDuration=duration>0?duration:(route.length?Math.max(0,Number(route[route.length-1].time)-Number(route[0].time)):0)
    const avgSpeed=effectiveDuration>0?(distanceM/effectiveDuration)*3.6:null
    const speeds=buildSpeedSeries(route)
    const maxSpeed=speeds.length?Math.max(...speeds.map(x=>x.value)):null
    const currentSpeed=nearestSpeed(speeds,currentTime)
    const alts=altitudeSeries(route)
    const altValues=alts.map(x=>x.value)
    const bbox=route.length?{
      south:Math.min(...route.map(x=>x.lat)),west:Math.min(...route.map(x=>x.lng)),north:Math.max(...route.map(x=>x.lat)),east:Math.max(...route.map(x=>x.lng))
    }:null
    return {distanceM,start,end,effectiveDuration,avgSpeed,maxSpeed,currentSpeed,speeds,alts,minAlt:altValues.length?Math.min(...altValues):null,maxAlt:altValues.length?Math.max(...altValues):null,avgAlt:altValues.length?altValues.reduce((a,b)=>a+b,0)/altValues.length:null,bbox}
  },[route,duration,currentTime])

  const namedIndustries=useMemo(()=>industries.filter(c=>Boolean(candidateResolvedName(c))),[industries])
  const unnamedIndustries=industries.length-namedIndustries.length
  const currentIndustry=liveIndustries[0]??null
  const currentSample=nearestRouteSample(route,currentTime)
  const progress=metrics.effectiveDuration>0?Math.max(0,Math.min(100,(currentTime/metrics.effectiveDuration)*100)):0

  const exportCsv=()=>{
    const header=['name','identity_status','identity_source','source','source_id','latitude','longitude','distance_from_route_m','nearest_video_time','nearest_video_time_s','verification_status']
    const rows=industries.map(c=>{const row=c as any;return [candidateDisplayName(c),row.identity_status??'',identitySource(c),row.source??'',row.source_id??'',row.lat,row.lng,row.distance_from_route_m,row.nearest_video_time??'',row.nearest_video_time_s??'',row.verification_status??'']})
    const csv=[header,...rows].map(row=>row.map(csvCell).join(',')).join('\n')
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${(srtName||'srt').replace(/\.[^.]+$/,'')}_industry_analytics.csv`;a.click();URL.revokeObjectURL(url)
  }

  if(!active||route.length<2)return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex items-center gap-3"><div className="rounded-xl bg-slate-100 p-3 text-slate-500"><Satellite size={22}/></div><div><h2 className="text-lg font-black text-slate-900">SRT Flight Analytics</h2><p className="mt-1 text-sm text-slate-500">Upload a matching Video + SRT pair and start playback. The dashboard will populate from that SRT automatically.</p></div></div></section>

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
    <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white lg:flex-row lg:items-center lg:justify-between">
      <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300"><Activity size={14}/>SRT Flight Analytics</div><h2 className="mt-1 text-xl font-black">Dynamic Video + SRT Survey Dashboard</h2><div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-300"><span>{videoName||'Video'}</span><span>↔</span><span>{srtName||'SRT'}</span><span className={playing?'text-emerald-300':'text-amber-300'}>{playing?'LIVE PLAYBACK':'PAUSED'}</span></div></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={exportCsv} disabled={!industries.length} className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/10 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Download size={14}/>Industry CSV</button><button type="button" onClick={()=>setExpanded(v=>!v)} className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-black text-white">{expanded?<ChevronUp size={14}/>:<ChevronDown size={14}/>} {expanded?'Collapse':'Expand'}</button></div>
    </div>

    <div className="h-1.5 bg-slate-200"><div className="h-full bg-amber-400 transition-all" style={{width:`${progress}%`}}/></div>

    {expanded&&<div className="space-y-5 p-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <Stat label="Duration" value={formatDuration(metrics.effectiveDuration)} detail={`Current ${formatDuration(currentTime)}`} icon={<Timer size={17}/>}/>
        <Stat label="Route length" value={formatDistance(metrics.distanceM)} detail="Calculated from SRT GPS" icon={<RouteIcon size={17}/>}/>
        <Stat label="GPS samples" value={route.length.toLocaleString()} detail="Current uploaded SRT" icon={<Satellite size={17}/>}/>
        <Stat label="Industries" value={industries.length.toString()} detail={`${namedIndustries.length} named · ${unnamedIndustries} name unavailable`} icon={<Factory size={17}/>}/>
        <Stat label="Average speed" value={formatSpeed(metrics.avgSpeed)} detail="Route distance ÷ duration" icon={<Gauge size={17}/>}/>
        <Stat label="Current speed" value={formatSpeed(metrics.currentSpeed)} detail="~1 s GPS window" icon={<Navigation size={17}/>}/>
        <Stat label="Max speed" value={formatSpeed(metrics.maxSpeed)} detail="Filtered GPS windows" icon={<Activity size={17}/>}/>
        <Stat label="GPS status" value={route.length>=2?'VALID':'CHECK'} detail={`${progress.toFixed(0)}% video progress`} icon={route.length>=2?<CheckCircle2 size={17}/>:<TriangleAlert size={17}/>}/>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="mb-3 flex items-center gap-2"><RouteIcon size={17} className="text-cyan-700"/><h3 className="font-black text-slate-900">SRT route details</h3></div>
          <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl bg-white p-3"><div className="font-black uppercase tracking-wider text-slate-400">Start</div><div className="mt-1 font-mono font-bold text-slate-800">{metrics.start?`${metrics.start.lat.toFixed(6)}, ${metrics.start.lng.toFixed(6)}`:'—'}</div></div>
            <div className="rounded-xl bg-white p-3"><div className="font-black uppercase tracking-wider text-slate-400">Current</div><div className="mt-1 font-mono font-bold text-amber-700">{location?`${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`:currentSample?`${currentSample.lat.toFixed(6)}, ${currentSample.lng.toFixed(6)}`:'—'}</div></div>
            <div className="rounded-xl bg-white p-3"><div className="font-black uppercase tracking-wider text-slate-400">End</div><div className="mt-1 font-mono font-bold text-slate-800">{metrics.end?`${metrics.end.lat.toFixed(6)}, ${metrics.end.lng.toFixed(6)}`:'—'}</div></div>
            <div className="rounded-xl bg-white p-3"><div className="font-black uppercase tracking-wider text-slate-400">Heading</div><div className="mt-1 font-black text-slate-800">{heading===null||!Number.isFinite(heading)?'—':`${Math.round(heading)}°`}</div></div>
            <div className="rounded-xl bg-white p-3"><div className="font-black uppercase tracking-wider text-slate-400">Altitude</div><div className="mt-1 font-black text-slate-800">{metrics.minAlt===null?'Not exposed':`${metrics.minAlt.toFixed(1)}–${metrics.maxAlt?.toFixed(1)} m`}</div></div>
            <div className="rounded-xl bg-white p-3"><div className="font-black uppercase tracking-wider text-slate-400">Search corridor</div><div className="mt-1 font-black text-slate-800">GPS {radiusM} m · River {riverRadiusM} m</div></div>
          </div>
          {metrics.bbox&&<div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600"><span className="font-black text-slate-800">SRT bounding box:</span> S {metrics.bbox.south.toFixed(6)} · W {metrics.bbox.west.toFixed(6)} · N {metrics.bbox.north.toFixed(6)} · E {metrics.bbox.east.toFixed(6)}</div>}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center gap-2"><Crosshair size={17} className="text-amber-600"/><h3 className="font-black text-slate-900">Current frame intelligence</h3></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-amber-50 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Video time</div><div className="mt-1 text-xl font-black text-amber-950">{formatDuration(currentTime)}</div></div>
            <div className="rounded-xl bg-cyan-50 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-cyan-700">Route progress</div><div className="mt-1 text-xl font-black text-cyan-950">{progress.toFixed(1)}%</div></div>
          </div>
          {currentIndustry?<div className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3"><div className="flex items-start justify-between gap-2"><div><div className="text-[10px] font-black uppercase tracking-wider text-orange-700">Current nearby industry</div><div className="mt-1 font-black text-slate-900">{candidateDisplayName(currentIndustry)}</div><div className="mt-1 text-[11px] font-semibold text-slate-600">{identityLabel(currentIndustry)} · {identitySource(currentIndustry)}</div></div><Factory size={18} className="shrink-0 text-orange-700"/></div></div>:<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">No industry inside the current-frame filter.</strong> Route industries remain listed below and on the map.</div>}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <MiniLineChart series={metrics.speeds} label="Speed profile" unit="km/h" currentTime={currentTime}/>
        <MiniLineChart series={metrics.alts} label="Altitude profile" unit="m" currentTime={currentTime}/>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-black text-slate-900">Industry identification summary</h3><p className="mt-0.5 text-xs text-slate-500">Every result belongs to the currently uploaded SRT route. Names are shown only when a defensible identity source exists.</p></div><div className="flex flex-wrap gap-2 text-[10px] font-black"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">{namedIndustries.length} NAMED</span><span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">{unnamedIndustries} NAME UNAVAILABLE</span><span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{industries.length} TOTAL</span></div></div>
        {!industries.length?<div className="p-6 text-center text-sm font-semibold text-slate-500">No industries have been detected for this SRT route yet. Use Refresh GIS data in Industry Intelligence.</div>:<div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">#</th><th className="px-4 py-3">Industry / facility</th><th className="px-4 py-3">Identification</th><th className="px-4 py-3">Route distance</th><th className="px-4 py-3">Closest video</th><th className="px-4 py-3">Coordinates</th><th className="px-4 py-3">Actions</th></tr></thead><tbody className="divide-y divide-slate-100">{[...industries].sort((a,b)=>Number((a as any).distance_from_route_m??1e12)-Number((b as any).distance_from_route_m??1e12)).map((candidate,index)=>{const row=candidate as any;const resolved=Boolean(candidateResolvedName(candidate));return <tr key={candidate.id} className="align-top hover:bg-slate-50"><td className="px-4 py-3 font-mono font-bold text-slate-400">{String(index+1).padStart(2,'0')}</td><td className="px-4 py-3"><div className="max-w-[320px] font-black text-slate-900">{candidateDisplayName(candidate)}</div>{row.nature_of_industry&&<div className="mt-1 text-[10px] text-slate-500">{row.nature_of_industry}</div>}</td><td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-black ${resolved?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-800'}`}>{identityLabel(candidate)}</span><div className="mt-1 max-w-[220px] text-[10px] text-slate-500">{identitySource(candidate)}</div></td><td className="px-4 py-3 font-black text-slate-700">{formatDistance(Number(row.distance_from_route_m??0))}</td><td className="px-4 py-3 font-mono font-bold text-amber-700">{row.nearest_video_time||formatDuration(Number(row.nearest_video_time_s??0))}</td><td className="px-4 py-3 font-mono text-[10px] text-slate-600">{Number(row.lat).toFixed(6)}<br/>{Number(row.lng).toFixed(6)}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={()=>onFocusIndustry?.(candidate)} className="inline-flex items-center gap-1 rounded-md bg-cyan-50 px-2 py-1.5 text-[10px] font-black text-cyan-800"><MapPin size={11}/>Map</button><button type="button" onClick={()=>onSeekIndustry?.(candidate)} className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1.5 text-[10px] font-black text-amber-800"><PlayCircle size={11}/>Video</button></div></td></tr>})}</tbody></table></div>}
      </div>

      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-950"><strong>Identification rule:</strong> SRT GPS defines the route; industrial geometry is detected around that route; company names are displayed only when KIADB, a named OSM feature, or another configured registry provides a defensible match. Geometry-only detections remain explicitly unverified instead of being assigned a guessed company name.</div>
    </div>}
  </section>
}
