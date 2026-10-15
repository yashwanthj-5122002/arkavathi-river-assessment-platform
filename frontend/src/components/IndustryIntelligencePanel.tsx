import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Building2, ExternalLink, Factory, LocateFixed, MapPinned, Play, RefreshCw, Search, ShieldCheck, Waves } from 'lucide-react'
import type { IndustryCandidate, IndustryDiscoveryResult } from '../lib/types'

type Props = {
  result: IndustryDiscoveryResult | null
  loading: boolean
  error: string
  radiusM: number
  onRadiusChange: (value:number)=>void
  riverRadiusM: number
  onRiverRadiusChange: (value:number)=>void
  currentRiverDistanceM: number|null
  onRefresh: ()=>void
  onFocus: (candidate:IndustryCandidate)=>void
  onSeek: (candidate:IndustryCandidate)=>void
  liveCandidates: IndustryCandidate[]
  currentTime?: number
  currentVideoName?: string
}

function sourceLabel(source:string){
  if(source==='KIADB')return 'KIADB'
  if(source==='OPENSTREETMAP')return 'OpenStreetMap'
  return source.replace(/_/g,' ')
}

function sourceUrl(candidate:IndustryCandidate){
  const googleUrl=String(candidate.metadata?.google_maps_uri??'').trim()
  if(googleUrl)return googleUrl
  if(candidate.source==='KIADB')return 'https://kiadb.karnataka.gov.in/kiadbgisportal/'
  if(candidate.source==='OPENSTREETMAP'){
    const [type,id]=candidate.source_id.split('/')
    if(type&&id)return `https://www.openstreetmap.org/${encodeURIComponent(type)}/${encodeURIComponent(id)}`
    return 'https://www.openstreetmap.org/'
  }
  return ''
}

function candidateName(candidate:IndustryCandidate){
  return String(candidate.display_name||candidate.name||'Industrial site')
}

function identityLabel(candidate:IndustryCandidate){
  const status=String(candidate.identity_status||candidate.metadata?.identity_status||'')
  if(status==='OFFICIAL_KIADB_ALLOTTEE'||candidate.source==='KIADB'&&metaValue(candidate,'allottee'))return 'OFFICIAL KIADB ALLOTTEE'
  if(status==='NAMED_OSM_INDUSTRY'||metaValue(candidate,'identity_confidence')==='NAMED_MAP_FEATURE')return 'OSM INDUSTRY NAME'
  if(status==='NEARBY_GOOGLE_PLACES_MATCH')return 'NEARBY BUSINESS MATCH'
  return 'IDENTITY UNVERIFIED'
}

function metaValue(candidate:IndustryCandidate,key:string){
  const value=candidate.metadata?.[key]
  return value===undefined||value===null||value===''?'':String(value)
}

function fmtDistance(value:number|null|undefined){
  return value===null||value===undefined||!Number.isFinite(value)?'—':`${Math.round(value).toLocaleString()} m`
}

function fmtClock(value:number){
  const safe=Math.max(0,Math.floor(Number.isFinite(value)?value:0))
  const minutes=Math.floor(safe/60)
  const seconds=safe%60
  return `${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`
}

function relevanceClass(value:string|undefined){
  if(value==='HIGH')return 'bg-orange-100 text-orange-900 border-orange-200'
  if(value==='MEDIUM')return 'bg-cyan-100 text-cyan-900 border-cyan-200'
  return 'bg-slate-100 text-slate-700 border-slate-200'
}

export function IndustryIntelligencePanel({
  result,loading,error,radiusM,onRadiusChange,riverRadiusM,onRiverRadiusChange,currentRiverDistanceM,
  onRefresh,onFocus,onSeek,liveCandidates,currentTime=0,currentVideoName=''
}:Props){
  const [query,setQuery]=useState('')
  const [source,setSource]=useState<'ALL'|'KIADB'|'OPENSTREETMAP'>('ALL')
  const [distanceBand,setDistanceBand]=useState<number>(radiusM)

  useEffect(()=>{
    if(distanceBand>radiusM)setDistanceBand(radiusM)
  },[distanceBand,radiusM])

  const riverAvailable=Boolean(result?.river_context?.available)
  const candidates=useMemo(()=>{
    const q=query.trim().toLowerCase()
    return liveCandidates.filter(candidate=>{
      if(source!=='ALL'&&candidate.source!==source)return false
      if((candidate.current_distance_m??Number.POSITIVE_INFINITY)>distanceBand)return false
      if(riverAvailable&&(candidate.river_distance_m===null||candidate.river_distance_m>riverRadiusM))return false
      if(!q)return true
      const hay=[candidateName(candidate),candidate.category,candidate.address,metaValue(candidate,'industrial_area'),metaValue(candidate,'kiadb_plot_no'),metaValue(candidate,'allottee'),metaValue(candidate,'nature_of_industry'),candidate.nearest_river_name].join(' ').toLowerCase()
      return hay.includes(q)
    })
  },[liveCandidates,query,source,distanceBand,riverAvailable,riverRadiusM])

  const primary=liveCandidates[0]??null
  const highNow=liveCandidates.filter(candidate=>candidate.current_relevance==='HIGH').length
  const kiadbNow=liveCandidates.filter(candidate=>candidate.source==='KIADB').length
  const kiadb=result?.sources?.kiadb
  const osm=result?.sources?.openstreetmap
  const river=result?.sources?.river
  const routeBeforeRiver=result?.counts?.route_candidates_before_river_filter??result?.counts?.total??0
  const riverRoute=result?.counts?.total??0

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
    <div className="border-b border-slate-200 bg-gradient-to-r from-slate-950 via-navy-950 to-cyan-950 px-5 py-4 text-white">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.2em] text-cyan-200"><Factory size={14}/>River-side Industry Name Resolution</div>
          <h3 className="mt-1 text-xl font-black">Which industry is relevant to the drone right now?</h3>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-cyan-50/85">The video clock moves the SRT GPS point. Identity priority is: official KIADB allottee, named OpenStreetMap industry/company, then an optional nearby Google Places manufacturer/supplier/company match. Nearby business matches are clearly labelled and are not ownership proof.</p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-black text-navy-950 disabled:opacity-50"><RefreshCw size={14} className={loading?'animate-spin':''}/>{loading?'Refreshing...':'Refresh GIS data'}</button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:max-w-2xl">
        <label className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-bold text-cyan-50">Drone radius
          <select value={radiusM} onChange={e=>{const value=Number(e.target.value);onRadiusChange(value);setDistanceBand(value)}} className="ml-2 rounded-lg border border-white/20 bg-slate-900 px-2 py-1 text-white outline-none">
            {[100,150,250,500].map(value=><option key={value} value={value}>{value} m</option>)}
          </select>
        </label>
        <label className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[10px] font-bold text-cyan-50">River distance
          <select value={riverRadiusM} onChange={e=>onRiverRadiusChange(Number(e.target.value))} className="ml-2 rounded-lg border border-white/20 bg-slate-900 px-2 py-1 text-white outline-none">
            {[100,150,250,500].map(value=><option key={value} value={value}>{value} m</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="grid gap-3 border-b border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 xl:grid-cols-6">
      {[
        ['Route candidates',routeBeforeRiver],['River-side route',riverRoute],['Nearby now',liveCandidates.length],['High relevance now',highNow],['KIADB now',kiadbNow],['Drone → river',riverAvailable?fmtDistance(currentRiverDistanceM):'—']
      ].map(([label,value])=><div key={String(label)} className="rounded-xl border border-slate-200 bg-white px-3 py-3"><div className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</div><div className="mt-1 text-2xl font-black text-slate-900">{typeof value==='number'?value.toLocaleString():value}</div></div>)}
    </div>

    <div className="grid gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div className={`rounded-2xl border p-4 ${primary?(primary.current_relevance==='HIGH'?'border-orange-300 bg-orange-50':'border-cyan-300 bg-cyan-50'):'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-black uppercase tracking-[.18em] text-slate-500">Best candidate now</div>{primary&&<span className={`rounded-full border px-2 py-1 text-[9px] font-black ${relevanceClass(primary.current_relevance)}`}>{primary.current_relevance||'NEARBY'}</span>}</div>
          {primary?<>
            <div className="mt-2 text-lg font-black text-slate-950">{candidateName(primary)}</div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] font-black"><span className={`rounded-full px-2 py-1 ${primary.source==='KIADB'?'bg-emerald-100 text-emerald-900':'bg-blue-100 text-blue-900'}`}>{sourceLabel(primary.source)}</span><span className={`rounded-full px-2 py-1 ${identityLabel(primary)==='OFFICIAL KIADB ALLOTTEE'?'bg-emerald-600 text-white':identityLabel(primary)==='OSM INDUSTRY NAME'?'bg-sky-600 text-white':identityLabel(primary)==='NEARBY BUSINESS MATCH'?'bg-amber-500 text-slate-950':'bg-violet-100 text-violet-900'}`}>{identityLabel(primary)}</span>{(primary.kiadb_plot_no||metaValue(primary,'kiadb_plot_no'))&&<span className="rounded-full bg-white px-2 py-1 text-slate-700">Plot {primary.kiadb_plot_no||metaValue(primary,'kiadb_plot_no')}</span>}</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]"><div className="rounded-xl border border-white bg-white/80 p-2.5"><div className="text-[9px] font-black uppercase text-slate-400">Drone now</div><div className="mt-1 font-black text-slate-900">{fmtDistance(primary.current_distance_m)}</div></div><div className="rounded-xl border border-white bg-white/80 p-2.5"><div className="text-[9px] font-black uppercase text-slate-400">River</div><div className="mt-1 font-black text-slate-900">{fmtDistance(primary.river_distance_m)}</div></div></div>
            <div className="mt-2 text-[11px] leading-5 text-slate-700">{(primary.industrial_area||metaValue(primary,'industrial_area'))&&<><strong>Industrial area:</strong> {primary.industrial_area||metaValue(primary,'industrial_area')}<br/></>}{(primary.nature_of_industry||metaValue(primary,'nature_of_industry'))&&<><strong>Nature / sector:</strong> {primary.nature_of_industry||metaValue(primary,'nature_of_industry')}<br/></>}<strong>Nearest river:</strong> {primary.nearest_river_name||'—'}<br/><strong>Video:</strong> {primary.nearest_video_time}</div>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>onFocus(primary)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[10px] font-black text-white"><LocateFixed size={13}/>Locate</button><button type="button" onClick={()=>onSeek(primary)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black text-white"><Play size={13}/>Video evidence</button></div>
          </>:<div className="py-7 text-center"><MapPinned className="mx-auto text-slate-300" size={28}/><div className="mt-2 text-sm font-black text-slate-700">No river-side industry at this frame</div><div className="mt-1 text-[11px] leading-5 text-slate-500">Keep playing the video. This card updates as the SRT point moves.</div></div>}
        </div>

        {!riverAvailable&&result&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950"><div className="flex items-center gap-2 font-black"><AlertTriangle size={14}/>River layer unavailable</div><p className="mt-1">Showing live GPS proximity only. River distance is not calculated, so river-side relevance cannot yet be confirmed.</p></div>}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">GIS source status</div>
          <div className="mt-2 space-y-2 text-[11px]">
            <div className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex items-center justify-between gap-2"><span className="font-black text-slate-900">KIADB industries</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${kiadb?.configured?'bg-emerald-100 text-emerald-800':'bg-amber-100 text-amber-900'}`}>{kiadb?.configured?'CONFIGURED':'CONNECTOR READY'}</span></div><div className="mt-1 leading-4 text-slate-500">{kiadb?.message||'Waiting for KIADB service configuration.'}</div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 font-black text-slate-900"><Waves size={13}/>River / stream GIS</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${riverAvailable?'bg-cyan-100 text-cyan-900':'bg-amber-100 text-amber-900'}`}>{riverAvailable?sourceLabel(result?.river_context?.source||''):'NOT AVAILABLE'}</span></div><div className="mt-1 leading-4 text-slate-500">{river?.message||result?.river_context?.message||'KIADB river connector first; OSM waterway fallback second.'}</div></div>
            <div className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="flex items-center justify-between gap-2"><span className="font-black text-slate-900">OSM fallback</span><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${osm?.ok===false?'bg-rose-100 text-rose-800':'bg-blue-100 text-blue-800'}`}>{osm?.attempted?'USED':'READY'}</span></div><div className="mt-1 leading-4 text-slate-500">{osm?.message||'Named industrial identities plus industrial map context; unnamed context is never presented as a confirmed company.'}</div></div>
          </div>
        </div>

        {currentVideoName&&<div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3"><div className="text-[10px] font-black uppercase tracking-wider text-cyan-700">Current synchronized video</div><div className="mt-1 truncate text-xs font-black text-slate-900">{currentVideoName}</div><div className="mt-1 text-[11px] text-slate-600">Frame time {fmtClock(currentTime)} · {liveCandidates.length} river-side candidate(s) now.</div></div>}

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-950"><div className="flex items-center gap-2 font-black"><AlertTriangle size={14}/>Scientific interpretation</div><p className="mt-1">Spatial proximity identifies a <strong>candidate for review</strong>. It does not prove that the industry discharged effluent. Confirm with visible outlet/discharge evidence, field inspection or laboratory results.</p></div>
      </div>

      <div className="min-w-0">
        <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center">
          <label className="flex flex-1 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3"><Search size={15} className="text-slate-400"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search industry, KIADB plot, sector or river" className="w-full border-0 bg-transparent py-2.5 text-xs outline-none"/></label>
          <select value={source} onChange={e=>setSource(e.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold"><option value="ALL">All sources</option><option value="KIADB">KIADB only</option><option value="OPENSTREETMAP">OpenStreetMap</option></select>
          <select value={distanceBand} onChange={e=>setDistanceBand(Number(e.target.value))} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-bold">{[100,150,250,500].filter(v=>v<=radiusM).map(v=><option key={v} value={v}>Drone ≤ {v} m</option>)}</select>
        </div>

        {error&&<div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{error}</div>}
        {!result&&!loading&&!error&&<div className="grid min-h-[300px] place-items-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><div><Building2 className="mx-auto text-slate-400" size={32}/><div className="mt-3 font-black text-slate-800">Start Video + SRT playback</div><p className="mt-1 max-w-md text-xs leading-5 text-slate-500">The current SRT point will move with the video. Industry and river GIS data are fetched automatically and the relevant site changes as the drone moves.</p></div></div>}
        {loading&&<div className="grid min-h-[300px] place-items-center rounded-xl border border-slate-200 bg-slate-50 p-6 text-center"><div><RefreshCw className="mx-auto animate-spin text-cyan-700" size={28}/><div className="mt-3 font-black text-slate-800">Loading industry + river GIS context...</div><p className="mt-1 text-xs text-slate-500">KIADB allottee/company fields are checked first. OSM name, operator or brand is used only when the industrial feature itself carries that identity. Unnamed industrial areas remain context-only.</p></div></div>}
        {result&&!loading&&<div className="max-h-[570px] overflow-auto rounded-xl border border-slate-200">
          <table className="w-full min-w-[980px] text-left text-[11px]"><thead className="sticky top-0 z-10 bg-slate-100 text-slate-500"><tr><th className="px-3 py-3">Industry / Site</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Drone now</th><th className="px-3 py-3">River</th><th className="px-3 py-3">Relevance</th><th className="px-3 py-3">Video time</th><th className="px-3 py-3">Actions</th></tr></thead>
            <tbody>{candidates.map(candidate=>{const url=sourceUrl(candidate);const plot=metaValue(candidate,'kiadb_plot_no');const area=metaValue(candidate,'industrial_area');const nature=metaValue(candidate,'nature_of_industry');const high=candidate.current_relevance==='HIGH';return <tr key={candidate.id} className={`border-t border-slate-100 align-top ${high?'bg-orange-50':candidate.current_relevance==='MEDIUM'?'bg-cyan-50/60':'bg-white'}`}><td className="px-3 py-3"><div className="font-black text-slate-900">{candidateName(candidate)}</div><div className="mt-0.5 text-slate-500">{nature||candidate.category||'Industrial feature'}{plot?` · Plot ${plot}`:''}{area?` · ${area}`:''}</div><div className={`mt-1 text-[9px] font-black ${identityLabel(candidate)==='OFFICIAL KIADB ALLOTTEE'?'text-emerald-700':identityLabel(candidate)==='OSM INDUSTRY NAME'?'text-sky-700':identityLabel(candidate)==='NEARBY BUSINESS MATCH'?'text-amber-700':'text-violet-700'}`}>{identityLabel(candidate)}</div>{candidate.address&&<div className="mt-1 max-w-[320px] text-[10px] leading-4 text-slate-400">{candidate.address}</div>}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${candidate.source==='KIADB'?'bg-emerald-100 text-emerald-900':'bg-blue-100 text-blue-900'}`}>{sourceLabel(candidate.source)}</span></td><td className="px-3 py-3"><div className="font-black text-slate-900">{fmtDistance(candidate.current_distance_m)}</div></td><td className="px-3 py-3"><div className="font-black text-slate-900">{fmtDistance(candidate.river_distance_m)}</div><div className="mt-1 max-w-[170px] text-[10px] leading-4 text-slate-400">{candidate.nearest_river_name||'River data unavailable'}</div></td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] font-black ${relevanceClass(candidate.current_relevance)}`}>{candidate.current_relevance||'REVIEW'}</span></td><td className="px-3 py-3"><div className="font-mono font-black text-slate-900">{candidate.nearest_video_time}</div></td><td className="px-3 py-3"><div className="flex flex-wrap gap-1.5"><button type="button" onClick={()=>onFocus(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5 font-black text-slate-700"><LocateFixed size={12}/>Locate</button><button type="button" onClick={()=>onSeek(candidate)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1.5 font-black text-emerald-800"><Play size={12}/>Video evidence</button>{url&&<a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1.5 font-black text-blue-800"><ExternalLink size={12}/>Source</a>}</div></td></tr>})}{!candidates.length&&<tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No industry satisfies the current drone + river filters at this video frame.</td></tr>}</tbody>
          </table>
        </div>}
      </div>
    </div>

    <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[10px] leading-4 text-slate-500 md:flex-row md:items-center md:justify-between"><span>{result?.disclaimer||'Spatial proximity alone does not confirm an effluent source.'}</span><span className="inline-flex items-center gap-1.5 font-black text-slate-600"><ShieldCheck size={13}/>Verification stays Pending until evidence is reviewed.</span></div>
  </section>
}
