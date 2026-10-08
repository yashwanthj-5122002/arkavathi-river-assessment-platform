import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, PersonStanding } from 'lucide-react'
import { api } from '../lib/api'
import type { AuthUser, DataAvailability, FlightDetail, FlightListItem, IndustryCandidate, IndustryDiscoveryResult, PermissionProfile, Summary, TrackPoint, Verification } from '../lib/types'
import { Sidebar } from './Sidebar'
import type { DashboardPage } from './Sidebar'
import { SurveyMap } from './SurveyMap'
import { FlightDetails } from './FlightDetails'
import { FlightExplorer } from './FlightExplorer'
import { DayCharts } from './DayCharts'
import { AltitudeProfile } from './AltitudeProfile'
import { DataReadiness } from './DataReadiness'
import { VerificationPanel } from './VerificationPanel'
import { PointInspector } from './PointInspector'
import { AuthenticatedHeader } from './AuthenticatedHeader'
import { AccessManagement } from './AccessManagement'
import { CivilReviewQueue } from './CivilReviewQueue'
import { ApprovedCivilRecords } from './ApprovedCivilRecords'
import { DepartmentDataHub } from './DepartmentDataHub'
import { TaskWorkspace } from './TaskWorkspace'
import { ReviewCentreV18 } from './ReviewCentreV18'
import { ApprovalDashboard } from './ApprovalDashboard'
import { NotificationsCentre } from './NotificationsCentre'
import { AuditHistory } from './AuditHistory'
import { CnnlApprovedData } from './CnnlApprovedData'
import { ArkavathiVideoShowcase } from './ArkavathiVideoShowcase'
import { StudyAreaMapPreview } from './StudyAreaMapPreview'
import { RiverOverviewFacts } from './RiverOverviewFacts'
import { IntroductionSection } from './IntroductionSection'
import { EventHandler } from './EventHandler'
import { ProjectEventsShowcase } from './ProjectEventsShowcase'
import { ScientificModules } from './ScientificModules'
import { IndustryIntelligence } from './IndustryIntelligence'
import { StreetViewPanel } from './StreetViewPanel'
import type { VideoMapSyncState, VideoSeekRequest } from './StreetViewPanel'
import { IndustryIntelligencePanel } from './IndustryIntelligencePanel'
import { SrtFlightAnalyticsDashboard } from './SrtFlightAnalyticsDashboard'

const validPages:DashboardPage[]=['overview','gis-map','street-view','industry-intelligence','event-handler','flight-explorer','analytics','data-readiness','civil-modules','scientific-modules','verification','department-data','civil-review','task-management','review-centre','approval-dashboard','notifications','audit-history','cnnl-approved','access-control']
function initialPage():DashboardPage{const raw=window.location.hash.replace(/^#\/?/,'') as DashboardPage;return validPages.includes(raw)?raw:'overview'}
const pageMeta:Record<DashboardPage,{title:string;subtitle:string}>={
  overview:{title:'Project Overview',subtitle:'Verified Arkavati project evidence and workflow control summary.'},
  'gis-map':{title:'GIS Map',subtitle:'Interactive Day 3Ã¢â‚¬â€œDay 8 flight tracks, endpoints and clickable telemetry points.'},
  'street-view':{title:'Street View',subtitle:'Google 360 and KartaView remain separate; Video + SRT drives a synchronized GPS marker on the satellite map.'},
  'industry-intelligence':{title:'Industry Intelligence',subtitle:'V28 field observations plus V29.6.3 moving-Video/SRT river-corridor industry intelligence with KIADB allottee/company-name resolution and OSM identity fallback.'},
  'event-handler':{title:'Event Handler',subtitle:'Manage upcoming project events and completed-event highlights for the portal.'},
  'flight-explorer':{title:'Flight Explorer',subtitle:'Inspect individual survey flights and source-video traceability.'},
  analytics:{title:'Coverage Analytics',subtitle:'Survey-day and altitude analytics for the verified drone evidence.'},
  'data-readiness':{title:'Data Readiness',subtitle:'Availability and readiness status of supplied project datasets.'},
  'civil-modules':{title:'Civil Modules',subtitle:'Institution field-data workflow and approved Civil records.'},
  'scientific-modules':{title:'Scientific Modules',subtitle:'Micro-catchments, drainage, industries, sampling, water quality, hydrology, pollution hotspots and data compliance.'},
  verification:{title:'Verification',subtitle:'Verification checks for the current project evidence package.'},
  'department-data':{title:'Data Repository',subtitle:'Civil, GIS, Survey, LiDAR and Photogrammetry department data hub.'},
  'civil-review':{title:'Legacy Civil Review',subtitle:'Existing institution Civil review interface retained for compatibility.'},
  'task-management':{title:'Task Management',subtitle:'Assign, execute, review and close Arkavati project tasks.'},
  'review-centre':{title:'Review Centre',subtitle:'Nakshatech technical review for institution and department submissions.'},
  'approval-dashboard':{title:'Approval Dashboard',subtitle:'Nakshatech final approval and integration control.'},
  notifications:{title:'Notifications',subtitle:'Task, review, correction and approval alerts for this account.'},
  'audit-history':{title:'Audit History',subtitle:'Traceable history of controlled task and approval actions.'},
  'cnnl-approved':{title:'Approved Data',subtitle:'Final-approved and integrated outputs available to CNNL.'},
  'access-control':{title:'Access Control',subtitle:'Company administration for project users and permissions.'}
}


function distanceMeters(lat1:number,lng1:number,lat2:number,lng2:number){
  const R=6371000;const p1=lat1*Math.PI/180,p2=lat2*Math.PI/180;const dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180
  const a=Math.sin(dLat/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dLng/2)**2
  return 2*R*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)))
}

function distancePointToSegmentMeters(lat:number,lng:number,aLng:number,aLat:number,bLng:number,bLat:number){
  const latScale=111320;const lngScale=Math.max(1,111320*Math.cos(lat*Math.PI/180))
  const ax=(aLng-lng)*lngScale,ay=(aLat-lat)*latScale,bx=(bLng-lng)*lngScale,by=(bLat-lat)*latScale
  const dx=bx-ax,dy=by-ay,denom=dx*dx+dy*dy
  const t=denom<=1e-12?0:Math.max(0,Math.min(1,-(ax*dx+ay*dy)/denom))
  return Math.hypot(ax+t*dx,ay+t*dy)
}

function distanceToRiverGeoJson(lat:number,lng:number,geojson:any):number|null{
  let best=Number.POSITIVE_INFINITY
  const features=Array.isArray(geojson?.features)?geojson.features:[]
  for(const feature of features){
    const geometry=feature?.geometry;if(!geometry)continue
    const lines:any[]=[]
    if(geometry.type==='LineString')lines.push(geometry.coordinates)
    else if(geometry.type==='MultiLineString'&&Array.isArray(geometry.coordinates))lines.push(...geometry.coordinates)
    for(const line of lines){
      if(!Array.isArray(line))continue
      for(let i=0;i<line.length-1;i++){
        const a=line[i],b=line[i+1]
        if(!Array.isArray(a)||!Array.isArray(b)||a.length<2||b.length<2)continue
        const d=distancePointToSegmentMeters(lat,lng,Number(a[0]),Number(a[1]),Number(b[0]),Number(b[1]))
        if(Number.isFinite(d)&&d<best)best=d
      }
    }
  }
  return Number.isFinite(best)?best:null
}

function routeOnVideoClock(route:VideoMapSyncState['route'],videoDuration:number):VideoMapSyncState['route']{
  if(route.length<2||!Number.isFinite(videoDuration)||videoDuration<=0)return route
  const start=Number(route[0].time),end=Number(route[route.length-1].time)
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return route
  const span=end-start
  return route.map(sample=>({...sample,time:Math.max(0,Math.min(videoDuration,((Number(sample.time)-start)/span)*videoDuration))}))
}

export function ProjectDashboard({user,onLogout}:{user:AuthUser;onLogout:()=>void}){
  const [summary,setSummary]=useState<Summary|null>(null);const [flights,setFlights]=useState<FlightListItem[]>([]);const [tracks,setTracks]=useState<any>(null);const [endpoints,setEndpoints]=useState<any>(null);const [trackPoints,setTrackPoints]=useState<any>(null);const [availability,setAvailability]=useState<DataAvailability|null>(null);const [verification,setVerification]=useState<Verification|null>(null);const [permissions,setPermissions]=useState<PermissionProfile|null>(null)
  const [selectedDays,setSelectedDays]=useState<number[]>([3,4,5,6,7,8]);const [selectedFlight,setSelectedFlight]=useState<FlightDetail|null>(null);const [selectedPoint,setSelectedPoint]=useState<TrackPoint|null>(null);const [streetViewLocation,setStreetViewLocation]=useState({lat:13.1672,lng:77.4388});const [streetViewSelectionReady,setStreetViewSelectionReady]=useState(false);const [activePage,setActivePage]=useState<DashboardPage>(initialPage);const [error,setError]=useState('');const [videoMapSync,setVideoMapSync]=useState<VideoMapSyncState>({active:false,route:[],location:null,heading:null,currentTime:0,duration:0,playing:false,videoName:'',srtName:''});const [streetWorkspaceFullscreen,setStreetWorkspaceFullscreen]=useState(false)
  const [industryDiscovery,setIndustryDiscovery]=useState<IndustryDiscoveryResult|null>(null)
  const [industryLoading,setIndustryLoading]=useState(false)
  const [industryError,setIndustryError]=useState('')
  const [industryRadiusM,setIndustryRadiusM]=useState(250)
  const [industryRiverRadiusM,setIndustryRiverRadiusM]=useState(250)
  const [industryFocus,setIndustryFocus]=useState<{id:string;lat:number;lng:number;nonce:number}|null>(null)
  const [videoSeekRequest,setVideoSeekRequest]=useState<VideoSeekRequest|null>(null)
  const industryRunKeyRef=useRef('')
  const riverContextAvailable=Boolean(industryDiscovery?.river_context?.available)
  const routeIndustryCandidates=useMemo<IndustryCandidate[]>(()=>{
    const location=videoMapSync.location
    if(!videoMapSync.active||!location||!industryDiscovery)return []
    return industryDiscovery.candidates
      .map(candidate=>{
        const currentDistance=distanceMeters(location.lat,location.lng,candidate.lat,candidate.lng)
        const riverDistance=candidate.river_distance_m
        const riverOk=!riverContextAvailable||(riverDistance!==null&&Number.isFinite(riverDistance)&&riverDistance<=industryRiverRadiusM)
        const relevance=riverContextAvailable
          ?(currentDistance<=100&&(riverDistance??Number.POSITIVE_INFINITY)<=100?'HIGH':currentDistance<=industryRadiusM&&riverOk?'MEDIUM':'REVIEW')
          :(currentDistance<=100?'HIGH':'REVIEW')
        return {...candidate,current_distance_m:currentDistance,current_relevance:relevance}
      })
      .sort((a,b)=>{
        const rank=(value:string|undefined)=>value==='HIGH'?0:value==='MEDIUM'?1:2
        return rank(a.current_relevance)-rank(b.current_relevance)||
          (a.source==='KIADB'?0:1)-(b.source==='KIADB'?0:1)||
          (a.current_distance_m??1e12)-(b.current_distance_m??1e12)||
          (a.river_distance_m??1e12)-(b.river_distance_m??1e12)
      })
  },[videoMapSync.active,videoMapSync.location?.lat,videoMapSync.location?.lng,industryDiscovery,industryRadiusM,industryRiverRadiusM,riverContextAvailable])

  const liveIndustryCandidates=useMemo<IndustryCandidate[]>(()=>{
    return routeIndustryCandidates
      .filter(candidate=>(candidate.current_distance_m??Number.POSITIVE_INFINITY)<=industryRadiusM)
      .filter(candidate=>!riverContextAvailable||(candidate.river_distance_m!==null&&candidate.river_distance_m<=industryRiverRadiusM))
  },[routeIndustryCandidates,industryRadiusM,industryRiverRadiusM,riverContextAvailable])

  const currentRiverDistanceM=useMemo(()=>{
    const location=videoMapSync.location
    if(!location||!industryDiscovery?.river_context?.available)return null
    return distanceToRiverGeoJson(location.lat,location.lng,industryDiscovery.river_context.geojson)
  },[videoMapSync.location?.lat,videoMapSync.location?.lng,industryDiscovery?.river_context])
  const primaryIndustryCandidate=liveIndustryCandidates[0]??null
  useEffect(()=>{Promise.all([api.summary(),api.flights(),api.availability(),api.verification(),api.permissionsMe()]).then(([s,f,a,v,p])=>{setSummary(s);setFlights(f);setAvailability(a);setVerification(v);setPermissions(p);if(f.length)api.flight(f[0].id).then(setSelectedFlight)}).catch(e=>setError(e instanceof Error?e.message:String(e)))},[])
  useEffect(()=>{api.latestIndustryDiscovery().then(result=>{if(result?.run_id)setIndustryDiscovery(result)}).catch(()=>{})},[])
  useEffect(()=>{if(!videoMapSync.active||!industryDiscovery)return;const differentVideo=Boolean(videoMapSync.videoName&&industryDiscovery.video_name&&videoMapSync.videoName!==industryDiscovery.video_name);const differentSrt=Boolean(videoMapSync.srtName&&industryDiscovery.srt_name&&videoMapSync.srtName!==industryDiscovery.srt_name);if(differentVideo||differentSrt){setIndustryDiscovery(null);industryRunKeyRef.current=''}},[videoMapSync.active,videoMapSync.videoName,videoMapSync.srtName,industryDiscovery])
  useEffect(()=>{if(!summary)return;if(selectedDays.length===0){const empty={type:'FeatureCollection',features:[]};setTracks(empty);setEndpoints(empty);setTrackPoints(empty);return}Promise.all([api.tracks(selectedDays),api.endpoints(selectedDays),api.points(selectedDays)]).then(([t,e,p])=>{setTracks(t);setEndpoints(e);setTrackPoints(p)}).catch(e=>setError(e instanceof Error?e.message:String(e)))},[selectedDays,summary])
  useEffect(()=>{const onHash=()=>setActivePage(initialPage());window.addEventListener('hashchange',onHash);return()=>window.removeEventListener('hashchange',onHash)},[])
  useEffect(()=>{if(!streetWorkspaceFullscreen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setStreetWorkspaceFullscreen(false)};window.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}},[streetWorkspaceFullscreen])
  useEffect(()=>{if(activePage!=='street-view'&&streetWorkspaceFullscreen)setStreetWorkspaceFullscreen(false)},[activePage,streetWorkspaceFullscreen])
  function navigate(page:DashboardPage){if(page!=='street-view'){setStreetWorkspaceFullscreen(false);setStreetViewSelectionReady(false);setVideoMapSync(v=>({...v,active:false,playing:false}))}setActivePage(page);window.history.replaceState(null,'',`#/${page}`);window.scrollTo({top:0,left:0,behavior:'auto'})}
  const has=(p:string)=>permissions?.permissions.includes(p)??false
  const selectFlight=(id:string)=>{setSelectedPoint(null);api.flight(id).then(f=>{setSelectedFlight(f);setSelectedDays(ds=>ds.includes(f.day)?ds:[...ds,f.day].sort())}).catch(e=>setError(e instanceof Error?e.message:String(e)))}
  const selectPoint=(point:TrackPoint)=>{setSelectedPoint(point);api.flight(point.flight_id).then(f=>{setSelectedFlight(f);setSelectedDays(ds=>ds.includes(f.day)?ds:[...ds,f.day].sort())}).catch(e=>setError(e instanceof Error?e.message:String(e)))}
  const selectStreetViewLocation=(location:{lat:number;lng:number})=>{setStreetViewLocation(location);setStreetViewSelectionReady(true)}
  const setStreetWorkspaceMode=(value:boolean)=>{setStreetWorkspaceFullscreen(value);if(value)window.scrollTo({top:0,left:0,behavior:'auto'})}
  const exitStreetView=()=>{setStreetWorkspaceFullscreen(false);setStreetViewSelectionReady(false);setVideoMapSync(v=>({...v,active:false,playing:false}));navigate('gis-map')}
  const toggleDay=(d:number)=>setSelectedDays(ds=>ds.includes(d)?ds.filter(x=>x!==d):[...ds,d].sort())
  async function discoverCurrentIndustries(force=false){
    if(!videoMapSync.active||videoMapSync.route.length<2){setIndustryError('Upload a matching Video + SRT pair and start Video + SRT playback first.');return}
    const first=videoMapSync.route[0],last=videoMapSync.route[videoMapSync.route.length-1]
    const runKey=[videoMapSync.videoName,videoMapSync.srtName,videoMapSync.route.length,first.lat.toFixed(6),first.lng.toFixed(6),last.lat.toFixed(6),last.lng.toFixed(6),videoMapSync.duration.toFixed(3),industryRadiusM,industryRiverRadiusM].join('|')
    if(!force&&industryRunKeyRef.current===runKey)return
    industryRunKeyRef.current=runKey;setIndustryLoading(true);setIndustryError('')
    const maxSamples=6000;const step=Math.max(1,Math.ceil(videoMapSync.route.length/maxSamples));const rawRoute=videoMapSync.route.filter((_,index)=>index%step===0||index===videoMapSync.route.length-1);const route=routeOnVideoClock(rawRoute,videoMapSync.duration)
    try{const result=await api.discoverIndustries({route,video_name:videoMapSync.videoName,srt_name:videoMapSync.srtName,radius_m:industryRadiusM,river_radius_m:industryRiverRadiusM,include_osm:true});setIndustryDiscovery(result)}catch(e){industryRunKeyRef.current='';setIndustryError(e instanceof Error?e.message:String(e))}finally{setIndustryLoading(false)}
  }
  useEffect(()=>{if(videoMapSync.active&&videoMapSync.playing&&videoMapSync.route.length>=2)void discoverCurrentIndustries(false)},[videoMapSync.playing,videoMapSync.active,videoMapSync.videoName,videoMapSync.srtName,videoMapSync.route,videoMapSync.duration,industryRadiusM,industryRiverRadiusM])
  const focusIndustry=(candidate:IndustryCandidate)=>setIndustryFocus({id:candidate.id,lat:candidate.lat,lng:candidate.lng,nonce:Date.now()})
  const seekIndustryVideo=(candidate:IndustryCandidate)=>{setVideoSeekRequest({id:Date.now(),time:candidate.nearest_video_time_s,videoName:industryDiscovery?.video_name||videoMapSync.videoName})}
  if(error)return <div className="min-h-screen bg-slate-100"><AuthenticatedHeader user={user} onLogout={onLogout} onNotifications={has('NOTIFICATION.VIEW') ? ()=>navigate('notifications') : undefined} subtitle="Project monitoring portal" projectBranding/><div className="mx-auto mt-16 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 p-6 shadow-card"><h1 className="text-xl font-bold text-rose-900">Dashboard could not load project data</h1><p className="mt-2 break-words text-sm text-rose-800">{error}</p><button onClick={()=>window.location.reload()} className="mt-4 rounded-lg bg-navy-900 px-4 py-2 text-sm font-bold text-white">Retry dashboard</button></div></div>
  if(!summary||!tracks||!endpoints||!trackPoints||!availability||!verification||!permissions)return <div className="grid min-h-screen place-items-center bg-slate-100 text-sm font-semibold text-slate-500">Loading authorized Arkavati project evidence and permissionsÃ¢â‚¬Â¦</div>
  const meta=pageMeta[activePage]
  const workspaceFull=activePage==='street-view'&&streetWorkspaceFullscreen
  return <div className={`flex bg-slate-100 ${workspaceFull?'h-screen overflow-hidden':'min-h-screen'}`}><Sidebar user={user} permissions={permissions} activePage={activePage} onNavigate={navigate}/><main className={`min-w-0 flex-1 ${workspaceFull?'flex h-screen min-h-0 flex-col overflow-hidden':''}`}><div className={workspaceFull?'shrink-0':''}><AuthenticatedHeader user={user} onLogout={onLogout} onNotifications={has('NOTIFICATION.VIEW') ? ()=>navigate('notifications') : undefined} subtitle={user.organization_type==='CNNL'?'Official monitoring Ã‚Â· approved outputs & verified survey evidence':'Project administration Ã‚Â· workflow, survey & GIS control'} projectBranding/></div><div className={workspaceFull?'min-h-0 flex-1 overflow-hidden p-2':'mx-auto w-full max-w-[1700px] p-4 md:p-6'}><div className={`${workspaceFull?'hidden':'block'} mb-5 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm`}><div className="text-sm font-black uppercase tracking-[0.10em] text-black md:text-base">Arkavati River Population Assessment Project</div><h1 className="mt-1 text-2xl font-black text-navy-900">{meta.title}</h1><p className="mt-1 text-sm text-slate-500">{meta.subtitle}</p></div>
  {activePage==='overview'&&<div className="space-y-5"><div className="grid gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(300px,3fr)]"><ArkavathiVideoShowcase/><StudyAreaMapPreview/></div><section className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs leading-5 text-navy-900"><strong>{user.organization_type==='CNNL'?'CNNL monitoring access':'Nakshatech controlled access'}:</strong> V1.8 permissions are enforced by the backend. Task review, technical approval, final approval and integration are separate auditable actions.</section><RiverOverviewFacts/><IntroductionSection/><ProjectEventsShowcase/><section className="rounded-2xl bg-navy-950 p-5 text-white"><h3 className="font-black">Current authenticated build Ã‚Â· V1.9.3 / V29.4</h3><p className="mt-2 max-w-5xl text-sm leading-6 text-blue-100">Department uploads remain passkey-protected. Institution data stays isolated. Nakshatech controls technical review, final approval and central integration. CNNL receives only final-approved/integrated workflow outputs.</p></section></div>}
  {activePage==='industry-intelligence'&&<IndustryIntelligence user={user}/>}
  {activePage==='event-handler'&&<EventHandler user={user}/>}
  {activePage==='gis-map'&&<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card"><div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div><h2 className="text-xl font-black text-slate-900">Verified flight GIS map</h2><p className="text-sm text-slate-500">Click a flight line, Start/End marker, or any colored survey point for source telemetry details.</p></div><div className="flex flex-wrap gap-2">{[3,4,5,6,7,8].map(d=><button key={d} onClick={()=>toggleDay(d)} className={`rounded-full border px-3 py-2 text-xs font-bold ${selectedDays.includes(d)?'border-navy-800 bg-navy-900 text-white':'border-slate-300 bg-white text-slate-600'}`}>Day {d}</button>)}<button onClick={()=>setSelectedDays([3,4,5,6,7,8])} className="rounded-full border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">All</button><button onClick={()=>navigate('street-view')} className="inline-flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-black text-amber-900"><PersonStanding size={15}/>Street View</button></div></div><div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_350px]"><SurveyMap summary={summary} tracks={tracks} endpoints={endpoints} points={trackPoints} selectedFlight={selectedFlight} selectedPoint={selectedPoint} onSelectFlight={selectFlight} onSelectPoint={selectPoint}/><div className="space-y-4"><FlightDetails flight={selectedFlight}/><PointInspector point={selectedPoint}/></div></div></section>}
  {activePage==='street-view'&&<section className={workspaceFull?'h-full min-h-0 overflow-hidden':'space-y-4'}><div className={`${workspaceFull?'hidden':'flex'} flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs leading-5 text-sky-950 md:flex-row md:items-center md:justify-between`}><div><strong>Street View + Video/SRT:</strong> Google 360 and KartaView are separate street-imagery tools. In Video + SRT mode, video time is matched only to SRT GPS samples: the selected SRT route is drawn on the left satellite map and the current GPS marker moves with video playback. V29.6.3 keeps the Video 1 UI and the V29.6.1 Video 2 movement model unchanged, and now activates the captured K-GIS/KIADB ArcGIS plot layer plus official allottee lookup; OpenStreetMap remains the fallback when KIADB has no matching plot.</div><button type="button" onClick={exitStreetView} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-black text-navy-900 shadow-sm hover:bg-sky-100"><ArrowLeft size={15}/>Back to GIS Map</button></div><div className={`grid min-h-0 items-stretch ${workspaceFull?'h-full grid-cols-2 gap-2':'gap-4 2xl:grid-cols-2'}`}><div className={`min-w-0 ${workspaceFull?'h-full min-h-0':'self-start'}`}><SurveyMap summary={summary} tracks={tracks} endpoints={endpoints} points={trackPoints} selectedFlight={selectedFlight} selectedPoint={selectedPoint} onSelectFlight={selectFlight} onSelectPoint={selectPoint} streetViewMode={!videoMapSync.active} streetViewLocation={streetViewLocation} onStreetViewLocationChange={selectStreetViewLocation} videoSyncMode={videoMapSync.active} videoSyncTrack={videoMapSync.route} videoSyncLocation={videoMapSync.location} videoSyncHeading={videoMapSync.heading} videoSyncCurrentTime={videoMapSync.currentTime} videoSyncDuration={videoMapSync.duration} videoSyncPlaying={videoMapSync.playing} videoSyncLabel={[videoMapSync.videoName,videoMapSync.srtName].filter(Boolean).join(' Ã¢â€ â€ ')} industryCandidates={routeIndustryCandidates} industryRadiusM={industryRadiusM} industryRiverRadiusM={industryRiverRadiusM} industryRiverContext={industryDiscovery?.river_context??null} currentRiverDistanceM={currentRiverDistanceM} primaryIndustryId={primaryIndustryCandidate?.id??null} industryFocus={industryFocus} workspaceFullscreen={workspaceFull}/></div><div className={`min-w-0 ${workspaceFull?'h-full min-h-0':'self-start'}`}><StreetViewPanel location={streetViewLocation} onLocationChange={selectStreetViewLocation} active={streetViewSelectionReady} onExit={exitStreetView} onVideoMapSyncChange={setVideoMapSync} videoSeekRequest={videoSeekRequest} workspaceFullscreen={workspaceFull} onWorkspaceFullscreenChange={setStreetWorkspaceMode}/></div></div><div className={`${workspaceFull?'hidden':'grid'} gap-4 2xl:grid-cols-2`}><FlightDetails flight={selectedFlight}/><PointInspector point={selectedPoint}/></div>{!workspaceFull&&<IndustryIntelligencePanel result={industryDiscovery} loading={industryLoading} error={industryError} radiusM={industryRadiusM} onRadiusChange={setIndustryRadiusM} riverRadiusM={industryRiverRadiusM} onRiverRadiusChange={setIndustryRiverRadiusM} currentRiverDistanceM={currentRiverDistanceM} onRefresh={()=>void discoverCurrentIndustries(true)} onFocus={focusIndustry} onSeek={seekIndustryVideo} liveCandidates={liveIndustryCandidates} currentTime={videoMapSync.currentTime} currentVideoName={videoMapSync.videoName}/>}{!workspaceFull&&<SrtFlightAnalyticsDashboard active={videoMapSync.active} route={videoMapSync.route} location={videoMapSync.location} heading={videoMapSync.heading} currentTime={videoMapSync.currentTime} duration={videoMapSync.duration} playing={videoMapSync.playing} videoName={videoMapSync.videoName} srtName={videoMapSync.srtName} industries={industryDiscovery?.candidates??[]} liveIndustries={liveIndustryCandidates} radiusM={industryRadiusM} riverRadiusM={industryRiverRadiusM} onFocusIndustry={focusIndustry} onSeekIndustry={seekIndustryVideo}/>}</section>}
  {activePage==='flight-explorer'&&<FlightExplorer flights={flights} selectedId={selectedFlight?.id} onSelect={selectFlight}/>} {activePage==='analytics'&&<div className="space-y-4"><DayCharts days={summary.days}/><AltitudeProfile flight={selectedFlight}/></div>}{activePage==='data-readiness'&&<DataReadiness data={availability}/>} {activePage==='verification'&&<VerificationPanel data={verification}/>} {activePage==='department-data'&&user.organization_type==='COMPANY'&&user.role==='COMPANY_ADMIN'&&<DepartmentDataHub user={user}/>} {activePage==='civil-review'&&(user.role==='COMPANY_ADMIN'||user.role==='COMPANY_REVIEWER')&&<CivilReviewQueue/>}{activePage==='task-management'&&(has('TASK.VIEW_ALL')||has('TASK.VIEW_ASSIGNED'))&&<TaskWorkspace title={user.organization_type==='COMPANY'?'Task Management':'My Tasks'} subtitle={user.organization_type==='COMPANY'?'Create, assign, review and close project tasks across Nakshatech and participating institutions.':'Tasks assigned to your account or organization.'}/>} {activePage==='review-centre'&&has('WORKFLOW.REVIEW')&&<ReviewCentreV18/>} {activePage==='approval-dashboard'&&(has('WORKFLOW.FINAL_APPROVE')||has('WORKFLOW.INTEGRATE'))&&<ApprovalDashboard/>} {activePage==='notifications'&&has('NOTIFICATION.VIEW')&&<NotificationsCentre/>} {activePage==='audit-history'&&has('AUDIT.VIEW')&&<AuditHistory/>} {activePage==='cnnl-approved'&&has('CNNL.VIEW_APPROVED')&&<CnnlApprovedData/>} {activePage==='access-control'&&user.role==='COMPANY_ADMIN'&&<AccessManagement/>}
  {activePage==='scientific-modules'&&<ScientificModules user={user}/>}
  {activePage==='civil-modules'&&<div className="space-y-5"><section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="mb-4"><h2 className="text-xl font-black text-slate-900">Civil engineering modules and institution data workflow</h2><p className="text-sm text-slate-500">Institution field-data entry is active. Submitted datasets now move through the V1.8 technical/final approval workflow.</p></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{['River & Drain Survey','Hydraulic Structures','Drains & Outfalls','Water Sampling','Critical Locations','12 Institutions','Hydrology & Hydraulics','Remedial Measures / DPR'].map((m,i)=><div key={m} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="text-[10px] font-black uppercase tracking-wider text-amber-700">Module {String(i+1).padStart(2,'0')}</div><div className="mt-2 font-bold text-slate-800">{m}</div></div>)}</div></section>{(user.organization_type==='CNNL'||user.organization_type==='COMPANY')&&<ApprovedCivilRecords/>}</div>}
  </div></main></div>
}

