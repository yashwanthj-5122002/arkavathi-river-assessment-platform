import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import maplibregl, { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import {
  AlertTriangle, Camera, CheckCircle2, ClipboardCheck, Crosshair, Database,
  Download, Factory, MapPin, RefreshCw, Search, ShieldCheck, Trash2
} from 'lucide-react'
import { api } from '../lib/api'
import type {
  AuthUser, IndustryDischargeStatus, IndustryIntelligenceSummary,
  IndustryObservation, IndustryObservationStatus
} from '../lib/types'

const satelliteStyle:any={version:8,sources:{satellite:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Tiles (c) Esri'}},layers:[{id:'satellite',type:'raster',source:'satellite'}]}

const statusLabel:Record<IndustryObservationStatus,string>={
  OBSERVED_SITE:'Observed Site',
  RECORD_NOT_AVAILABLE:'Record Not Available',
  VERIFICATION_REQUIRED:'Verification Required',
  VERIFIED:'Verified'
}

const dischargeLabel:Record<IndustryDischargeStatus,string>={YES:'Observed',NO:'Not observed',UNKNOWN:'Unknown'}

function fmtClock(seconds:number){
  const safe=Math.max(0,Number.isFinite(seconds)?seconds:0)
  const h=Math.floor(safe/3600),m=Math.floor((safe%3600)/60),s=Math.floor(safe%60)
  return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function statusClass(status:IndustryObservationStatus){
  if(status==='VERIFIED')return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if(status==='VERIFICATION_REQUIRED')return 'border-rose-200 bg-rose-50 text-rose-800'
  if(status==='RECORD_NOT_AVAILABLE')return 'border-slate-300 bg-slate-100 text-slate-700'
  return 'border-amber-200 bg-amber-50 text-amber-800'
}

function observationsGeoJson(rows:IndustryObservation[]){
  return {type:'FeatureCollection',features:rows.map(row=>({
    type:'Feature',id:row.public_id,properties:{id:row.public_id,status:row.status,name:row.name||row.public_id,discharge:row.discharge_status},
    geometry:{type:'Point',coordinates:[row.longitude,row.latitude]}
  }))}
}

export function IndustryIntelligence({user}:{user:AuthUser}){
  const mapNode=useRef<HTMLDivElement|null>(null)
  const mapRef=useRef<MlMap|null>(null)
  const rowsRef=useRef<IndustryObservation[]>([])
  const firstFit=useRef(true)
  const [summary,setSummary]=useState<IndustryIntelligenceSummary|null>(null)
  const [rows,setRows]=useState<IndustryObservation[]>([])
  const [selected,setSelected]=useState<IndustryObservation|null>(null)
  const [search,setSearch]=useState('')
  const [status,setStatus]=useState<IndustryObservationStatus|''>('')
  const [discharge,setDischarge]=useState<IndustryDischargeStatus|''>('')
  const [day,setDay]=useState('')
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const canWrite=user.organization_type!=='CNNL'
  const canVerify=user.organization_type==='COMPANY'&&['COMPANY_ADMIN','COMPANY_PROJECT_MANAGER','COMPANY_REVIEWER','COMPANY_DATA_MANAGER','COMPANY_GIS_REVIEWER','COMPANY_SURVEY_REVIEWER','COMPANY_CIVIL_REVIEWER'].includes(user.role)

  async function reload(keepSelection=true){
    setLoading(true);setError('')
    try{
      const [nextSummary,nextRows]=await Promise.all([api.industryIntelligenceSummary(),api.industryObservations({limit:5000})])
      setSummary(nextSummary);setRows(nextRows);rowsRef.current=nextRows
      setSelected(current=>keepSelection&&current?nextRows.find(row=>row.public_id===current.public_id)??null:current)
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setLoading(false)}
  }

  useEffect(()=>{reload(false);const onUpdate=()=>reload();const onFocus=()=>reload();window.addEventListener('arkavathi-industry-updated',onUpdate);window.addEventListener('focus',onFocus);return()=>{window.removeEventListener('arkavathi-industry-updated',onUpdate);window.removeEventListener('focus',onFocus)}},[])

  const filtered=useMemo(()=>rows.filter(row=>{
    const q=search.trim().toLowerCase()
    if(q&&!`${row.public_id} ${row.name} ${row.video_name} ${row.srt_name} ${row.notes} ${row.category}`.toLowerCase().includes(q))return false
    if(status&&row.status!==status)return false
    if(discharge&&row.discharge_status!==discharge)return false
    if(day&&String(row.survey_day??'')!==day)return false
    return true
  }),[rows,search,status,discharge,day])

  useEffect(()=>{
    if(!mapNode.current||mapRef.current)return
    const map=new maplibregl.Map({container:mapNode.current,style:satelliteStyle,center:[77.4388,13.1672],zoom:9.2})
    mapRef.current=map
    map.addControl(new maplibregl.NavigationControl(),'top-right')
    map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-right')
    map.on('load',()=>{
      map.addSource('industry-observations',{type:'geojson',data:observationsGeoJson([]) as any})
      map.addLayer({id:'industry-observations-glow',type:'circle',source:'industry-observations',paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,8,15,14,19,20],'circle-color':['match',['get','status'],'VERIFIED','#16a34a','VERIFICATION_REQUIRED','#e11d48','RECORD_NOT_AVAILABLE','#64748b','#f59e0b'],'circle-opacity':.26,'circle-blur':.6}} as any)
      map.addLayer({id:'industry-observations',type:'circle',source:'industry-observations',paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,4.5,15,7.5,19,10],'circle-color':['match',['get','status'],'VERIFIED','#16a34a','VERIFICATION_REQUIRED','#e11d48','RECORD_NOT_AVAILABLE','#64748b','#f59e0b'],'circle-stroke-color':'#ffffff','circle-stroke-width':2}} as any)
      map.on('mouseenter','industry-observations',()=>{map.getCanvas().style.cursor='pointer'})
      map.on('mouseleave','industry-observations',()=>{map.getCanvas().style.cursor=''})
      map.on('click','industry-observations',(event:any)=>{const id=String(event.features?.[0]?.properties?.id??'');const row=rowsRef.current.find(item=>item.public_id===id);if(row)setSelected(row)})
    })
    return()=>{map.remove();mapRef.current=null}
  },[])

  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    const update=()=>{
      const source=map.getSource('industry-observations') as maplibregl.GeoJSONSource|undefined
      source?.setData(observationsGeoJson(filtered) as any)
      if(firstFit.current&&filtered.length){
        firstFit.current=false
        const first=filtered[0]
        const bounds=filtered.reduce((b,row)=>b.extend([row.longitude,row.latitude] as [number,number]),new maplibregl.LngLatBounds([first.longitude,first.latitude],[first.longitude,first.latitude]))
        map.fitBounds(bounds,{padding:60,maxZoom:16,duration:500})
      }
    }
    if(map.loaded())update();else map.once('load',update)
  },[filtered])

  useEffect(()=>{
    const map=mapRef.current
    if(selected&&map)map.flyTo({center:[selected.longitude,selected.latitude],zoom:Math.max(map.getZoom(),16),duration:550})
  },[selected?.public_id])

  async function setObservationStatus(next:IndustryObservationStatus){
    if(!selected)return
    try{const updated=await api.setIndustryObservationStatus(selected.public_id,next,selected.registration_reference);setSelected(updated);await reload()}
    catch(e){setError(e instanceof Error?e.message:String(e))}
  }

  async function removeSelected(){
    if(!selected||!canWrite)return
    if(!window.confirm(`Delete ${selected.public_id}? This also removes captured evidence images.`))return
    try{await api.deleteIndustryObservation(selected.public_id);setSelected(null);await reload(false)}
    catch(e){setError(e instanceof Error?e.message:String(e))}
  }

  function exportCsv(){
    const headers=['Candidate ID','Name','Category','Latitude','Longitude','Status','Discharge','Video','SRT','Video Time','Survey Day','Flight ID','Track Match','Nearest Track Distance m','Created By','Created At','Notes']
    const values=filtered.map(row=>[row.public_id,row.name,row.category,row.latitude,row.longitude,statusLabel[row.status],dischargeLabel[row.discharge_status],row.video_name,row.srt_name,fmtClock(row.video_time_seconds),row.survey_day??'',row.flight_id??'',row.track_match?'Matched':'Unmatched',row.nearest_track_distance_m??'',row.created_by_name,row.created_at,row.notes])
    const esc=(value:any)=>`"${String(value??'').replace(/"/g,'""')}"`
    const blob=new Blob([[headers,...values].map(line=>line.map(esc).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ARKAVATHI_INDUSTRY_OBSERVATIONS_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)
  }

  const counts=summary?.status_counts
  return <div className="space-y-5">
    <section className="rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 to-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500 text-white shadow-sm"><Factory size={22}/></div><div><h2 className="text-xl font-black text-slate-900">Industry Survey Intelligence</h2><p className="mt-1 max-w-5xl text-sm leading-6 text-slate-600">This page manages manual field observations, captured video evidence and review status. Automatic moving-GPS industry discovery and river-distance screening run in Street View → Video + SRT. KIADB is the preferred industry/river source when configured; mapped OSM industries and waterways are fallbacks.</p></div></div>
        <div className="flex shrink-0 gap-2"><button type="button" onClick={()=>reload()} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700"><RefreshCw size={14} className={loading?'animate-spin':''}/>Refresh</button><button type="button" onClick={exportCsv} disabled={!filtered.length} className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-3 py-2 text-xs font-black text-white disabled:opacity-40"><Download size={14}/>Export CSV</button></div>
      </div>
    </section>

    {error&&<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
      <Metric icon={<Factory size={18}/>} label="Observed Sites" value={summary?.total??0}/>
      <Metric icon={<AlertTriangle size={18}/>} label="Discharge Observed" value={summary?.discharge_observed??0}/>
      <Metric icon={<Camera size={18}/>} label="With Evidence" value={summary?.with_evidence??0}/>
      <Metric icon={<ClipboardCheck size={18}/>} label="Verification Required" value={counts?.VERIFICATION_REQUIRED??0}/>
      <Metric icon={<Database size={18}/>} label="Record Not Available" value={counts?.RECORD_NOT_AVAILABLE??0}/>
      <Metric icon={<ShieldCheck size={18}/>} label="Verified" value={counts?.VERIFIED??0}/>
    </section>

    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="mb-3 flex flex-col gap-2 xl:flex-row xl:items-end">
        <label className="flex-1 text-[10px] font-black uppercase tracking-wider text-slate-500">Search<div className="relative mt-1"><Search className="absolute left-2.5 top-2.5 text-slate-400" size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="ID, name, video, SRT, category..." className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-xs font-semibold text-slate-800"/></div></label>
        <Filter label="Status" value={status} onChange={value=>setStatus(value as IndustryObservationStatus|'')} options={[['','All statuses'],...Object.entries(statusLabel)]}/>
        <Filter label="Discharge" value={discharge} onChange={value=>setDischarge(value as IndustryDischargeStatus|'')} options={[['','All'],['YES','Observed'],['NO','Not observed'],['UNKNOWN','Unknown']]}/>
        <Filter label="Survey Day" value={day} onChange={setDay} options={[['','All days'],['3','Day 3'],['4','Day 4'],['5','Day 5'],['6','Day 6'],['7','Day 7'],['8','Day 8']]}/>
        <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">{filtered.length.toLocaleString()} shown</div>
      </div>
      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.35fr)_430px]">
        <div className="overflow-hidden rounded-xl border border-slate-200"><div ref={mapNode} className="h-[560px] w-full bg-slate-900"/><div className="flex flex-wrap gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-bold text-slate-600"><span>🟠 Observed site</span><span>⚫ Record not available</span><span>🔴 Verification required</span><span>🟢 Verified</span><span className="ml-auto">Satellite: Esri World Imagery</span></div></div>
        <div className="min-h-[560px] overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          {selected?<ObservationDetails row={selected} canWrite={canWrite} canVerify={canVerify} onStatus={setObservationStatus} onDelete={removeSelected}/>:<div className="grid h-full min-h-[560px] place-items-center p-8 text-center"><div><Crosshair className="mx-auto text-amber-500" size={34}/><div className="mt-3 font-black text-slate-900">Select an industry observation</div><p className="mt-2 text-xs leading-5 text-slate-500">Click a map point or a row below. New observations are created directly from the Video + SRT player with the current synchronized GPS position.</p></div></div>}
        </div>
      </div>
    </section>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="border-b border-slate-200 px-4 py-3"><div className="font-black text-slate-900">Captured survey observations</div><div className="mt-1 text-xs text-slate-500">Every record retains the Video/SRT source and exact playback timestamp used when the observation was marked.</div></div>
      <div className="max-h-[480px] overflow-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="sticky top-0 bg-slate-100 text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Candidate</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Video evidence</th><th className="px-3 py-2">Survey association</th><th className="px-3 py-2">Discharge</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{filtered.map(row=><tr key={row.public_id} onClick={()=>setSelected(row)} className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${selected?.public_id===row.public_id?'bg-blue-50':''}`}><td className="px-3 py-2"><div className="font-black text-slate-900">{row.name||'Unnamed industrial site'}</div><div className="font-mono text-[10px] text-slate-500">{row.public_id} · {row.category.replace(/_/g,' ')}</div></td><td className="px-3 py-2 font-mono text-[10px]">{row.latitude.toFixed(6)}, {row.longitude.toFixed(6)}</td><td className="px-3 py-2"><div className="max-w-[220px] truncate font-bold text-slate-700">{row.video_name||'—'}</div><div className="text-[10px] text-slate-500">{fmtClock(row.video_time_seconds)} · {row.srt_name||'No SRT name'}</div></td><td className="px-3 py-2">{row.track_match?<><div className="font-bold text-slate-700">Day {row.survey_day} · {row.flight_id}</div><div className="text-[10px] text-slate-500">{Math.round(row.nearest_track_distance_m??0)} m from supplied track</div></>:<div className="text-[10px] font-bold text-amber-700">No supplied track within {Math.round(summary?.track_match_threshold_m??1500)} m</div>}</td><td className="px-3 py-2"><span className={`font-black ${row.discharge_status==='YES'?'text-rose-700':'text-slate-600'}`}>{dischargeLabel[row.discharge_status]}</span></td><td className="px-3 py-2"><span className={`inline-flex rounded-full border px-2 py-1 text-[9px] font-black ${statusClass(row.status)}`}>{statusLabel[row.status]}</span></td></tr>)}{!filtered.length&&<tr><td colSpan={6} className="px-4 py-12 text-center text-sm font-semibold text-slate-400">No industry observations match the current filters.</td></tr>}</tbody></table></div>
    </section>
  </div>
}

function Metric({icon,label,value}:{icon:ReactNode;label:string;value:number}){return <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-slate-500">{icon}<span className="text-[10px] font-black uppercase tracking-wider">{label}</span></div><div className="mt-2 text-2xl font-black text-navy-900">{value.toLocaleString()}</div></div>}

function Filter({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:[string,string][]}){return <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 block min-w-[150px] rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold normal-case text-slate-700">{options.map(([v,l])=><option key={v||'all'} value={v}>{l}</option>)}</select></label>}

function ObservationDetails({row,canWrite,canVerify,onStatus,onDelete}:{row:IndustryObservation;canWrite:boolean;canVerify:boolean;onStatus:(status:IndustryObservationStatus)=>void;onDelete:()=>void}){
  return <div className="h-full overflow-auto p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Video/SRT candidate</div><div className="mt-1 text-lg font-black text-slate-900">{row.name||'Unnamed industrial site'}</div><div className="mt-1 font-mono text-[10px] text-slate-500">{row.public_id}</div></div><span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${statusClass(row.status)}`}>{statusLabel[row.status]}</span></div>
    {row.evidence.length?<div className="mt-4 grid grid-cols-2 gap-2">{row.evidence.slice(0,4).map(item=><a key={item.public_id} href={item.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border border-slate-200 bg-black"><img src={item.url} alt={item.original_name} className="h-28 w-full object-cover"/></a>)}</div>:<div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-white p-4 text-center text-xs font-semibold text-slate-400"><Camera className="mx-auto mb-2" size={20}/>No captured frame attached</div>}
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs"><Detail label="Latitude" value={row.latitude.toFixed(6)}/><Detail label="Longitude" value={row.longitude.toFixed(6)}/><Detail label="Video" value={row.video_name||'—'}/><Detail label="Timestamp" value={fmtClock(row.video_time_seconds)}/><Detail label="SRT" value={row.srt_name||'—'}/><Detail label="Category" value={row.category.replace(/_/g,' ')}/><Detail label="Discharge" value={dischargeLabel[row.discharge_status]}/><Detail label="Evidence" value={`${row.evidence.length} image(s)`}/></div>
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs"><div className="font-black text-slate-700">Survey track association</div>{row.track_match?<div className="mt-1 leading-5 text-slate-600">Day {row.survey_day} · {row.flight_id}<br/>{row.flight_clip}<br/>{Math.round(row.nearest_track_distance_m??0)} m from nearest supplied track point.</div>:<div className="mt-1 leading-5 text-amber-700">This SRT observation is outside the 1.5 km matching threshold of the supplied Day 3–8 projection tracks. It is still retained as valid Video/SRT evidence.</div>}</div>
    {(row.notes||row.discharge_notes)&&<div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-xs leading-5 text-slate-600">{row.notes&&<><div className="font-black text-slate-700">Observation notes</div><div>{row.notes}</div></>}{row.discharge_notes&&<><div className="mt-2 font-black text-slate-700">Discharge notes</div><div>{row.discharge_notes}</div></>}</div>}
    <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-[11px] leading-5 text-blue-900"><strong>Registration safeguard:</strong> “Record Not Available” means no registry comparison is currently available in this dashboard. It must not be interpreted as “unregistered”.</div>
    {canWrite&&<div className="mt-4"><div className="mb-2 text-[10px] font-black uppercase tracking-wider text-slate-500">Verification status</div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>onStatus('OBSERVED_SITE')} className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-[10px] font-black text-amber-800">Observed Site</button><button type="button" onClick={()=>onStatus('RECORD_NOT_AVAILABLE')} className="rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-black text-slate-700">Record Not Available</button><button type="button" onClick={()=>onStatus('VERIFICATION_REQUIRED')} className="rounded-lg border border-rose-300 bg-rose-50 px-2.5 py-2 text-[10px] font-black text-rose-800">Verification Required</button>{canVerify&&<button type="button" onClick={()=>onStatus('VERIFIED')} className="rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-2 text-[10px] font-black text-emerald-800"><CheckCircle2 size={12} className="mr-1 inline"/>Verified</button>}</div><button type="button" onClick={onDelete} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-[10px] font-black text-rose-700"><Trash2 size={12}/>Delete observation</button></div>}
  </div>
}

function Detail({label,value}:{label:string;value:string}){return <div className="rounded-lg border border-slate-200 bg-white p-2"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 break-words font-bold text-slate-700">{value}</div></div>}
