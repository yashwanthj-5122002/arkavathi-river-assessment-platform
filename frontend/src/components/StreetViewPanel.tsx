import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, SyntheticEvent } from 'react'
import {
  AlertCircle, ArrowLeft, Camera, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Factory,
  FileText, FileVideo, Loader2, MapPin, Maximize2, Minimize2, Navigation, Pause, PersonStanding,
  Play, RefreshCw, Save, Search, Square, Trash2, Upload, X, Globe2, Video, Images, LocateFixed} from 'lucide-react'
import { StreetPanorama360 } from './StreetPanorama360'
import { api } from '../lib/api'
import type { IndustryCategory, IndustryDischargeStatus } from '../lib/types'

type StreetLocation = { lat:number; lng:number }
type ProviderMode = 'google'|'video'|'kartaview'
type ActiveProvider = 'google'|'kartaview'|null

// Keep automatic Street View matching local to the point the user actually
// clicked. A distant provider hit is more confusing than an honest "no image".
const MAX_STREET_MATCH_DISTANCE_M = 300
const GOOGLE_RUNTIME_TIMEOUT_MS = 10000
const GOOGLE_PANORAMA_TIMEOUT_MS = 8000
const KARTAVIEW_LOOKUP_TIMEOUT_MS = 12000

function withTimeout<T>(promise:Promise<T>,timeoutMs:number,message:string):Promise<T>{
  return new Promise<T>((resolve,reject)=>{
    let settled=false
    const finishResolve=(value:T)=>{if(settled)return;settled=true;window.clearTimeout(timer);resolve(value)}
    const finishReject=(error:unknown)=>{if(settled)return;settled=true;window.clearTimeout(timer);reject(error)}
    const timer=window.setTimeout(()=>finishReject(new Error(message)),timeoutMs)
    promise.then(finishResolve,finishReject)
  })
}

type GoogleMatch = {
  lat:number
  lng:number
  distanceM:number
  radiusM:number
  description:string
  imageDate:string
  panoId:string
}

type KartaPhoto = {
  id:string
  lat:number
  lng:number
  distanceM:number
  urls:string[]
  heading:number|null
  shotDate:string
  projection:string
  fieldOfView:number|null
  sequenceId:string
  sequenceIndex:number|null
}

type SrtSample = {
  time:number
  lat:number
  lng:number
}

type VideoUpload = {
  id:string
  file:File
  url:string
}

type SrtUpload = {
  id:string
  file:File
  samples:SrtSample[]
  error:string
}

type ServerMediaPair = {
  id:string
  folder:string
  srt_name:string
  video_name:string
  paired:boolean
  srt_size_bytes:number
  video_size_bytes:number
}

type VideoSyncPoint = {
  location:StreetLocation
  heading:number|null
  sampleIndex:number
}

export type VideoMapSyncState = {
  active:boolean
  route:SrtSample[]
  location:StreetLocation|null
  heading:number|null
  currentTime:number
  duration:number
  playing:boolean
  videoName:string
  srtName:string
}

export type VideoSeekRequest = {
  id:number
  time:number
  videoName?:string
}

export type PanoramaView = {
  position:StreetLocation
  heading:number|null
  povHeading:number|null
  pitch:number|null
  zoom:number|null
  provider:ActiveProvider|null
  panoId:string|null
  googleMatch:GoogleMatch|null
  kartaPhoto:KartaPhoto|null
  status:'idle'|'loading'|'ready'|'missing'|'error'
}

type Props = {
  location:StreetLocation
  onLocationChange:(location:StreetLocation)=>void
  active?:boolean
  onExit?:()=>void
  onVideoMapSyncChange?:(state:VideoMapSyncState)=>void
  videoSeekRequest?:VideoSeekRequest|null
  workspaceFullscreen?:boolean
  onWorkspaceFullscreenChange?:(value:boolean)=>void
  providers?:ProviderMode[]
  defaultProvider?:ProviderMode
  onPanoramaChange?:(view:PanoramaView|null)=>void
}

declare global {
  interface Window {
    google?:any
    gm_authFailure?:()=>void
    [key:string]:any
  }
}

let googleMapsPromise:Promise<any>|null=null
let googleAuthFailureError:Error|null=null

function loadGoogleMaps(apiKey:string):Promise<any>{
  if(googleAuthFailureError)return Promise.reject(googleAuthFailureError)
  if(window.google?.maps?.importLibrary)return Promise.resolve(window.google.maps)
  if(googleMapsPromise)return withTimeout(googleMapsPromise,GOOGLE_RUNTIME_TIMEOUT_MS,'Google Maps JavaScript API timed out while initializing. Check the API key, billing, HTTP-referrer restrictions and internet access.')

  googleMapsPromise=new Promise((resolve,reject)=>{
    const existing=document.querySelector('script[data-arkavathi-google-maps]') as HTMLScriptElement|null
    if(existing){
      const finish=()=>{
        if(googleAuthFailureError){reject(googleAuthFailureError);return}
        window.google?.maps?.importLibrary?resolve(window.google.maps):reject(new Error('Google Maps JavaScript API loaded, but the Maps runtime is unavailable.'))
      }
      if(window.google?.maps?.importLibrary){finish();return}
      existing.addEventListener('load',finish,{once:true})
      existing.addEventListener('error',()=>{googleMapsPromise=null;reject(new Error('Google Maps JavaScript API could not be loaded. Check internet access, the API key, billing and HTTP-referrer restrictions.'))},{once:true})
      return
    }

    const callbackName=`__arkavathiGoogleStreetViewReady_${Date.now()}`
    const previousAuthFailure=window.gm_authFailure
    const clearCallback=()=>{try{delete window[callbackName]}catch{window[callbackName]=undefined}}
    window.gm_authFailure=()=>{
      googleAuthFailureError=new Error('Google Maps authentication failed. Verify VITE_GOOGLE_MAPS_API_KEY, Maps JavaScript API enablement, billing and HTTP-referrer restrictions.')
      googleMapsPromise=null
      try{previousAuthFailure?.()}catch{/* preserve Arkavathi error handling */}
      reject(googleAuthFailureError)
    }
    window[callbackName]=()=>{
      clearCallback()
      if(googleAuthFailureError){reject(googleAuthFailureError);return}
      if(window.google?.maps?.importLibrary)resolve(window.google.maps)
      else {googleMapsPromise=null;reject(new Error('Google Maps JavaScript API did not initialize correctly.'))}
    }

    const script=document.createElement('script')
    script.dataset.arkavathiGoogleMaps='street-view-v23'
    script.async=true
    script.defer=true
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&v=weekly&callback=${callbackName}`
    script.onerror=()=>{clearCallback();googleMapsPromise=null;reject(new Error('Google Maps JavaScript API could not be loaded. Check the API key, billing, internet access and HTTP-referrer restrictions.'))}
    document.head.appendChild(script)
  })
  const pending=googleMapsPromise
  return withTimeout(pending,GOOGLE_RUNTIME_TIMEOUT_MS,'Google Maps JavaScript API timed out while initializing. Check the API key, billing, HTTP-referrer restrictions and internet access.')
    .catch(error=>{if(googleMapsPromise===pending)googleMapsPromise=null;throw error})
}

function googleMapsUrl(location:StreetLocation){
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${location.lat},${location.lng}`
}

function distanceMeters(a:StreetLocation,b:StreetLocation){
  const r=6371000
  const dLat=(b.lat-a.lat)*Math.PI/180
  const dLng=(b.lng-a.lng)*Math.PI/180
  const lat1=a.lat*Math.PI/180
  const lat2=b.lat*Math.PI/180
  const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2
  return 2*r*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))
}

function bearingDegrees(a:StreetLocation,b:StreetLocation){
  const lat1=a.lat*Math.PI/180
  const lat2=b.lat*Math.PI/180
  const dLng=(b.lng-a.lng)*Math.PI/180
  const y=Math.sin(dLng)*Math.cos(lat2)
  const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLng)
  const value=Math.atan2(y,x)*180/Math.PI
  return (value+360)%360
}

function formatDate(value:unknown){
  if(value===null||value===undefined||value==='')return ''
  const numeric=typeof value==='number'?value:Number(value)
  const date=Number.isFinite(numeric)&&String(value).length>=10?new Date(numeric):new Date(String(value))
  return Number.isNaN(date.getTime())?'':date.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})
}

function absoluteUrl(value:unknown){
  const raw=String(value??'').trim()
  if(!raw)return ''
  if(/^https?:\/\//i.test(raw))return raw
  if(raw.startsWith('//'))return `https:${raw}`
  if(raw.startsWith('/'))return `https://api.openstreetcam.org${raw}`
  return `https://${raw}`
}

function uniqueUrls(values:unknown[]){
  return [...new Set(values.map(absoluteUrl).filter(Boolean))]
}

function isKarta360(photo:KartaPhoto|null){
  if(!photo)return false
  const projection=photo.projection.toUpperCase()
  return projection.includes('SPHERE')||projection.includes('EQUIRECT')||projection.includes('360')||(photo.fieldOfView??0)>=330
}

function panoramaSafeKartaUrl(value:string){
  if(!value)return ''
  try{
    const parsed=new URL(value)
    if(parsed.hostname.toLowerCase()==='cdn.kartaview.org')return `/kartaview-cdn${parsed.pathname}${parsed.search}`
  }catch{/* preserve original URL */}
  return value
}

function kartaDetailsUrl(photo:KartaPhoto){
  if(!photo.sequenceId)return photo.urls[0]??'https://kartaview.org/'
  return `https://kartaview.org/details/${encodeURIComponent(photo.sequenceId)}/${Math.max(0,photo.sequenceIndex??0)}/track-info`
}

async function fetchJson(url:string,signal:AbortSignal,extraHeaders:Record<string,string>={}){
  const controller=new AbortController()
  const onAbort=()=>controller.abort()
  signal.addEventListener('abort',onAbort,{once:true})
  const timer=window.setTimeout(()=>controller.abort(),12000)
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json',...extraHeaders}})
    const text=await response.text()
    if(!response.ok)throw new Error(`HTTP ${response.status} ${response.statusText}`)
    let payload:any
    try{payload=text?JSON.parse(text):{}}catch{throw new Error('Provider returned a non-JSON response')}
    const providerHttpCode=Number(payload?.status?.httpCode)
    if(Number.isFinite(providerHttpCode)&&providerHttpCode>=400){
      throw new Error(String(payload?.status?.apiMessage??payload?.status?.message??`Provider HTTP ${providerHttpCode}`))
    }
    return payload
  }catch(error){
    if((error as any)?.name==='AbortError'&&!signal.aborted)throw new Error('Street imagery request timed out after 12 seconds')
    throw error
  }finally{
    window.clearTimeout(timer)
    signal.removeEventListener('abort',onAbort)
  }
}

async function fetchKartaPath(path:string,signal:AbortSignal){
  let proxyError:unknown=null
  try{return await fetchJson(`/kartaview-api${path}`,signal)}catch(error){if((error as any)?.name==='AbortError')throw error;proxyError=error}
  try{return await fetchJson(`https://api.openstreetcam.org${path}`,signal)}catch(error){
    if((error as any)?.name==='AbortError')throw error
    const a=proxyError instanceof Error?proxyError.message:String(proxyError??'unknown proxy error')
    const b=error instanceof Error?error.message:String(error)
    throw new Error(`KartaView request failed (proxy: ${a}; direct: ${b})`)
  }
}

function rawKartaRows(payload:any):any[]{
  if(Array.isArray(payload?.result?.data))return payload.result.data
  if(Array.isArray(payload?.result))return payload.result
  if(Array.isArray(payload?.currentPageItems))return payload.currentPageItems
  if(Array.isArray(payload?.data))return payload.data
  if(Array.isArray(payload?.items))return payload.items
  return []
}

function parseKartaRows(payload:any,location:StreetLocation):KartaPhoto[]{
  const rows:KartaPhoto[]=rawKartaRows(payload).flatMap((item:any)=>{
    const row=item?.data&&typeof item.data==='object'?{...item,...item.data}:item
    const lat=Number(row?.lat??row?.latitude??row?.gpsLat??row?.gps_lat??row?.matchLat??row?.match_lat)
    const lng=Number(row?.lng??row?.lon??row?.longitude??row?.gpsLng??row?.gps_lng??row?.matchLng??row?.match_lng)
    if(!Number.isFinite(lat)||!Number.isFinite(lng))return []
    const urls=uniqueUrls([
      row?.imageProcUrl,row?.imageProcURL,row?.imageUrl,row?.imageURL,
      row?.imageLThUrl,row?.imageThUrl,row?.processedUrl,row?.procUrl,
      row?.fileurlProc,row?.fileUrlProc,row?.fileurl,row?.fileUrl,
      row?.fileurlLTh,row?.fileUrlLTh,row?.fileurlTh,row?.fileUrlTh,
      row?.lth_name,row?.name,row?.th_name
    ])
    if(!urls.length)return []
    const sequence=row?.sequence&&typeof row.sequence==='object'?row.sequence:null
    const sequenceId=String(row?.sequenceId??row?.sequence_id??row?.seqId??sequence?.id??'')
    const sequenceIndexRaw=Number(row?.sequenceIndex??row?.sequence_index??row?.seqIndex??row?.sequenceIdx)
    const headingRaw=Number(row?.heading??row?.compassAngle??row?.gpsHeading??row?.direction)
    const fovRaw=Number(row?.fieldOfView??row?.field_of_view??row?.fov??row?.horizontalFieldOfView??sequence?.fieldOfView??sequence?.fov)
    const projectionRaw=row?.projection??row?.cameraProjection??row?.imageProjection??row?.projectionType??row?.projection_type??sequence?.projection??sequence?.cameraProjection??''
    return [{
      id:String(row?.id??row?.photoId??row?.photo_id??''),lat,lng,distanceM:distanceMeters(location,{lat,lng}),urls,
      heading:Number.isFinite(headingRaw)?headingRaw:null,
      shotDate:formatDate(row?.shotDate??row?.capturedAt??row?.dateAdded??row?.date_added??row?.createdAt),
      projection:String(projectionRaw).toUpperCase(),fieldOfView:Number.isFinite(fovRaw)?fovRaw:null,
      sequenceId,sequenceIndex:Number.isFinite(sequenceIndexRaw)?sequenceIndexRaw:null
    }]
  })
  rows.sort((a,b)=>a.distanceM-b.distanceM)
  return rows
}

function mergeKartaRows(rows:KartaPhoto[]){
  const seen=new Set<string>()
  return rows.filter(row=>{
    const key=row.id||`${row.sequenceId}:${row.sequenceIndex}:${row.lat.toFixed(7)}:${row.lng.toFixed(7)}`
    if(seen.has(key))return false
    seen.add(key)
    return true
  })
}

async function findNearbyKartaView(location:StreetLocation,signal:AbortSignal):Promise<KartaPhoto[]>{
  const variants=[
    new URLSearchParams({lat:String(location.lat),lng:String(location.lng),zoomLevel:'18',join:'sequence',orderBy:'id',orderDirection:'desc'}),
    new URLSearchParams({lat:String(location.lat),lng:String(location.lng),radius:'500',zoomLevel:'18',join:'sequence',orderBy:'id',orderDirection:'desc'}),
    new URLSearchParams({lat:String(location.lat),lng:String(location.lng),radius:'500'}),
    new URLSearchParams({lat:String(location.lat),lng:String(location.lng),zoomLevel:'16',join:'sequence',orderBy:'id',orderDirection:'desc'})
  ]
  let gathered:KartaPhoto[]=[]
  let successfulRequest=false
  let lastError:unknown=null
  for(const params of variants){
    try{
      const payload=await fetchKartaPath(`/2.0/photo/?${params.toString()}`,signal)
      successfulRequest=true
      gathered=mergeKartaRows([...gathered,...parseKartaRows(payload,location)])
      if(gathered.length)break
    }catch(error){if((error as any)?.name==='AbortError')throw error;lastError=error}
  }
  const nearby=gathered.filter(row=>row.distanceM<=MAX_STREET_MATCH_DISTANCE_M)
  if(!nearby.length){if(!successfulRequest&&lastError)throw lastError;return []}
  nearby.sort((a,b)=>a.distanceM-b.distanceM)
  const nearest=nearby[0]
  if(!nearest.sequenceId)return nearby.slice(0,40)
  const page=nearest.sequenceIndex===null?1:Math.floor(Math.max(0,nearest.sequenceIndex)/150)+1
  try{
    const sequencePayload=await fetchKartaPath(`/2.0/photo/?sequenceId=${encodeURIComponent(nearest.sequenceId)}&page=${page}&itemsPerPage=150`,signal)
    const sequenceRows=parseKartaRows(sequencePayload,location).filter(row=>!row.sequenceId||row.sequenceId===nearest.sequenceId)
    if(sequenceRows.length){
      const ordered=mergeKartaRows(sequenceRows)
      if(ordered.every(row=>row.sequenceIndex!==null))ordered.sort((a,b)=>(a.sequenceIndex??0)-(b.sequenceIndex??0))
      return ordered
    }
  }catch(error){if((error as any)?.name==='AbortError')throw error}
  const sameSequence=nearby.filter(row=>row.sequenceId===nearest.sequenceId)
  if(sameSequence.length>1&&sameSequence.every(row=>row.sequenceIndex!==null))sameSequence.sort((a,b)=>(a.sequenceIndex??0)-(b.sequenceIndex??0))
  return (sameSequence.length?sameSequence:nearby).slice(0,40)
}

function baseName(name:string){
  return name.replace(/\.[^.]+$/,'').trim().toLowerCase()
}

function makeFileId(file:File,index:number){
  return `${file.name}|${file.size}|${file.lastModified}|${index}`
}

function parseSrtTime(value:string){
  const match=value.trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/)
  if(!match)return null
  const [,h,m,s,msRaw]=match
  const ms=Number(msRaw.padEnd(3,'0').slice(0,3))
  return Number(h)*3600+Number(m)*60+Number(s)+ms/1000
}

function validLocation(lat:number,lng:number){
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=-90&&lat<=90&&lng>=-180&&lng<=180
}

function parseCoordinates(text:string):StreetLocation|null{
  const latMatch=text.match(/(?:\blat(?:itude)?\b)\s*[:=]\s*([+-]?\d{1,2}(?:\.\d+)?)/i)
  const lngMatch=text.match(/(?:\blon(?:gitude)?\b|\blng\b|\blong\b)\s*[:=]\s*([+-]?\d{1,3}(?:\.\d+)?)/i)
  if(latMatch&&lngMatch){
    const lat=Number(latMatch[1]),lng=Number(lngMatch[1])
    if(validLocation(lat,lng))return {lat,lng}
  }
  const gpsMatch=text.match(/(?:\bGPS\b|\bcoordinates?\b|\blocation\b)[^\d+\-]*([+-]?\d{1,2}\.\d+)\s*[,; ]+\s*([+-]?\d{1,3}\.\d+)/i)
  if(gpsMatch){
    const lat=Number(gpsMatch[1]),lng=Number(gpsMatch[2])
    if(validLocation(lat,lng))return {lat,lng}
  }
  return null
}

function parseSrtSamples(text:string):SrtSample[]{
  const normalized=text.replace(/^\uFEFF/,'').replace(/\r/g,'')
  const samples:SrtSample[]=[]
  const blocks=normalized.split(/\n{2,}/)
  for(const block of blocks){
    const lines=block.split('\n')
    const timeLine=lines.find(line=>line.includes('-->'))??''
    const startRaw=timeLine.split('-->')[0]?.trim()??''
    const time=parseSrtTime(startRaw)
    if(time===null)continue
    const location=parseCoordinates(block)
    if(location)samples.push({time,lat:location.lat,lng:location.lng})
  }
  if(!samples.length){
    const matcher=/(\d{1,2}:\d{2}:\d{2}[,.]\d{1,3})\s*-->[^\n]*\n([\s\S]*?)(?=\n\s*\d+\s*\n\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->|$)/g
    let match:RegExpExecArray|null
    while((match=matcher.exec(normalized))!==null){
      const time=parseSrtTime(match[1])
      const location=parseCoordinates(match[2])
      if(time!==null&&location)samples.push({time,lat:location.lat,lng:location.lng})
    }
  }
  samples.sort((a,b)=>a.time-b.time)
  const dedup:SrtSample[]=[]
  for(const sample of samples){
    const previous=dedup[dedup.length-1]
    if(previous&&Math.abs(previous.time-sample.time)<0.0005){dedup[dedup.length-1]=sample;continue}
    dedup.push(sample)
  }
  return dedup
}

function buildAlignedSamples(samples:SrtSample[],videoDuration:number,offsetSeconds:number):SrtSample[]{
  if(!samples.length)return []
  const first=samples[0].time
  const last=samples[samples.length-1].time
  const sourceSpan=Math.max(0.001,last-first)
  const targetSpan=Number.isFinite(videoDuration)&&videoDuration>0.05?videoDuration:sourceSpan
  const scale=targetSpan/sourceSpan
  // Normalize the SRT timebase onto the actual browser video duration. This removes
  // progressive drift caused by MP4 remux/trim/frame-rate duration differences.
  // Positive offset delays the GPS relative to the video; negative advances it.
  return samples.map(sample=>({
    ...sample,
    time:(sample.time-first)*scale+offsetSeconds
  }))
}

function syncPointForTime(samples:SrtSample[],time:number):VideoSyncPoint|null{
  if(!samples.length)return null
  if(time<=samples[0].time){
    const next=samples[1]
    return {location:{lat:samples[0].lat,lng:samples[0].lng},heading:next?bearingDegrees(samples[0],next):null,sampleIndex:0}
  }
  const last=samples[samples.length-1]
  if(time>=last.time){
    const previous=samples[samples.length-2]
    return {location:{lat:last.lat,lng:last.lng},heading:previous?bearingDegrees(previous,last):null,sampleIndex:samples.length-1}
  }
  let lo=0,hi=samples.length-1
  while(lo+1<hi){const mid=Math.floor((lo+hi)/2);if(samples[mid].time<=time)lo=mid;else hi=mid}
  const a=samples[lo],b=samples[hi]
  const gap=Math.max(0.001,b.time-a.time)
  const ratio=gap<=10?Math.min(1,Math.max(0,(time-a.time)/gap)):0
  return {
    location:{lat:a.lat+(b.lat-a.lat)*ratio,lng:a.lng+(b.lng-a.lng)*ratio},
    heading:distanceMeters(a,b)>0.5?bearingDegrees(a,b):null,
    sampleIndex:lo
  }
}

function formatClock(seconds:number){
  if(!Number.isFinite(seconds)||seconds<0)return '00:00'
  const total=Math.floor(seconds)
  const h=Math.floor(total/3600)
  const m=Math.floor((total%3600)/60)
  const s=total%60
  return h>0?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
}

function SurveyVideoWorkspace({onMapSyncChange,active,onModeChange,onExit,videoSeekRequest=null,workspaceFullscreen=false,onWorkspaceFullscreenChange}:{onMapSyncChange?:(state:VideoMapSyncState)=>void;active:boolean;onModeChange:(mode:'google'|'kartaview')=>void;onExit?:()=>void;videoSeekRequest?:VideoSeekRequest|null;workspaceFullscreen?:boolean;onWorkspaceFullscreenChange?:(value:boolean)=>void}){
  const videoRef=useRef<HTMLVideoElement|null>(null)
  const videoUrlsRef=useRef<string[]>([])
  const animationFrameRef=useRef<number|null>(null)
  const videoFrameHandleRef=useRef<number|null>(null)
  const videoFrameOwnerRef=useRef<HTMLVideoElement|null>(null)
  const lastMapPush=useRef<{at:number;location:StreetLocation}|null>(null)
  const [videos,setVideos]=useState<VideoUpload[]>([])
  const [srts,setSrts]=useState<SrtUpload[]>([])
  const [assignments,setAssignments]=useState<Record<string,string>>({})
  const [selectedVideoId,setSelectedVideoId]=useState('')
  const [playing,setPlaying]=useState(false)
  const [currentTime,setCurrentTime]=useState(0)
  const [duration,setDuration]=useState(0)
  const [syncPoint,setSyncPoint]=useState<VideoSyncPoint|null>(null)
  const [videoError,setVideoError]=useState('')
  const [syncOffsetSec,setSyncOffsetSec]=useState(0)
  const [showSetup,setShowSetup]=useState(true)
  const [industryCaptureOpen,setIndustryCaptureOpen]=useState(false)
  const [industrySaving,setIndustrySaving]=useState(false)
  const [industryCaptureError,setIndustryCaptureError]=useState('')
  const [industrySavedId,setIndustrySavedId]=useState('')
  const [industryForm,setIndustryForm]=useState<{name:string;category:IndustryCategory;discharge_status:IndustryDischargeStatus;discharge_notes:string;notes:string}>({name:'',category:'UNKNOWN',discharge_status:'UNKNOWN',discharge_notes:'',notes:''})
  const [serverPairs,setServerPairs]=useState<ServerMediaPair[]>([])
  const [selectedServerPairId,setSelectedServerPairId]=useState('')
  const [serverPairsLoading,setServerPairsLoading]=useState(false)
  const [serverPairsError,setServerPairsError]=useState('')

  const selectedVideo=videos.find(v=>v.id===selectedVideoId)??videos[0]??null
  const selectedSrt=selectedVideo?srts.find(s=>s.id===assignments[selectedVideo.id])??null:null
  const ready=Boolean(selectedVideo&&selectedSrt&&selectedSrt.samples.length&&!selectedSrt.error)
  const alignedSamples=useMemo(()=>buildAlignedSamples(selectedSrt?.samples??[],duration,syncOffsetSec),[selectedSrt?.id,duration,syncOffsetSec])
  const rawSrtSpan=selectedSrt?.samples.length?Math.max(0,(selectedSrt.samples[selectedSrt.samples.length-1]?.time??0)-(selectedSrt.samples[0]?.time??0)):0
  const timingScale=rawSrtSpan>0&&duration>0?duration/rawSrtSpan:1

  useEffect(()=>{if(ready)setShowSetup(false)},[ready,selectedVideo?.id,selectedSrt?.id])

  function emitMapState(point:VideoSyncPoint|null,time:number,nextPlaying:boolean,nextDuration=duration){
    onMapSyncChange?.({
      active,
      route:alignedSamples,
      location:point?.location??null,
      heading:point?.heading??null,
      currentTime:time,
      duration:nextDuration,
      playing:nextPlaying,
      videoName:selectedVideo?.file.name??'',
      srtName:selectedSrt?.file.name??''
    })
  }

  useEffect(()=>()=>{
    videoUrlsRef.current.forEach(url=>URL.revokeObjectURL(url))
    if(animationFrameRef.current!==null)cancelAnimationFrame(animationFrameRef.current)
    const owner=videoFrameOwnerRef.current as any
    if(videoFrameHandleRef.current!==null&&owner?.cancelVideoFrameCallback){try{owner.cancelVideoFrameCallback(videoFrameHandleRef.current)}catch{}}
  },[])

  useEffect(()=>{
    if(!active){
      videoRef.current?.pause();setPlaying(false)
      onMapSyncChange?.({active:false,route:[],location:null,heading:null,currentTime:0,duration:0,playing:false,videoName:'',srtName:''})
      return
    }
    const video=videoRef.current
    const time=video?.currentTime??0
    const nextDuration=video&&Number.isFinite(video.duration)?video.duration:duration
    const point=alignedSamples.length?syncPointForTime(alignedSamples,time):null
    setSyncPoint(point);setCurrentTime(time)
    emitMapState(point,time,false,nextDuration)
  },[active,selectedVideo?.id,selectedSrt?.id,duration,syncOffsetSec])

  useEffect(()=>{
    if(!videoSeekRequest||!active)return
    if(videoSeekRequest.videoName){
      const requestedBase=baseName(videoSeekRequest.videoName)
      const requested=videos.find(video=>baseName(video.file.name)===requestedBase)
      if(requested&&requested.id!==selectedVideo?.id){chooseVideo(requested.id);return}
    }
    const video=videoRef.current
    if(!video||!ready)return
    const maxTime=Number.isFinite(video.duration)&&video.duration>0?Math.max(0,video.duration-0.02):Math.max(0,videoSeekRequest.time)
    const target=Math.max(0,Math.min(maxTime,videoSeekRequest.time))
    video.pause();setPlaying(false);video.currentTime=target;setCurrentTime(target)
    const point=alignedSamples.length?syncPointForTime(alignedSamples,target):null
    setSyncPoint(point);lastMapPush.current=null
    emitMapState(point,target,false,Number.isFinite(video.duration)?video.duration:duration)
  },[videoSeekRequest?.id,active,ready,selectedVideo?.id,alignedSamples,duration])

  useEffect(()=>{
    const next:Record<string,string>={}
    for(const video of videos){
      const previous=assignments[video.id]
      if(previous&&srts.some(s=>s.id===previous)){next[video.id]=previous;continue}
      const exact=srts.find(s=>baseName(s.file.name)===baseName(video.file.name))
      if(exact)next[video.id]=exact.id
    }
    if(videos.length===1&&srts.length===1&&!next[videos[0].id])next[videos[0].id]=srts[0].id
    setAssignments(next)
    if(videos.length&&!videos.some(v=>v.id===selectedVideoId))setSelectedVideoId(videos[0].id)
    if(!videos.length)setSelectedVideoId('')
  },[videos,srts])

  async function refreshServerPairs(){
    setServerPairsLoading(true);setServerPairsError('')
    try{
      const rows=await api.mediaPairs()
      const paired=rows.filter(row=>row.paired&&row.video_name&&row.srt_name) as ServerMediaPair[]
      setServerPairs(paired)
      setSelectedServerPairId(current=>paired.some(row=>row.id===current)?current:(paired[0]?.id??''))
    }catch(error){setServerPairsError(error instanceof Error?error.message:String(error))}
    finally{setServerPairsLoading(false)}
  }

  async function loadServerPair(){
    const pair=serverPairs.find(row=>row.id===selectedServerPairId)
    if(!pair)return
    videoRef.current?.pause();setPlaying(false);setServerPairsError('');setVideoError('')
    try{
      const text=await api.mediaPairSrt(pair.id)
      const samples=parseSrtSamples(text)
      if(!samples.length)throw new Error('The selected server SRT does not contain valid latitude/longitude samples.')
      videoUrlsRef.current.forEach(url=>URL.revokeObjectURL(url));videoUrlsRef.current=[]
      const videoFile=new File([],pair.video_name,{type:'video/mp4'})
      const srtFile=new File([text],pair.srt_name,{type:'text/plain'})
      const videoId=`server-video-${pair.id}`
      const srtId=`server-srt-${pair.id}`
      setVideos([{id:videoId,file:videoFile,url:api.mediaPairVideoUrl(pair.id)}])
      setSrts([{id:srtId,file:srtFile,samples,error:''}])
      setAssignments({[videoId]:srtId})
      setSelectedVideoId(videoId);setCurrentTime(0);setDuration(0);setSyncPoint(null);setSyncOffsetSec(0);setPlaying(false);setShowSetup(true)
    }catch(error){setServerPairsError(error instanceof Error?error.message:String(error))}
  }

  async function onVideoFiles(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files??[]) as File[]
    videoRef.current?.pause()
    videoUrlsRef.current.forEach(url=>URL.revokeObjectURL(url))
    const rows=files.map((file,index)=>({id:makeFileId(file,index),file,url:URL.createObjectURL(file)}))
    videoUrlsRef.current=rows.map(row=>row.url)
    setVideos(rows);setSelectedVideoId(rows[0]?.id??'');setCurrentTime(0);setDuration(0);setSyncPoint(null);setVideoError('');setPlaying(false);setSyncOffsetSec(0);setShowSetup(true)
    event.target.value=''
  }

  async function onSrtFiles(event:ChangeEvent<HTMLInputElement>){
    const files=Array.from(event.target.files??[]) as File[]
    const rows=await Promise.all(files.map(async(file,index)=>{
      try{
        const text=await file.text()
        const samples=parseSrtSamples(text)
        return {id:makeFileId(file,index),file,samples,error:samples.length?'':'No latitude/longitude samples were found in this SRT.'}
      }catch(error){return {id:makeFileId(file,index),file,samples:[],error:error instanceof Error?error.message:String(error)}}
    }))
    setSrts(rows);setShowSetup(true)
    event.target.value=''
  }

  function setAssignment(videoId:string,srtId:string){
    videoRef.current?.pause();setPlaying(false);setCurrentTime(0);setSyncPoint(null);setSyncOffsetSec(0)
    if(videoRef.current)videoRef.current.currentTime=0
    setAssignments(current=>({...current,[videoId]:srtId}))
  }

  function chooseVideo(videoId:string){
    videoRef.current?.pause();setPlaying(false);setCurrentTime(0);setDuration(0);setSyncPoint(null);setVideoError('');setSyncOffsetSec(0)
    setSelectedVideoId(videoId)
  }

  function clearUploads(){
    videoRef.current?.pause()
    videoUrlsRef.current.forEach(url=>URL.revokeObjectURL(url));videoUrlsRef.current=[]
    setVideos([]);setSrts([]);setAssignments({});setSelectedVideoId('');setPlaying(false);setCurrentTime(0);setDuration(0);setSyncPoint(null);setVideoError('');setSyncOffsetSec(0);setShowSetup(true)
    onMapSyncChange?.({active,route:[],location:null,heading:null,currentTime:0,duration:0,playing:false,videoName:'',srtName:''})
  }

  function pushSync(force=false,nextPlaying=playing,mediaTime?:number){
    const video=videoRef.current
    if(!video||!alignedSamples.length)return
    const exactVideoTime=typeof mediaTime==='number'&&Number.isFinite(mediaTime)?mediaTime:video.currentTime
    const point=syncPointForTime(alignedSamples,exactVideoTime)
    if(!point)return
    const nextDuration=Number.isFinite(video.duration)?video.duration:0
    const now=performance.now()
    const last=lastMapPush.current
    const shouldPush=force||!last||now-last.at>=16||distanceMeters(last.location,point.location)>=0.05
    if(shouldPush){
      lastMapPush.current={at:now,location:point.location}
      setCurrentTime(exactVideoTime);setDuration(nextDuration);setSyncPoint(point)
      emitMapState(point,exactVideoTime,nextPlaying,nextDuration)
    }
  }

  useEffect(()=>{
    if(animationFrameRef.current!==null){cancelAnimationFrame(animationFrameRef.current);animationFrameRef.current=null}
    const previousOwner=videoFrameOwnerRef.current as any
    if(videoFrameHandleRef.current!==null&&previousOwner?.cancelVideoFrameCallback){try{previousOwner.cancelVideoFrameCallback(videoFrameHandleRef.current)}catch{}}
    videoFrameHandleRef.current=null;videoFrameOwnerRef.current=null
    if(!active||!playing||!ready)return
    const video=videoRef.current as any
    if(!video)return
    if(typeof video.requestVideoFrameCallback==='function'){
      videoFrameOwnerRef.current=video
      const tick=(_now:number,metadata:any)=>{
        pushSync(false,true,Number(metadata?.mediaTime))
        videoFrameHandleRef.current=video.requestVideoFrameCallback(tick)
      }
      videoFrameHandleRef.current=video.requestVideoFrameCallback(tick)
      return()=>{
        if(videoFrameHandleRef.current!==null&&typeof video.cancelVideoFrameCallback==='function'){try{video.cancelVideoFrameCallback(videoFrameHandleRef.current)}catch{}}
        videoFrameHandleRef.current=null;videoFrameOwnerRef.current=null
      }
    }
    const tick=()=>{pushSync(false,true);animationFrameRef.current=requestAnimationFrame(tick)}
    animationFrameRef.current=requestAnimationFrame(tick)
    return()=>{if(animationFrameRef.current!==null){cancelAnimationFrame(animationFrameRef.current);animationFrameRef.current=null}}
  },[active,playing,ready,selectedVideo?.id,selectedSrt?.id,duration,syncOffsetSec])

  async function startPlayback(){
    if(!ready||!videoRef.current)return
    setVideoError('')
    const video=videoRef.current
    if(Number.isFinite(video.duration)&&video.duration>0&&video.currentTime>=video.duration-0.1)video.currentTime=0
    pushSync(true,true)
    try{await video.play()}catch(error){setPlaying(false);setVideoError(error instanceof Error?error.message:String(error))}
  }

  function pausePlayback(){
    const video=videoRef.current
    video?.pause();setPlaying(false)
    if(video&&ready)pushSync(true,false)
  }

  function stopPlayback(){
    const video=videoRef.current
    if(!video)return
    video.pause();video.currentTime=0;setPlaying(false);setCurrentTime(0)
    const point=alignedSamples.length?syncPointForTime(alignedSamples,0):null
    setSyncPoint(point);lastMapPush.current=null
    emitMapState(point,0,false,Number.isFinite(video.duration)?video.duration:duration)
  }

  function adjustSyncOffset(delta:number){
    setSyncOffsetSec(current=>Math.max(-10,Math.min(10,Math.round((current+delta)*100)/100)))
  }

  function openIndustryCapture(){
    if(!ready||!videoRef.current){setVideoError('Load a valid Video + SRT pair before marking an industry.');setShowSetup(true);return}
    const video=videoRef.current
    video.pause();setPlaying(false);pushSync(true,false)
    setIndustryForm({name:'',category:'UNKNOWN',discharge_status:'UNKNOWN',discharge_notes:'',notes:''})
    setIndustryCaptureError('');setIndustrySavedId('');setIndustryCaptureOpen(true)
  }

  function captureVideoFrame():Promise<Blob|null>{
    const video=videoRef.current
    if(!video||!video.videoWidth||!video.videoHeight)return Promise.resolve(null)
    const maxWidth=1280
    const scale=Math.min(1,maxWidth/video.videoWidth)
    const canvas=document.createElement('canvas')
    canvas.width=Math.max(1,Math.round(video.videoWidth*scale));canvas.height=Math.max(1,Math.round(video.videoHeight*scale))
    const ctx=canvas.getContext('2d')
    if(!ctx)return Promise.resolve(null)
    try{ctx.drawImage(video,0,0,canvas.width,canvas.height)}catch{return Promise.resolve(null)}
    return new Promise(resolve=>canvas.toBlob(blob=>resolve(blob),'image/jpeg',0.86))
  }

  async function saveIndustryCapture(){
    const video=videoRef.current
    if(!video||!selectedVideo||!selectedSrt||!alignedSamples.length){setIndustryCaptureError('Video/SRT synchronization is not ready.');return}
    const mediaTime=Number.isFinite(video.currentTime)?video.currentTime:currentTime
    const point=syncPointForTime(alignedSamples,mediaTime)
    if(!point){setIndustryCaptureError('No synchronized GPS position is available at this video time.');return}
    setIndustrySaving(true);setIndustryCaptureError('');setIndustrySavedId('')
    try{
      let created=await api.createIndustryObservation({
        name:industryForm.name.trim(),category:industryForm.category,latitude:point.location.lat,longitude:point.location.lng,
        video_name:selectedVideo.file.name,srt_name:selectedSrt.file.name,video_time_seconds:mediaTime,heading:point.heading,
        status:'OBSERVED_SITE',discharge_status:industryForm.discharge_status,discharge_notes:industryForm.discharge_notes.trim(),notes:industryForm.notes.trim()
      })
      const frame=await captureVideoFrame()
      if(frame){
        try{
          const frameName=`${baseName(selectedVideo.file.name)||'video'}_${String(Math.floor(mediaTime/60)).padStart(2,'0')}-${String(Math.floor(mediaTime%60)).padStart(2,'0')}.jpg`
          created=await api.uploadIndustryEvidence(created.public_id,frame,frameName)
        }catch(error){setIndustryCaptureError(`Observation saved, but frame upload failed: ${error instanceof Error?error.message:String(error)}`)}
      }
      setIndustrySavedId(created.public_id)
      window.dispatchEvent(new Event('arkavathi-industry-updated'))
    }catch(error){setIndustryCaptureError(error instanceof Error?error.message:String(error))}
    finally{setIndustrySaving(false)}
  }

  const firstTime=selectedSrt?.samples[0]?.time??0
  const lastTime=selectedSrt?.samples[selectedSrt.samples.length-1]?.time??0
  const currentSrtName=selectedSrt?.file.name??'No SRT paired'

  return <div className={`relative overflow-hidden bg-black ${workspaceFullscreen?'h-full min-h-[320px]':'h-[610px]'}`}>
    {selectedVideo?<video key={selectedVideo.id} ref={videoRef} src={selectedVideo.url} controls preload="metadata" onLoadedMetadata={()=>{const video=videoRef.current;if(video){const nextDuration=Number.isFinite(video.duration)?video.duration:0;setDuration(nextDuration);lastMapPush.current=null}}} onTimeUpdate={()=>pushSync(false,playing)} onSeeked={()=>pushSync(true,playing)} onPlay={()=>{const video=videoRef.current;if(!ready){video?.pause();setPlaying(false);setVideoError('Pair this video with a valid SRT containing GPS coordinates before playback.');setShowSetup(true);return}setPlaying(true);pushSync(true,true)}} onPause={()=>{setPlaying(false);if(ready)pushSync(true,false)}} onEnded={()=>{setPlaying(false);pushSync(true,false)}} onError={()=>setVideoError('The selected browser could not decode this video file. MP4/H.264 is recommended.')} className="h-full w-full object-contain"/>:<div className="absolute inset-0 grid place-items-center bg-slate-950 p-8 text-center text-slate-300"><div><FileVideo className="mx-auto text-blue-300" size={46}/><div className="mt-4 text-lg font-black text-white">Upload Video + matching SRT</div><div className="mt-2 max-w-md text-xs leading-5 text-slate-400">The video and the left satellite map occupy one aligned row. SRT timestamps drive only the moving GPS marker on the map.</div><button type="button" onClick={()=>setShowSetup(true)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-xs font-black text-slate-950"><Upload size={15}/>Open uploads</button></div></div>}

    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between gap-3 p-3">
      <div className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-xl border border-white/15 bg-slate-950/90 px-3 py-2 text-white shadow-xl backdrop-blur">
        <FileVideo size={15} className="shrink-0 text-blue-300"/>
        <div className="min-w-0"><div className="truncate text-xs font-black">{selectedVideo?.file.name??'Video + SRT Map Sync'}</div><div className="mt-0.5 font-mono text-[10px] text-slate-300">{formatClock(currentTime)} / {formatClock(duration)}{syncPoint?` · ${syncPoint.location.lat.toFixed(6)}, ${syncPoint.location.lng.toFixed(6)}`:''}</div></div>
      </div>
      <div className="pointer-events-auto flex flex-wrap justify-end gap-2 rounded-xl border border-white/15 bg-slate-950/90 p-2 shadow-xl backdrop-blur">
        <button type="button" onClick={()=>onModeChange('google')} className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-black text-white hover:bg-white/20" data-street-control="google360" aria-label="Google 360" title="Google 360"><Globe2 size={19} strokeWidth={2} /></button>
        <button type="button" className="rounded-lg bg-white px-3 py-2 text-[11px] font-black text-navy-950" data-street-control="video-srt" aria-label="Video + SRT" title="Video + SRT"><Video size={19} strokeWidth={2} /></button>
        <button type="button" onClick={()=>onModeChange('kartaview')} className="rounded-lg bg-white/10 px-3 py-2 text-[11px] font-black text-white hover:bg-white/20" data-street-control="kartaview" aria-label="KartaView" title="KartaView"><Images size={19} strokeWidth={2} /></button>
        <button type="button" onClick={()=>setShowSetup(v=>!v)} className="rounded-lg border border-blue-300/40 bg-blue-500/20 px-3 py-2 text-[11px] font-black text-blue-50 hover:bg-blue-500/30">{showSetup?'Hide files':'Files / Pairing'}</button>
        {onWorkspaceFullscreenChange&&<button type="button" aria-pressed={workspaceFullscreen} onClick={()=>onWorkspaceFullscreenChange(!workspaceFullscreen)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/45 bg-amber-400/15 px-3 py-2 text-[11px] font-black text-amber-100 hover:bg-amber-400/25" title={workspaceFullscreen?'Exit full workspace':'Fill the dashboard workspace while keeping the top header and left sidebar'} data-street-control="fullscreen" aria-label="Toggle Full Screen"><Maximize2 size={19} strokeWidth={2} /></button>}
        {onExit&&<button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-black text-white hover:bg-white/20"><ArrowLeft size={14}/>Exit</button>}
      </div>
    </div>

    {showSetup&&<div className="absolute inset-x-3 top-[78px] z-40 max-h-[360px] overflow-y-auto rounded-2xl border border-slate-200 bg-white/97 p-3 shadow-2xl backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><div className="text-sm font-black text-slate-900">Video + SRT files</div><div className="text-[10px] leading-4 text-slate-500">Pair each video with its matching SRT. Once a valid pair is ready, this panel collapses so the video stays perfectly aligned with the map.</div></div><button type="button" onClick={clearUploads} disabled={!videos.length&&!srts.length} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-[10px] font-black text-slate-700 disabled:opacity-40"><Trash2 size={13}/>Clear uploads</button></div>
      <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end">
          <label className="min-w-0 flex-1 text-[10px] font-black uppercase tracking-wider text-indigo-800">Server Media Library
            <select value={selectedServerPairId} onChange={e=>setSelectedServerPairId(e.target.value)} className="mt-1 w-full rounded-lg border border-indigo-300 bg-white px-3 py-2 text-[11px] font-semibold normal-case text-slate-800">
              <option value="">{serverPairs.length?'Select Video + SRT pair...':'Click Refresh Library to load server media'}</option>
              {serverPairs.map(pair=><option key={pair.id} value={pair.id}>{pair.folder==='.'?'':`${pair.folder} / `}{pair.video_name} + {pair.srt_name}</option>)}
            </select>
          </label>
          <div className="flex shrink-0 gap-2"><button type="button" onClick={refreshServerPairs} disabled={serverPairsLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-300 bg-white px-3 py-2 text-[10px] font-black text-indigo-900 disabled:opacity-50">{serverPairsLoading?<Loader2 size={13} className="animate-spin"/>:<RefreshCw size={13}/>}Refresh Library</button><button type="button" onClick={loadServerPair} disabled={!selectedServerPairId||serverPairsLoading} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-700 px-3 py-2 text-[10px] font-black text-white disabled:opacity-40"><Play size={13}/>Load Pair</button></div>
        </div>
        <div className="mt-2 text-[10px] leading-4 text-indigo-800">Production folder: <span className="font-mono font-black">production_data/video_srt_pairs/&lt;DATE&gt;/</span>. Copy matching MP4 + SRT files there, then click <strong>Refresh Library</strong>. No frontend rebuild is required.</div>
        {serverPairsError&&<div className="mt-2 text-[10px] font-semibold text-rose-700">{serverPairsError}</div>}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 px-3 py-3 text-[11px] font-black text-blue-900 hover:bg-blue-100"><Upload size={15}/>Upload Video file(s)<input type="file" multiple accept="video/*,.mp4,.mov,.m4v,.avi,.webm" onChange={onVideoFiles} className="hidden"/></label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 px-3 py-3 text-[11px] font-black text-emerald-900 hover:bg-emerald-100"><FileText size={15}/>Upload SRT file(s)<input type="file" multiple accept=".srt,text/plain" onChange={onSrtFiles} className="hidden"/></label>
      </div>
      {(videos.length>0||srts.length>0)&&<div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2.5">
        <div className="mb-2 flex items-center justify-between"><div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Video / SRT pairing</div><div className="text-[10px] font-bold text-slate-500">{videos.length} video(s) · {srts.length} SRT file(s)</div></div>
        <div className="max-h-36 space-y-2 overflow-auto pr-1">{videos.map(video=>{const assignedId=assignments[video.id]??'';const srt=srts.find(row=>row.id===assignedId);const selected=selectedVideo?.id===video.id;return <div key={video.id} className={`grid gap-2 rounded-xl border p-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] ${selected?'border-blue-400 bg-blue-50':'border-slate-200 bg-white'}`}><button type="button" onClick={()=>chooseVideo(video.id)} className="flex min-w-0 items-center gap-2 text-left"><FileVideo size={15} className="shrink-0 text-blue-700"/><span className="truncate text-[11px] font-black text-slate-900">{video.file.name}</span></button><select value={assignedId} onChange={e=>setAssignment(video.id,e.target.value)} className="min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-700"><option value="">Select matching SRT...</option>{srts.map(row=><option key={row.id} value={row.id}>{row.file.name}{row.samples.length?` (${row.samples.length} GPS samples)`:' (no GPS)'}</option>)}</select><button type="button" onClick={()=>chooseVideo(video.id)} className={`rounded-lg px-2.5 py-1.5 text-[10px] font-black ${selected?'bg-blue-700 text-white':'border border-slate-300 bg-white text-slate-600'}`}>{selected?'Selected':'Select'}</button>{srt?.error&&<div className="md:col-span-3 text-[10px] font-semibold text-rose-700">{srt.file.name}: {srt.error}</div>}</div>})}</div>
      </div>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-cyan-200 bg-cyan-50 p-2 text-[10px] text-cyan-950"><span className="mr-1 font-black">FRAME-LOCKED GPS ALIGNMENT</span><button type="button" onClick={()=>adjustSyncOffset(-0.5)} className="rounded bg-cyan-100 px-2 py-1 font-black">-0.50s</button><button type="button" onClick={()=>adjustSyncOffset(-0.1)} className="rounded bg-cyan-100 px-2 py-1 font-black">-0.10s</button><span className="min-w-[70px] rounded bg-cyan-900 px-2 py-1 text-center font-mono font-black text-white">{syncOffsetSec>=0?'+':''}{syncOffsetSec.toFixed(2)}s</span><button type="button" onClick={()=>adjustSyncOffset(0.1)} className="rounded bg-cyan-100 px-2 py-1 font-black">+0.10s</button><button type="button" onClick={()=>adjustSyncOffset(0.5)} className="rounded bg-cyan-100 px-2 py-1 font-black">+0.50s</button><button type="button" onClick={()=>setSyncOffsetSec(0)} className="rounded border border-cyan-300 bg-white px-2 py-1 font-black">Reset</button><span className="ml-auto text-cyan-800">SRT {rawSrtSpan.toFixed(3)}s → video {duration.toFixed(3)}s · {timingScale.toFixed(6)}×</span></div>
      {videoError&&<div className="mt-2 text-[10px] font-semibold text-rose-700">{videoError}</div>}
    </div>}

    {industryCaptureOpen&&<div className="absolute inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl border border-amber-300/50 bg-white p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-3"><div className="flex gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white"><Factory size={20}/></div><div><div className="text-base font-black text-slate-900">Mark industrial-site observation</div><div className="mt-1 text-[11px] leading-5 text-slate-500">The current video frame, playback timestamp and synchronized SRT GPS position will be stored together as survey evidence.</div></div></div><button type="button" onClick={()=>setIndustryCaptureOpen(false)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><X size={16}/></button></div>
        <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3"><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Video time</div><div className="mt-1 font-mono text-xs font-black text-slate-800">{formatClock(videoRef.current?.currentTime??currentTime)}</div></div><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Latitude</div><div className="mt-1 font-mono text-xs font-black text-slate-800">{syncPoint?.location.lat.toFixed(6)??'—'}</div></div><div><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Longitude</div><div className="mt-1 font-mono text-xs font-black text-slate-800">{syncPoint?.location.lng.toFixed(6)??'—'}</div></div></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Industry / site name <span className="font-semibold normal-case text-slate-400">(optional)</span><input value={industryForm.name} onChange={e=>setIndustryForm(v=>({...v,name:e.target.value}))} placeholder="Enter if visible/known" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold normal-case text-slate-800"/></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Category<select value={industryForm.category} onChange={e=>setIndustryForm(v=>({...v,category:e.target.value as IndustryCategory}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold normal-case text-slate-800"><option value="UNKNOWN">Unknown / classify later</option><option value="MANUFACTURING">Manufacturing</option><option value="WAREHOUSE">Warehouse</option><option value="FOOD_PROCESSING">Food processing</option><option value="TEXTILE">Textile</option><option value="CHEMICAL">Chemical</option><option value="CONSTRUCTION_MATERIAL">Construction material</option><option value="WORKSHOP">Workshop</option><option value="UTILITY">Utility</option><option value="OTHER">Other</option></select></label></div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Visible discharge / outfall<select value={industryForm.discharge_status} onChange={e=>setIndustryForm(v=>({...v,discharge_status:e.target.value as IndustryDischargeStatus}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold normal-case text-slate-800"><option value="UNKNOWN">Unknown / not clear</option><option value="YES">Observed</option><option value="NO">Not observed</option></select></label><label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Discharge notes<input value={industryForm.discharge_notes} onChange={e=>setIndustryForm(v=>({...v,discharge_notes:e.target.value}))} placeholder="Pipe, drain, colour, flow..." className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold normal-case text-slate-800"/></label></div>
        <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-500">Observation notes<textarea value={industryForm.notes} onChange={e=>setIndustryForm(v=>({...v,notes:e.target.value}))} rows={2} placeholder="Visible signboard, building use, smoke, waste, access road, verification notes..." className="mt-1 w-full resize-none rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold normal-case text-slate-800"/></label>
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] leading-5 text-blue-900"><strong>Classification safeguard:</strong> this is saved as <strong>Observed Site</strong>. It is not called “unregistered” unless authoritative records/field verification later support that status.</div>
        {industryCaptureError&&<div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-800">{industryCaptureError}</div>}
        {industrySavedId&&<div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800"><CheckCircle2 size={14} className="mr-1.5 inline"/>Saved {industrySavedId}. The observation is now available in Industry Intelligence.</div>}
        <div className="mt-4 flex flex-wrap justify-end gap-2"><button type="button" onClick={()=>setIndustryCaptureOpen(false)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700">{industrySavedId?'Done':'Cancel'}</button><button type="button" disabled={industrySaving||Boolean(industrySavedId)} onClick={saveIndustryCapture} className="inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-xs font-black text-white disabled:opacity-40">{industrySaving?<Loader2 size={14} className="animate-spin"/>:<><Camera size={14}/><Save size={13}/></>}Save + Capture Frame</button></div>
      </div>
    </div>}

    <div className="pointer-events-none absolute inset-x-3 bottom-12 z-30">
      <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-xl border border-white/15 bg-slate-950/90 p-2.5 text-white shadow-2xl backdrop-blur">
        <button type="button" disabled={!ready||playing} onClick={startPlayback} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-emerald-950 disabled:cursor-not-allowed disabled:opacity-40"><Play size={14}/>{currentTime>0&&!playing?'Resume':'Start'}</button>
        <button type="button" disabled={!selectedVideo||!playing} onClick={pausePlayback} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-amber-950 disabled:cursor-not-allowed disabled:opacity-40"><Pause size={14}/>Pause</button>
        <button type="button" disabled={!selectedVideo} onClick={stopPlayback} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"><Square size={13}/>Stop</button>
        <button type="button" disabled={!ready} onClick={openIndustryCapture} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-2 text-xs font-black text-amber-950 disabled:cursor-not-allowed disabled:opacity-40" title="Pause at the current Video/SRT GPS position and save a georeferenced industrial-site observation"><Factory size={14}/>Mark Industry</button>
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${ready?'bg-emerald-900/80 text-emerald-200':'bg-rose-900/70 text-rose-200'}`}>{ready?'MAP SYNC READY':'VIDEO + VALID SRT REQUIRED'}</span>
        <span className="ml-auto hidden max-w-[270px] truncate text-[10px] text-slate-300 sm:inline"><span className="font-black text-white">SRT:</span> {currentSrtName}</span>
      </div>
    </div>
  </div>
}

export function StreetViewPanel({location,onLocationChange,active=true,onExit,onVideoMapSyncChange,videoSeekRequest=null,workspaceFullscreen=false,onWorkspaceFullscreenChange,providers,defaultProvider,onPanoramaChange}:Props){
  const googleNode=useRef<HTMLDivElement|null>(null)
  const googlePanoramaRef=useRef<any>(null)
  const fullscreenNode=useRef<HTMLDivElement|null>(null)
  const requestSerial=useRef(0)
  const availableProviders:ProviderMode[]=providers&&providers.length?providers:['google','video','kartaview']
  const [providerMode,setProviderMode]=useState<ProviderMode>(defaultProvider??'google')
  const [activeProvider,setActiveProvider]=useState<ActiveProvider>(null)
  useEffect(()=>{if(videoSeekRequest)setProviderMode('video')},[videoSeekRequest?.id])
  const [status,setStatus]=useState<'idle'|'loading'|'ready'|'missing'|'error'>('idle')
  const [message,setMessage]=useState('')
  const [googleMatch,setGoogleMatch]=useState<GoogleMatch|null>(null)
  const [kartaPhotos,setKartaPhotos]=useState<KartaPhoto[]>([])
  const [kartaIndex,setKartaIndex]=useState(0)
  const [kartaUrlIndex,setKartaUrlIndex]=useState(0)
  const [ratioPanoramaUrl,setRatioPanoramaUrl]=useState('')
  const [retryNonce,setRetryNonce]=useState(0)
  const [latInput,setLatInput]=useState(location.lat.toFixed(6))
  const [lngInput,setLngInput]=useState(location.lng.toFixed(6))
  const googleApiKey=(import.meta.env.VITE_GOOGLE_MAPS_API_KEY??'').trim()

  // ---- Live-state mirrors used by the panorama listeners ------------------
  // The Google panorama listeners are registered once, on the shared panorama
  // instance, so their closure would otherwise keep the render (and the
  // requestSerial value) that existed when the panorama was first created.
  // Every value the report needs is therefore read through a ref that is
  // refreshed on every render, and the listener never compares a captured
  // serial against requestSerial.current.
  const activeRef=useRef(active);activeRef.current=active
  const statusRef=useRef(status);statusRef.current=status
  const activeProviderRef=useRef(activeProvider);activeProviderRef.current=activeProvider
  const googleMatchRef=useRef(googleMatch);googleMatchRef.current=googleMatch
  const locationRef=useRef(location);locationRef.current=location
  const onPanoramaChangeRef=useRef(onPanoramaChange);onPanoramaChangeRef.current=onPanoramaChange
  const emitViewReportRef=useRef<()=>void>(()=>{})
  const currentKartaRef=useRef<KartaPhoto|null>(null)
  const activeHeadingRef=useRef<number|null>(null)

  useEffect(()=>{setLatInput(location.lat.toFixed(6));setLngInput(location.lng.toFixed(6))},[location.lat,location.lng])
  useEffect(()=>{setKartaUrlIndex(0);setRatioPanoramaUrl('')},[kartaIndex,kartaPhotos])
  // Moving to an adjacent KartaView capture changes the confirmed imagery
  // position, so the single map marker has to follow it. Google already
  // reports through its own pov/position/zoom panorama listeners.
  useEffect(()=>{
    if(activeProvider!=='kartaview'||status!=='ready')return
    scheduleViewReport(0)
  },[kartaIndex,activeProvider,status])
  const viewReportTimeoutRef = useRef<number|null>(null)
  const lastReportRef = useRef<string>('')

  function emitViewReport(){
    if(!activeRef.current)return
    const reportStatus=statusRef.current
    // Only a confirmed panorama is reported as a position. Loading / missing /
    // error reports are sent explicitly by run(), never inferred here.
    if(reportStatus!=='ready')return
    const provider=activeProviderRef.current
    const karta=currentKartaRef.current
    const gmatch=googleMatchRef.current
    const requested=locationRef.current
    const pano=googlePanoramaRef.current
    let povHeading:number|null=null,pitch:number|null=null,zoom:number|null=null
    let gPos:StreetLocation|null=null
    if(provider==='google'){
      try{const pov=pano?.getPov?.();if(pov){povHeading=typeof pov.heading==='number'?pov.heading:((pov as any).heading?.toFixed?Number(pov.heading):null);pitch=typeof pov.pitch==='number'?pov.pitch:null};zoom=typeof pano?.getZoom?.()==='number'?pano.getZoom():null}catch{}
      try{const ll=pano?.getPosition?.();if(ll){const lat=typeof ll.lat==='function'?ll.lat():Number(ll.lat);const lng=typeof ll.lng==='function'?ll.lng():Number(ll.lng);if(isFinite(lat)&&isFinite(lng))gPos={lat,lng}}}catch{}
    }
    // Google reports the live viewing direction from the panorama POV.
    // KartaView exposes no live camera orientation, but every capture carries
    // the heading the camera actually had when the photo was taken; that
    // provider-supplied value is reported instead of a fabricated one, and it
    // stays null whenever the provider did not send one.
    const pos=provider==='kartaview'?(karta?{lat:karta.lat,lng:karta.lng}:requested):(gPos||gmatch||requested)
    const headingToReport=provider==='google'?povHeading
      :(provider==='kartaview'&&karta&&typeof karta.heading==='number'&&Number.isFinite(karta.heading))?karta.heading:null
    const key=`${pos.lat.toFixed(7)}|${pos.lng.toFixed(7)}|${headingToReport??'null'}|${provider}|${reportStatus}`
    if(key===lastReportRef.current)return
    lastReportRef.current=key
    onPanoramaChangeRef.current?.({
      position:{lat:pos.lat,lng:pos.lng},
      heading:headingToReport,
      povHeading, pitch, zoom,
      provider,
      panoId:provider==='google'?gmatch?.panoId??null:karta?.id??null,
      googleMatch:gmatch, kartaPhoto:karta,
      status:reportStatus
    })
  }
  // Always call the newest closure so reports never use a stale render.
  emitViewReportRef.current=emitViewReport
  function scheduleViewReport(delay=120){
    if(viewReportTimeoutRef.current)window.clearTimeout(viewReportTimeoutRef.current)
    viewReportTimeoutRef.current=window.setTimeout(()=>emitViewReportRef.current(),delay)
  }

   useEffect(()=>()=>{try{googlePanoramaRef.current?.setVisible?.(false)}catch{};googlePanoramaRef.current=null;if(viewReportTimeoutRef.current)window.clearTimeout(viewReportTimeoutRef.current);onPanoramaChangeRef.current?.(null)},[])
  useEffect(()=>{
    const timer=window.setTimeout(()=>{
      try{
        const pano=googlePanoramaRef.current
        if(activeProvider==='google'&&status==='ready')pano?.setVisible?.(true)
        window.google?.maps?.event?.trigger?.(pano,'resize')
      }catch{}
    },80)
    return()=>window.clearTimeout(timer)
  },[workspaceFullscreen,providerMode,activeProvider,status,location.lat,location.lng])

  const targetLabel=useMemo(()=>`${location.lat.toFixed(6)}, ${location.lng.toFixed(6)}`,[location.lat,location.lng])
  const currentKarta=kartaPhotos[kartaIndex]??null
  const currentKartaUrl=currentKarta?.urls[Math.min(kartaUrlIndex,Math.max(0,currentKarta.urls.length-1))]??''
  const currentKarta360=Boolean(currentKarta&&(isKarta360(currentKarta)||ratioPanoramaUrl===currentKartaUrl))
  const currentKartaPanoramaUrl=currentKarta360?panoramaSafeKartaUrl(currentKartaUrl):currentKartaUrl
  // KartaView exposes the capture heading only; StreetPanorama360 exposes no
  // live orientation callback, so a live viewing heading is unsupported there.
  const activeHeading=activeProvider==='kartaview'?currentKarta?.heading:null
  currentKartaRef.current=currentKarta
  activeHeadingRef.current=activeHeading

  useEffect(()=>{
    if(providerMode==='video'){
      try{googlePanoramaRef.current?.setVisible?.(false)}catch{}
      return
    }
    if(!active){
      try{googlePanoramaRef.current?.setVisible?.(false)}catch{}
      setStatus('idle');setMessage('Drag the yellow Street View person or click a road on the project map.');setActiveProvider(null);setGoogleMatch(null);setKartaPhotos([]);setKartaIndex(0)
      return
    }
    // A new map click or provider change always restarts from loading.
    // Without this reset a previous success leaves status as 'ready', so the
    // new run never enters its loading state and a failed Google lookup never
    // reaches the KartaView fallback path below.
    setStatus('loading')
    setMessage('')
    const serial=++requestSerial.current
    const controller=new AbortController()
    let cancelled=false

    async function tryGoogle(){
      if(!googleApiKey)return false
      if(!googleNode.current)throw new Error('Google Street View container is unavailable.')
      const maps=await loadGoogleMaps(googleApiKey)
      const streetView=await withTimeout(Promise.resolve(maps.importLibrary('streetView')),GOOGLE_RUNTIME_TIMEOUT_MS,'Google Street View library timed out while initializing.')
      if(googleAuthFailureError)throw googleAuthFailureError
      if(cancelled||serial!==requestSerial.current)return false
      if(!googlePanoramaRef.current){
        googlePanoramaRef.current=new streetView.StreetViewPanorama(googleNode.current,{
          addressControl:true,clickToGo:true,fullscreenControl:true,linksControl:true,motionTracking:false,panControl:true,showRoadLabels:true,zoomControl:true,visible:false
        })
        const pano=googlePanoramaRef.current
        pano.addListener('pov_changed',()=>{scheduleViewReport()})
        pano.addListener('position_changed',()=>{scheduleViewReport()})
        pano.addListener('zoom_changed',()=>{scheduleViewReport()})
      }
      const service=new streetView.StreetViewService()
      const radii=[50,150,MAX_STREET_MATCH_DISTANCE_M]
      let found:any=null
      let foundRadius=0
      for(const radius of radii){
        const result=await withTimeout(new Promise<{data:any;status:any}>(resolve=>{
          service.getPanorama({location,radius,preference:streetView.StreetViewPreference.NEAREST,sources:[streetView.StreetViewSource.GOOGLE]},(data:any,resultStatus:any)=>resolve({data,status:resultStatus}))
        }),GOOGLE_PANORAMA_TIMEOUT_MS,`Google Street View search timed out at ${radius} m.`)
        if(cancelled||serial!==requestSerial.current)return false
        if(result.status===streetView.StreetViewStatus.OK&&result.data){found=result.data;foundRadius=radius;break}
        if(result.status!==streetView.StreetViewStatus.ZERO_RESULTS)throw new Error(`Google Street View request failed with status: ${String(result.status)}`)
      }
      if(!found)return false
      const panoLocation=found.location?.latLng
      const matched={lat:Number(panoLocation?.lat?.()??location.lat),lng:Number(panoLocation?.lng?.()??location.lng)}
      const panorama=googlePanoramaRef.current
      panorama.setPano(found.location?.pano);panorama.setPov({heading:0,pitch:0});panorama.setZoom(1);panorama.setVisible(true)
      const gmMatch={lat:matched.lat,lng:matched.lng,distanceM:distanceMeters(location,matched),radiusM:foundRadius,description:String(found.location?.shortDescription??found.location?.description??'Google Street View'),imageDate:String(found.imageDate??''),panoId:String(found.location?.pano??'')}
      setGoogleMatch(gmMatch)
      setKartaPhotos([]);setKartaIndex(0);setActiveProvider('google');setStatus('ready')
      setMessage('Official Google Street View panorama loaded. Drag inside the panorama for full 360-degree viewing and use the road arrows to move along coverage.')
      scheduleViewReport(50)
      return true
    }

    async function tryKartaView(){
      const photos=await withTimeout(findNearbyKartaView(location,controller.signal),KARTAVIEW_LOOKUP_TIMEOUT_MS,'KartaView lookup timed out. Try another road or retry the provider.')
      if(cancelled||serial!==requestSerial.current)return false
      if(!photos.length)return false
      let start=0,bestDistance=Number.POSITIVE_INFINITY
      photos.forEach((photo,index)=>{if(photo.distanceM<bestDistance){bestDistance=photo.distanceM;start=index}})
      try{googlePanoramaRef.current?.setVisible?.(false)}catch{}
      setGoogleMatch(null);setKartaPhotos(photos);setKartaIndex(start);setKartaUrlIndex(0);setActiveProvider('kartaview');setStatus('ready')
      setMessage('KartaView street imagery loaded. True spherical captures automatically open in interactive 360-degree mode; standard captures stay as normal street photos.')
      scheduleViewReport(50)
      return true
    }

    async function run(){
      // A new request invalidates every pending report from the previous one.
      lastReportRef.current=''
      if(viewReportTimeoutRef.current)window.clearTimeout(viewReportTimeoutRef.current)
      setStatus('loading');setMessage(providerMode==='google'?'Searching official Google Street View...':'Searching KartaView...')
      try{googlePanoramaRef.current?.setVisible?.(false)}catch{}
      setActiveProvider(null);setGoogleMatch(null);setKartaPhotos([]);setKartaIndex(0);setKartaUrlIndex(0);onPanoramaChangeRef.current?.({position:location,heading:null,povHeading:null,pitch:null,zoom:null,provider:null,panoId:null,googleMatch:null,kartaPhoto:null,status:'loading'})
      const reportMissing=()=>{setStatus('missing');onPanoramaChangeRef.current?.({position:location,heading:null,povHeading:null,pitch:null,zoom:null,provider:null,panoId:null,googleMatch:null,kartaPhoto:null,status:'missing'})}
      const reportError=(text:string)=>{setStatus('error');setMessage(text);onPanoramaChangeRef.current?.({position:location,heading:null,povHeading:null,pitch:null,zoom:null,provider:null,panoId:null,googleMatch:null,kartaPhoto:null,status:'error'})}
      try{
        if(providerMode==='google'){
          // The GIS atlas offers Google first, but Arkavathi river roads often
          // sit outside Google coverage, so a Google miss automatically falls
          // back to KartaView instead of stranding the panel on "missing".
          if(!googleApiKey){
            const kartaOk=await tryKartaView()
            if(kartaOk){
              setProviderMode('kartaview')
              setMessage('Google Street View needs VITE_GOOGLE_MAPS_API_KEY in frontend/.env.local (Vite restarted afterwards). Showing KartaView coverage instead.')
              return
            }
            reportError('Google Street View needs VITE_GOOGLE_MAPS_API_KEY in frontend/.env or frontend/.env.local. Add the key and restart Vite. KartaView also has no image near this location.')
            return
          }
          try{
            const ok=await tryGoogle()
            if(ok)return
            const kartaOk=await tryKartaView()
            if(kartaOk){
              setProviderMode('kartaview')
              setMessage('No official Google Street View panorama was found close to this target. Showing the nearest KartaView capture instead.')
              return
            }
            reportMissing();setMessage('No official Google Street View panorama was found close to this target, and KartaView has no public image nearby. Try another road.');return
          }catch(error){
            // Auth, quota and network failures surface here; a cached auth
            // failure would otherwise repeat the same Google error forever.
            // Give KartaView one automatic attempt before reporting an error.
            try{
              const kartaOk=await tryKartaView()
              if(kartaOk){
                setProviderMode('kartaview')
                setMessage(`Google Street View failed (${error instanceof Error?error.message:String(error)}). Showing the nearest KartaView capture instead.`)
                return
              }
            }catch{/* fall through to the Google error below */}
            throw error
          }
        }
        const ok=await tryKartaView()
        if(!ok){reportMissing();setMessage('KartaView responded successfully, but it has no public street image near this location. Try Google 360 or another road.');return}
      }catch(error){
        if(cancelled||(error as any)?.name==='AbortError')return
        setStatus('error');setMessage(error instanceof Error?error.message:String(error));onPanoramaChangeRef.current?.({position:location,heading:null,povHeading:null,pitch:null,zoom:null,provider:null,panoId:null,googleMatch:null,kartaPhoto:null,status:'error'})
      }
    }
    run()
    return()=>{cancelled=true;controller.abort()}
  },[location.lat,location.lng,providerMode,googleApiKey,active,retryNonce])

  function onKartaImageError(){
    if(!currentKarta)return
    if(kartaUrlIndex+1<currentKarta.urls.length){setKartaUrlIndex(index=>index+1);return}
    const text='KartaView found a capture, but every image URL supplied by the provider failed to load. Retry once or choose an adjacent capture.'
    setStatus('error');setMessage(text)
    onPanoramaChangeRef.current?.({position:locationRef.current,heading:null,povHeading:null,pitch:null,zoom:null,provider:null,panoId:null,googleMatch:null,kartaPhoto:null,status:'error'})
  }
  function onKartaImageLoad(event:SyntheticEvent<HTMLImageElement>){
    if(!currentKarta||!currentKartaUrl||isKarta360(currentKarta))return
    if(currentKarta.projection||currentKarta.fieldOfView!==null)return
    const image=event.currentTarget
    if(!image.naturalHeight)return
    const ratio=image.naturalWidth/image.naturalHeight
    if(ratio>=1.85&&ratio<=2.15)setRatioPanoramaUrl(currentKartaUrl)
  }
  function changeKarta(delta:number){
    if(!kartaPhotos.length)return
    const next=(kartaIndex+delta+kartaPhotos.length)%kartaPhotos.length
    setKartaIndex(next);setKartaUrlIndex(0);setRatioPanoramaUrl('')
  }
  function submitLocation(event:FormEvent){
    event.preventDefault();const lat=Number(latInput),lng=Number(lngInput)
    if(!validLocation(lat,lng)){setStatus('error');setMessage('Enter a valid latitude and longitude.');return}
    onLocationChange({lat,lng})
  }
  function goFullscreen(){fullscreenNode.current?.requestFullscreen?.()}

  const providerLabel=activeProvider==='google'?'Google Street View':activeProvider==='kartaview'?'KartaView':'Street View'
  const activeDistance=activeProvider==='google'?googleMatch?.distanceM:activeProvider==='kartaview'?currentKarta?.distanceM:null
  const activeDate=activeProvider==='google'?googleMatch?.imageDate:activeProvider==='kartaview'?currentKarta?.shotDate:''

  return <section className={`overflow-hidden rounded-2xl border border-slate-200 shadow-card ${workspaceFullscreen?'flex h-full min-h-0 flex-col':'self-start'} ${providerMode==='video'?'bg-slate-950':'bg-white'}`}>
    <div className={providerMode==='video'?(workspaceFullscreen?'block h-full min-h-0 flex-1':'block'):'hidden'}><SurveyVideoWorkspace onMapSyncChange={onVideoMapSyncChange} active={providerMode==='video'} onModeChange={setProviderMode} onExit={onExit} videoSeekRequest={videoSeekRequest} workspaceFullscreen={workspaceFullscreen} onWorkspaceFullscreenChange={onWorkspaceFullscreenChange}/></div>
    <div className={`${providerMode==='video'?'hidden':'flex'} flex-col gap-3 bg-navy-950 px-4 py-3 text-white lg:flex-row lg:items-center lg:justify-between`}>
      <div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><PersonStanding size={20}/></div><div><h2 className="font-black">Street View</h2><p className="text-xs text-blue-100">Google 360 + Video/SRT satellite-map playback + KartaView</p></div></div>
      <div className="flex flex-wrap items-center gap-2">
        {availableProviders.map(mode=><button key={mode} type="button" onClick={()=>setProviderMode(mode)} className={`rounded-lg px-3 py-2 text-[11px] font-black transition ${providerMode===mode?'bg-white text-navy-950':'bg-white/10 text-white hover:bg-white/15'}`}>{mode==='google'?'Google 360':mode==='video'?'Video + SRT':'KartaView'}</button>)}
        {onWorkspaceFullscreenChange&&<button type="button" aria-pressed={workspaceFullscreen} onClick={()=>onWorkspaceFullscreenChange(!workspaceFullscreen)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/45 bg-amber-400/15 px-3 py-2 text-[11px] font-black text-amber-100 hover:bg-amber-400/25" title={workspaceFullscreen?'Exit full workspace':'Fill the dashboard workspace while keeping the top header and left sidebar'}>{workspaceFullscreen?<Minimize2 size={14}/>:<Maximize2 size={14}/>} {workspaceFullscreen?'Exit Full Screen':'Full Screen'}</button>}
        {onExit&&<button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-[11px] font-black text-white hover:bg-white/20" data-street-control="exit" aria-label="Exit Street View" title="Exit Street View"><ArrowLeft size={19} strokeWidth={2} /></button>}
      </div>
    </div>

        {providerMode!=='video'&&<>
      <form onSubmit={submitLocation} className={`${workspaceFullscreen?'hidden':'grid'} gap-2 border-b border-slate-200 bg-white p-3 sm:grid-cols-[1fr_1fr_auto]`}>
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Latitude<input value={latInput} onChange={e=>setLatInput(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-navy-700"/></label>
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-500">Longitude<input value={lngInput} onChange={e=>setLngInput(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-navy-700"/></label>
        <button type="submit" className="mt-auto inline-flex h-[34px] items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-3 text-xs font-black text-white" data-street-control="locate" aria-label="Locate" title="Locate"><LocateFixed size={18} strokeWidth={2} /></button>
      </form>

      <div ref={fullscreenNode} className={`relative overflow-hidden bg-slate-950 ${workspaceFullscreen?'min-h-[300px] flex-1':'h-[470px]'}`}>
        <div ref={googleNode} className={`absolute inset-0 h-full w-full ${(providerMode==='google'&&status==='loading')||(activeProvider==='google'&&status==='ready')?'visible pointer-events-auto':'invisible pointer-events-none'}`}/>
        {activeProvider==='kartaview'&&currentKarta&&status==='ready'&&currentKartaUrl&&<div className="relative h-full w-full bg-black">
          {currentKarta360?<StreetPanorama360 key={currentKartaPanoramaUrl} src={currentKartaPanoramaUrl} heading={currentKarta.heading} onImageError={onKartaImageError}/>:<img key={currentKartaUrl} src={currentKartaUrl} alt="KartaView street-level capture" onLoad={onKartaImageLoad} onError={onKartaImageError} className="h-full w-full object-contain"/>}
          <div className={`absolute left-3 ${currentKarta360?'top-12':'top-3'} rounded-lg px-2.5 py-1.5 text-[10px] font-black text-white backdrop-blur ${currentKarta360?'bg-emerald-700/85':'bg-black/70'}`}>{currentKarta360?'360° PANORAMA':'STANDARD STREET IMAGE'}{currentKarta.projection?` · ${currentKarta.projection}`:''}{typeof currentKarta.fieldOfView==='number'?` · FOV ${Math.round(currentKarta.fieldOfView)}°`:''}</div>
          {kartaPhotos.length>1&&<><button type="button" onClick={()=>changeKarta(-1)} className="absolute left-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-black/80" title="Previous street position"><ChevronLeft size={22}/></button><button type="button" onClick={()=>changeKarta(1)} className="absolute right-3 top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-black/65 text-white hover:bg-black/80" title="Next street position"><ChevronRight size={22}/></button></>}
          <div className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[10px] font-bold text-white">Frame {kartaIndex+1} / {kartaPhotos.length}</div>
        </div>}
        {status==='loading'&&<div className="absolute inset-0 grid place-items-center bg-slate-950/90 text-white"><div className="rounded-2xl bg-slate-900 px-5 py-4 text-center shadow-xl"><Loader2 className="mx-auto animate-spin" size={26}/><div className="mt-2 text-sm font-black">Finding street imagery...</div><div className="mt-1 text-[11px] text-slate-300">Checking the selected coordinates directly</div></div></div>}
        {status==='missing'&&<div className="absolute inset-0 grid place-items-center bg-slate-950/95 p-6 text-center text-white"><div className="max-w-md"><MapPin className="mx-auto text-amber-300" size={30}/><div className="mt-3 text-lg font-black">No provider imagery at this location</div><p className="mt-2 text-sm leading-6 text-slate-300">{message}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={()=>setRetryNonce(v=>v+1)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-black text-slate-900"><RefreshCw size={14}/>Retry</button>{onExit&&<button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-black text-white"><ArrowLeft size={14}/>Back to GIS Map</button>}</div></div></div>}
        {status==='error'&&<div className="absolute inset-0 grid place-items-center bg-rose-950/95 p-6 text-center text-white"><div className="max-w-md"><AlertCircle className="mx-auto" size={30}/><div className="mt-3 text-lg font-black">Street imagery service could not load</div><p className="mt-2 break-words text-sm leading-6 text-rose-100">{message}</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button type="button" onClick={()=>setRetryNonce(v=>v+1)} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-black text-rose-950"><RefreshCw size={14}/>Retry</button>{providerMode==='google'&&!googleApiKey&&<button type="button" onClick={()=>setProviderMode('kartaview')} className="rounded-lg border border-white/30 px-3 py-2 text-xs font-black text-white">Use KartaView</button>}{onExit&&<button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-black text-white"><ArrowLeft size={14}/>Back to GIS Map</button>}</div></div></div>}
        {status==='idle'&&<div className="absolute inset-0 grid place-items-center p-6 text-center text-slate-300"><div className="max-w-md"><PersonStanding className="mx-auto text-amber-300" size={36}/><div className="mt-3 font-black text-white">Drag the yellow person or click a road</div><p className="mt-2 text-sm leading-6 text-slate-400">Choose Google 360 for official native panoramas, or KartaView for public street imagery. Use Video + SRT when the uploaded video should drive only the SRT GPS route and moving position on the left satellite map.</p>{onExit&&<button type="button" onClick={onExit} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-2 text-xs font-black text-white"><ArrowLeft size={14}/>Back to GIS Map</button>}</div></div>}
        {status==='ready'&&<button type="button" onClick={goFullscreen} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-lg bg-black/65 text-white hover:bg-black/80" title="Fullscreen"><Maximize2 size={17}/></button>}
      </div>

      <div className={`${workspaceFullscreen?'hidden':'grid'} gap-3 p-4 sm:grid-cols-2`}>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500"><Navigation size={13}/>Requested project location</div><div className="mt-1 font-mono text-xs font-bold text-slate-900">{targetLabel}</div></div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-500">{status==='ready'?<CheckCircle2 size={13} className="text-emerald-600"/>:<MapPin size={13}/>}Nearest imagery</div>{status==='ready'?<><div className="mt-1 flex flex-wrap items-center gap-2"><span className="text-xs font-black text-slate-900">{providerLabel}</span>{typeof activeDistance==='number'&&<span className="text-[11px] text-slate-500">{Math.round(activeDistance).toLocaleString()} m from target</span>}</div><div className="mt-1 text-[11px] text-slate-500">{activeDate?`Captured ${activeDate}`:'Capture date unavailable'}{typeof activeHeading==='number'?` · heading ${Math.round(activeHeading)}°`:''}{activeProvider==='google'?' · native interactive 360°':''}{activeProvider==='kartaview'&&currentKarta?` · ${currentKarta360?'interactive 360°':'standard image'}`:''}</div>{activeProvider==='google'&&googleMatch&&<a href={googleMapsUrl({lat:googleMatch.lat,lng:googleMatch.lng})} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-navy-800 hover:underline"><ExternalLink size={12}/>Open in Google Maps</a>}{activeProvider==='kartaview'&&currentKarta&&<a href={kartaDetailsUrl(currentKarta)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-black text-navy-800 hover:underline"><ExternalLink size={12}/>Open in KartaView</a>}</>:<div className="mt-1 text-xs text-slate-500">{message||'Waiting for a project-map location.'}</div>}</div>
      </div>
    </>}
  </section>
}
