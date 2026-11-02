import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { Crosshair, Factory, Layers3, LocateFixed, MapPin, MousePointer2, Pause, Play, RotateCcw, PersonStanding, Loader2, Route as RouteIcon } from 'lucide-react'
import { api } from '../lib/api'
import type { FlightDetail, IndustryCandidate, IndustryObservation, IndustryRiverContext, Summary, TrackPoint } from '../lib/types'

const dayColors: Record<number,string> = {
  3:'#22d3ee',
  4:'#3b82f6',
  5:'#22c55e',
  6:'#f59e0b',
  7:'#ef4444',
  8:'#a855f7'
}

const satelliteStyle:any = {
  version:8,
  sources:{
    satellite:{
      type:'raster',
      tiles:[
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      ],
      tileSize:256,
      maxzoom:18,
      attribution:'Tiles (c) Esri'
    }
  },
  layers:[
    {
      id:'satellite',
      type:'raster',
      source:'satellite'
    }
  ]
}

const streetStyle:any = {
  version:8,
  sources:{
    osm:{
      type:'raster',
      tiles:[
        'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
      ],
      tileSize:256,
      maxzoom:19,
      attribution:'© OpenStreetMap contributors'
    }
  },
  layers:[
    {
      id:'osm',
      type:'raster',
      source:'osm'
    }
  ]
}


function industryObservationGeoJson(rows:IndustryObservation[]){
  return {type:'FeatureCollection',features:rows.map(row=>({type:'Feature',id:row.public_id,properties:{id:row.public_id,name:row.name||'Unnamed industrial site',status:row.status,discharge_status:row.discharge_status,video_name:row.video_name,video_time_seconds:row.video_time_seconds},geometry:{type:'Point',coordinates:[row.longitude,row.latitude]}}))}
}

function installIndustryObservationLayers(map:MlMap,registerPopup:(popup:maplibregl.Popup)=>void){
  if(!map.getSource('industry-observations'))map.addSource('industry-observations',{type:'geojson',data:industryObservationGeoJson([]) as any})
  if(!map.getLayer('industry-observations-glow'))map.addLayer({id:'industry-observations-glow',type:'circle',source:'industry-observations',paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,8,15,14,19,20],'circle-color':['match',['get','status'],'VERIFIED','#16a34a','VERIFICATION_REQUIRED','#e11d48','RECORD_NOT_AVAILABLE','#64748b','#f59e0b'],'circle-opacity':.28,'circle-blur':.55}} as any)
  if(!map.getLayer('industry-observations-point'))map.addLayer({id:'industry-observations-point',type:'circle',source:'industry-observations',paint:{'circle-radius':['interpolate',['linear'],['zoom'],8,4.5,15,7.5,19,10],'circle-color':['match',['get','status'],'VERIFIED','#16a34a','VERIFICATION_REQUIRED','#e11d48','RECORD_NOT_AVAILABLE','#64748b','#f59e0b'],'circle-stroke-color':'#ffffff','circle-stroke-width':2}} as any)
  for(const layer of ['industry-observations-glow','industry-observations-point'])map.setLayoutProperty(layer,'visibility','none')
  map.on('mouseenter','industry-observations-point',()=>map.getCanvas().style.cursor='pointer')
  map.on('mouseleave','industry-observations-point',()=>map.getCanvas().style.cursor='')
  map.on('click','industry-observations-point',(event:any)=>{
    const feature=event.features?.[0];if(!feature)return
    const p=feature.properties??{};const coords=(feature.geometry as any)?.coordinates
    if(!Array.isArray(coords)||coords.length<2)return
    const root=document.createElement('div');root.className='ge-popup-root'
    const title=document.createElement('div');title.className='ge-popup-title';title.textContent=String(p.name||'Industry observation');root.append(title)
    const table=document.createElement('div');table.className='ge-popup-table'
    addGeRow(table,'Candidate ID',String(p.id||'â€”'));addGeRow(table,'Status',String(p.status||'â€”').replace(/_/g,' '));addGeRow(table,'Discharge',String(p.discharge_status||'UNKNOWN'));addGeRow(table,'Video',String(p.video_name||'â€”'));addGeRow(table,'Time',formatIndustryVideoTime(Number(p.video_time_seconds||0)));addGeRow(table,'Latitude',Number(coords[1]).toFixed(6));addGeRow(table,'Longitude',Number(coords[0]).toFixed(6));root.append(table)
    const footer=document.createElement('div');footer.className='ge-popup-footer';footer.textContent='Video + SRT industry survey evidence';root.append(footer)
    const popup=new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:'390px',className:'arkavathi-google-earth-popup'}).setLngLat([Number(coords[0]),Number(coords[1])]).setDOMContent(root).addTo(map)
    registerPopup(popup)
  })
}

function setIndustryObservationVisibility(map:MlMap,visible:boolean){for(const layer of ['industry-observations-glow','industry-observations-point'])if(map.getLayer(layer))map.setLayoutProperty(layer,'visibility',visible?'visible':'none')}
function formatIndustryVideoTime(seconds:number){const safe=Math.max(0,Number.isFinite(seconds)?seconds:0);const m=Math.floor(safe/60),s=Math.floor(safe%60);return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}

type StreetLocation = {lat:number;lng:number}
type VideoSyncSample = {time:number;lat:number;lng:number}
type CoverageLine = [number,number][]
type CoverageState = 'idle'|'loading'|'ready'|'empty'|'error'
type CoverageTile = {x:number;y:number;z:number;key:string}

const emptyCoverage:any={type:'FeatureCollection',features:[]}
const coverageCache=new Map<string,CoverageLine[]>()

function clamp(value:number,min:number,max:number){return Math.max(min,Math.min(max,value))}

function tileXY(lat:number,lng:number,zoom:number){
  const safeLat=clamp(lat,-85.05112878,85.05112878)
  const safeLng=clamp(lng,-180,180)
  const n=2**zoom
  const x=Math.floor(n*((safeLng+180)/360))
  const latRad=safeLat*Math.PI/180
  const y=Math.floor(n*(1-(Math.log(Math.tan(latRad)+1/Math.cos(latRad))/Math.PI))/2)
  return {x:clamp(x,0,n-1),y:clamp(y,0,n-1)}
}

function coverageTilesForMap(map:MlMap):CoverageTile[]{
  const bounds=map.getBounds()
  let z=clamp(Math.floor(map.getZoom()),6,18)
  const build=(zoom:number)=>{
    const nw=tileXY(bounds.getNorth(),bounds.getWest(),zoom)
    const se=tileXY(bounds.getSouth(),bounds.getEast(),zoom)
    const tiles:CoverageTile[]=[]
    const n=2**zoom
    const xStart=Math.min(nw.x,se.x),xEnd=Math.max(nw.x,se.x)
    const yStart=Math.min(nw.y,se.y),yEnd=Math.max(nw.y,se.y)
    for(let x=xStart;x<=xEnd;x++)for(let y=yStart;y<=yEnd;y++)tiles.push({x,y,z:zoom,key:`${zoom}/${x}/${y}`})
    return tiles
  }
  let tiles=build(z)
  while(tiles.length>48&&z>5){z--;tiles=build(z)}
  return tiles.slice(0,48)
}

function extractCoverageLines(payload:any):CoverageLine[]{
  const lines:CoverageLine[]=[]
  const addLine=(coords:any)=>{
    if(!Array.isArray(coords))return
    const line:CoverageLine=coords.flatMap((coord:any)=>{
      if(Array.isArray(coord)&&coord.length>=2){
        const lng=Number(coord[0]),lat=Number(coord[1])
        return Number.isFinite(lng)&&Number.isFinite(lat)?[[lng,lat] as [number,number]]:[]
      }
      if(coord&&typeof coord==='object'){
        const lng=Number(coord.lng??coord.lon??coord.longitude),lat=Number(coord.lat??coord.latitude)
        return Number.isFinite(lng)&&Number.isFinite(lat)?[[lng,lat] as [number,number]]:[]
      }
      return []
    })
    if(line.length>=2)lines.push(line)
  }
  const visit=(node:any)=>{
    if(!node||typeof node!=='object')return
    if(node.type==='LineString'){addLine(node.coordinates);return}
    if(node.type==='MultiLineString'){if(Array.isArray(node.coordinates))node.coordinates.forEach(addLine);return}
    if(node.type==='Feature'){visit(node.geometry);return}
    if(node.type==='FeatureCollection'){if(Array.isArray(node.features))node.features.forEach(visit);return}
    // KartaView JSON coverage format: { lines: [{ track: [{lat,lng}, ...] }] }
    if(Array.isArray(node.lines)){
      node.lines.forEach((item:any)=>{
        if(Array.isArray(item?.track))addLine(item.track)
        else visit(item)
      })
    }
    if(node.geometry)visit(node.geometry)
    if(Array.isArray(node.features))node.features.forEach(visit)
  }
  visit(payload)
  return lines
}

async function fetchCoverageResponse(url:string,signal:AbortSignal){
  const controller=new AbortController()
  const onAbort=()=>controller.abort()
  signal.addEventListener('abort',onAbort,{once:true})
  const timer=window.setTimeout(()=>controller.abort(),8000)
  try{
    const response=await fetch(url,{signal:controller.signal,headers:{Accept:'application/json, application/geo+json'}})
    if(!response.ok)throw new Error(`HTTP ${response.status}`)
    const text=await response.text()
    try{return JSON.parse(text)}catch{throw new Error('KartaView coverage response was not valid JSON')}
  }catch(error){
    if((error as any)?.name==='AbortError'&&!signal.aborted)throw new Error('Coverage request timed out after 8 seconds')
    throw error
  }finally{
    window.clearTimeout(timer)
    signal.removeEventListener('abort',onAbort)
  }
}

async function fetchCoverageTile(tile:CoverageTile,signal:AbortSignal):Promise<CoverageLine[]>{
  const cached=coverageCache.get(tile.key)
  if(cached)return cached
  const base=`/kartaview-api/2.0/sequence/tiles/${tile.x}/${tile.y}/${tile.z}`
  let lastError:unknown=null
  for(const extension of ['geojson','json']){
    try{
      const payload=await fetchCoverageResponse(`${base}.${extension}`,signal)
      const lines=extractCoverageLines(payload)
      coverageCache.set(tile.key,lines)
      return lines
    }catch(error){
      if((error as any)?.name==='AbortError')throw error
      lastError=error
    }
  }
  throw lastError instanceof Error?lastError:new Error(`Coverage tile ${tile.key} could not be loaded`)
}

function coverageGeoJson(lines:CoverageLine[]){
  return {type:'FeatureCollection',features:lines.map((coordinates,index)=>({type:'Feature',id:index,properties:{provider:'KartaView'},geometry:{type:'LineString',coordinates}}))}
}

function nearestCoveragePoint(location:StreetLocation,lines:CoverageLine[]):{location:StreetLocation;distanceM:number}|null{
  let best:{location:StreetLocation;distanceM:number}|null=null
  const latScale=111320
  const lngScale=Math.max(1,111320*Math.cos(location.lat*Math.PI/180))
  for(const line of lines){
    for(let i=1;i<line.length;i++){
      const a=line[i-1],b=line[i]
      const ax=(a[0]-location.lng)*lngScale,ay=(a[1]-location.lat)*latScale
      const bx=(b[0]-location.lng)*lngScale,by=(b[1]-location.lat)*latScale
      const dx=bx-ax,dy=by-ay
      const len2=dx*dx+dy*dy
      const t=len2>0?clamp(-(ax*dx+ay*dy)/len2,0,1):0
      const px=ax+t*dx,py=ay+t*dy
      const distanceM=Math.sqrt(px*px+py*py)
      if(!best||distanceM<best.distanceM){
        best={location:{lng:location.lng+px/lngScale,lat:location.lat+py/latScale},distanceM}
      }
    }
  }
  return best
}

function snapLimitMeters(map:MlMap,lat:number){
  const metersPerPixel=156543.03392*Math.cos(lat*Math.PI/180)/(2**map.getZoom())
  return clamp(metersPerPixel*28,35,350)
}

function installCoverageLayers(map:MlMap){
  // Official KartaView PNG coverage is kept as a visual fallback. This is important
  // because the GeoJSON/JSON geometry service can intermittently fail even while
  // public imagery remains reachable.
  if(!map.getSource('street-coverage-raster'))map.addSource('street-coverage-raster',{
    type:'raster',
    tiles:['/kartaview-api/2.0/sequence/tiles/{x}/{y}/{z}.png'],
    tileSize:256,
    minzoom:0,
    maxzoom:18
  } as any)
  const rasterBefore=map.getLayer('tracks-line')?'tracks-line':undefined
  if(!map.getLayer('street-coverage-raster'))map.addLayer({
    id:'street-coverage-raster',type:'raster',source:'street-coverage-raster',
    paint:{'raster-opacity':.72,'raster-hue-rotate':-55,'raster-saturation':.35,'raster-contrast':.15}
  } as any,rasterBefore)

  if(!map.getSource('street-coverage'))map.addSource('street-coverage',{type:'geojson',data:emptyCoverage})
  const before=map.getLayer('track-points-circle')?'track-points-circle':undefined
  if(!map.getLayer('street-coverage-glow'))map.addLayer({id:'street-coverage-glow',type:'line',source:'street-coverage',paint:{'line-color':'#93c5fd','line-width':['interpolate',['linear'],['zoom'],6,3,12,8,18,14],'line-opacity':.46,'line-blur':1.5}},before)
  if(!map.getLayer('street-coverage-line'))map.addLayer({id:'street-coverage-line',type:'line',source:'street-coverage',paint:{'line-color':'#0ea5e9','line-width':['interpolate',['linear'],['zoom'],6,1.4,12,3.5,18,6.5],'line-opacity':.98}},before)
}

function makePegmanElement(){
  const el=document.createElement('div')
  el.setAttribute('aria-label','Drag Street View person onto a blue imagery line')
  el.title='Drag onto a blue Street View coverage line'
  el.style.width='38px';el.style.height='52px';el.style.cursor='grab';el.style.userSelect='none';el.style.touchAction='none';el.style.filter='drop-shadow(0 4px 5px rgba(15,23,42,.45))'
  el.innerHTML='<svg viewBox="0 0 38 52" width="38" height="52" aria-hidden="true"><circle cx="19" cy="9" r="7" fill="#facc15" stroke="#713f12" stroke-width="2.2"/><path d="M12 19c0-3 2-5 5-5h4c3 0 5 2 5 5v12l5 8c1 2 0 4-2 5s-4 0-5-2l-5-7-5 7c-1 2-3 3-5 2s-3-3-2-5l5-8V19z" fill="#facc15" stroke="#713f12" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 22 5 30M26 22l7 8" fill="none" stroke="#713f12" stroke-width="3" stroke-linecap="round"/></svg>'
  return el
}

function videoTrackLine(track:VideoSyncSample[]){
  if(track.length<2)return {type:'FeatureCollection',features:[]} as any
  const maxPoints=8000
  const step=Math.max(1,Math.ceil(track.length/maxPoints))
  const coords=track.filter((_,i)=>i%step===0||i===track.length-1).map(p=>[p.lng,p.lat])
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'route'},geometry:{type:'LineString',coordinates:coords}}]} as any
}

function videoClockToSrtTime(track:VideoSyncSample[],videoTime:number,videoDuration:number){
  if(track.length<2)return videoTime
  const start=Number(track[0].time),end=Number(track[track.length-1].time)
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return videoTime
  if(Number.isFinite(videoDuration)&&videoDuration>0){
    const ratio=clamp(videoTime/videoDuration,0,1)
    return start+ratio*(end-start)
  }
  return videoTime
}

function videoProgressLine(track:VideoSyncSample[],videoTime:number,location:StreetLocation|null,videoDuration=0){
  if(!track.length||!location)return {type:'FeatureCollection',features:[]} as any
  const time=videoClockToSrtTime(track,videoTime,videoDuration)
  let hi=0
  while(hi<track.length&&track[hi].time<=time)hi++
  const upto=Math.max(1,hi)
  const maxPoints=8000
  const step=Math.max(1,Math.ceil(upto/maxPoints))
  const coords:[number,number][]=[]
  for(let i=0;i<upto;i+=step)coords.push([track[i].lng,track[i].lat])
  const last=coords[coords.length-1]
  if(!last||Math.abs(last[0]-location.lng)>1e-10||Math.abs(last[1]-location.lat)>1e-10)coords.push([location.lng,location.lat])
  if(coords.length<2)coords.unshift([location.lng,location.lat])
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'progress'},geometry:{type:'LineString',coordinates:coords}}]} as any
}

function videoTrackEndpoints(track:VideoSyncSample[]){
  if(!track.length)return {type:'FeatureCollection',features:[]} as any
  const first=track[0],last=track[track.length-1]
  return {type:'FeatureCollection',features:[
    {type:'Feature',properties:{kind:'start',label:'SRT Start'},geometry:{type:'Point',coordinates:[first.lng,first.lat]}},
    {type:'Feature',properties:{kind:'end',label:'SRT End'},geometry:{type:'Point',coordinates:[last.lng,last.lat]}}
  ]} as any
}

function fitVideoSrtRoute(map:MlMap,track:VideoSyncSample[],duration=600){
  if(!track.length)return
  const first=track[0]
  const bounds=track.reduce((b,p)=>b.extend([p.lng,p.lat] as [number,number]),new maplibregl.LngLatBounds([first.lng,first.lat],[first.lng,first.lat]))
  map.fitBounds(bounds,{padding:{top:105,right:105,bottom:115,left:105},maxZoom:17,duration})
}

function videoProgressPercent(track:VideoSyncSample[],videoTime:number,videoDuration=0){
  if(track.length<2)return 0
  const start=Number(track[0].time),end=Number(track[track.length-1].time)
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return 0
  const time=videoClockToSrtTime(track,videoTime,videoDuration)
  return clamp(((time-start)/(end-start))*100,0,100)
}

function svgRoutePath(points:{x:number;y:number}[]){
  if(points.length<2)return ''
  return points.map((point,index)=>`${index?'L':'M'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
}

function projectedVideoRoute(map:MlMap,track:VideoSyncSample[],maxPoints=1200){
  if(!track.length)return [] as {x:number;y:number}[]
  const step=Math.max(1,Math.ceil(track.length/maxPoints))
  const selected=track.filter((_,index)=>index%step===0||index===track.length-1)
  return selected.map(point=>map.project([point.lng,point.lat])).map(point=>({x:point.x,y:point.y}))
}

function projectedVideoProgress(map:MlMap,track:VideoSyncSample[],videoTime:number,videoDuration:number,location:StreetLocation|null,maxPoints=1200){
  if(!track.length||!location)return [] as {x:number;y:number}[]
  const alignedTime=videoClockToSrtTime(track,videoTime,videoDuration)
  let hi=0
  while(hi<track.length&&track[hi].time<=alignedTime)hi++
  const upto=Math.max(1,hi)
  const step=Math.max(1,Math.ceil(upto/maxPoints))
  const projected:{x:number;y:number}[]=[]
  for(let index=0;index<upto;index+=step){const point=map.project([track[index].lng,track[index].lat]);projected.push({x:point.x,y:point.y})}
  const current=map.project([location.lng,location.lat]);projected.push({x:current.x,y:current.y})
  return projected
}

function drawVideoSrtOverlay(map:MlMap,svg:SVGSVGElement,track:VideoSyncSample[],videoTime:number,videoDuration:number,location:StreetLocation|null){
  const width=map.getContainer().clientWidth,height=map.getContainer().clientHeight
  if(width<=0||height<=0||track.length<2){svg.innerHTML='';return}
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('width',String(width));svg.setAttribute('height',String(height))
  const route=projectedVideoRoute(map,track),progress=projectedVideoProgress(map,track,videoTime,videoDuration,location)
  const routePath=svgRoutePath(route),progressPath=svgRoutePath(progress)
  const first=map.project([track[0].lng,track[0].lat]),last=map.project([track[track.length-1].lng,track[track.length-1].lat])
  const current=location?map.project([location.lng,location.lat]):null
  const endpoint=(point:{x:number;y:number},label:string,color:string)=>`<g transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"><circle r="10" fill="${color}" stroke="#fff" stroke-width="3"/><text x="0" y="3.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="8" font-weight="900" fill="#fff">${label==='START'?'S':'E'}</text></g>`
  const currentSvg=current?`<g transform="translate(${current.x.toFixed(1)} ${current.y.toFixed(1)})"><circle r="17" fill="none" stroke="rgba(250,204,21,.52)" stroke-width="6"/><circle r="10" fill="#facc15" stroke="#fff" stroke-width="4"/></g>`:''
  svg.innerHTML=`<g data-video2-route-overlay="1"><path d="${routePath}" fill="none" stroke="rgba(15,23,42,.85)" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="${routePath}" fill="none" stroke="#f8fafc" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>${progressPath?`<path d="${progressPath}" fill="none" stroke="rgba(120,53,15,.55)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="${progressPath}" fill="none" stroke="#f59e0b" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`:''}${endpoint(first,'START','#16a34a')}${endpoint(last,'END','#e11d48')}${currentSvg}</g>`
}

function videoTrackSamplePoints(track:VideoSyncSample[]){
  if(!track.length)return {type:'FeatureCollection',features:[]} as any
  const maxPoints=500;const step=Math.max(1,Math.ceil(track.length/maxPoints))
  const selected=track.filter((_,i)=>i%step===0||i===track.length-1)
  return {type:'FeatureCollection',features:selected.map((point,index)=>({type:'Feature',id:index,properties:{time:point.time},geometry:{type:'Point',coordinates:[point.lng,point.lat]}}))} as any
}

function installVideoSyncLayers(map:MlMap){
  const empty:any={type:'FeatureCollection',features:[]}
  if(!map.getSource('video-srt-route'))map.addSource('video-srt-route',{type:'geojson',data:empty})
  const before=map.getLayer('track-points-circle')?'track-points-circle':undefined
  if(!map.getLayer('video-srt-route-glow'))map.addLayer({id:'video-srt-route-glow',type:'line',source:'video-srt-route',paint:{'line-color':'#0f172a','line-width':['interpolate',['linear'],['zoom'],7,5,14,9,18,13],'line-opacity':.65,'line-blur':1.2}},before)
  if(!map.getLayer('video-srt-route-line'))map.addLayer({id:'video-srt-route-line',type:'line',source:'video-srt-route',paint:{'line-color':'#f8fafc','line-width':['interpolate',['linear'],['zoom'],7,3,14,6,18,9],'line-opacity':1}},before)
  if(!map.getSource('video-srt-progress'))map.addSource('video-srt-progress',{type:'geojson',data:empty})
  if(!map.getLayer('video-srt-progress-glow'))map.addLayer({id:'video-srt-progress-glow',type:'line',source:'video-srt-progress',paint:{'line-color':'#f59e0b','line-width':['interpolate',['linear'],['zoom'],7,6,14,10,18,15],'line-opacity':.35,'line-blur':2}},before)
  if(!map.getLayer('video-srt-progress-line'))map.addLayer({id:'video-srt-progress-line',type:'line',source:'video-srt-progress',paint:{'line-color':'#f59e0b','line-width':['interpolate',['linear'],['zoom'],7,3.5,14,7,18,10],'line-opacity':1}},before)
  if(!map.getSource('video-srt-samples'))map.addSource('video-srt-samples',{type:'geojson',data:empty})
  if(!map.getLayer('video-srt-samples'))map.addLayer({id:'video-srt-samples',type:'circle',source:'video-srt-samples',paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,1.5,15,2.8,18,4],'circle-color':'#f8fafc','circle-opacity':.9,'circle-stroke-color':'#0f172a','circle-stroke-width':.7}},before)
  if(!map.getSource('video-srt-endpoints'))map.addSource('video-srt-endpoints',{type:'geojson',data:empty})
  if(!map.getLayer('video-srt-endpoints'))map.addLayer({id:'video-srt-endpoints',type:'circle',source:'video-srt-endpoints',paint:{'circle-radius':['interpolate',['linear'],['zoom'],10,8,15,10,18,12],'circle-color':['match',['get','kind'],'start','#22c55e','#ef4444'],'circle-stroke-color':'#ffffff','circle-stroke-width':3}},before)
  if(!map.getLayer('video-srt-endpoints-label'))map.addLayer({id:'video-srt-endpoints-label',type:'symbol',source:'video-srt-endpoints',layout:{'text-field':['match',['get','kind'],'start','START','END'],'text-size':12,'text-offset':[0,1.45],'text-anchor':'top','text-allow-overlap':true,'text-ignore-placement':true},paint:{'text-color':['match',['get','kind'],'start','#dcfce7','#fee2e2'],'text-halo-color':'#0f172a','text-halo-width':2}},before)
}

function setVideoSyncVisibility(map:MlMap,visible:boolean){
  for(const layer of ['video-srt-route-glow','video-srt-route-line','video-srt-progress-glow','video-srt-progress-line','video-srt-samples','video-srt-endpoints','video-srt-endpoints-label']){
    if(map.getLayer(layer))map.setLayoutProperty(layer,'visibility',visible?'visible':'none')
  }
}

function setCoverageVisibility(map:MlMap,visible:boolean){
  for(const layer of ['street-coverage-raster','street-coverage-glow','street-coverage-line']){
    if(map.getLayer(layer))map.setLayoutProperty(layer,'visibility',visible?'visible':'none')
  }
}

function setProjectDataVisibility(map:MlMap,visible:boolean,showPoints:boolean){
  for(const layer of ['tracks-line','endpoints-circle','endpoints-label']){
    if(map.getLayer(layer))map.setLayoutProperty(layer,'visibility',visible?'visible':'none')
  }
  if(map.getLayer('track-points-circle'))map.setLayoutProperty('track-points-circle','visibility',(visible&&showPoints)?'visible':'none')
}

// MapLibre's loaded() becomes false while raster tiles or camera transitions are still active.
// Route/source installation only needs the style to exist. Retry on styledata so Video+SRT
// cannot end up with an HTML GPS marker but missing GeoJSON route layers.
function whenMapStyleReady(map:MlMap,apply:()=>void){
  let cancelled=false
  const run=()=>{
    if(cancelled)return false
    try{
      if(map.isStyleLoaded()){apply();return true}
    }catch{}
    return false
  }
  if(run())return()=>{cancelled=true}
  const onStyle=()=>{if(run())try{map.off('styledata',onStyle)}catch{}}
  map.on('styledata',onStyle)
  return()=>{cancelled=true;try{map.off('styledata',onStyle)}catch{}}
}

function makeSrtEndpointMarker(kind:'start'|'end'){
  const isStart=kind==='start'
  const root=document.createElement('div')
  root.dataset.videoSrtEndpoint=kind
  root.style.display='flex';root.style.flexDirection='column';root.style.alignItems='center';root.style.pointerEvents='none';root.style.zIndex='35'
  root.style.filter='drop-shadow(0 3px 6px rgba(15,23,42,.7))'
  const badge=document.createElement('div')
  badge.textContent=isStart?'START':'END'
  badge.style.padding='3px 7px';badge.style.borderRadius='9999px';badge.style.fontSize='10px';badge.style.fontWeight='900'
  badge.style.letterSpacing='.04em';badge.style.color='white';badge.style.background=isStart?'#16a34a':'#e11d48';badge.style.border='2px solid white'
  const dot=document.createElement('div')
  dot.style.width='18px';dot.style.height='18px';dot.style.marginTop='2px';dot.style.borderRadius='9999px'
  dot.style.background=isStart?'#22c55e':'#f43f5e';dot.style.border='4px solid white';dot.style.boxShadow='0 0 0 3px rgba(15,23,42,.55)'
  root.append(badge,dot)
  return root
}

function makeVideoGpsMarker(){
  const root=document.createElement('div')
  root.title='Current SRT GPS position'
  root.setAttribute('aria-label','Current SRT GPS position')
  root.style.width='38px';root.style.height='38px';root.style.display='grid';root.style.placeItems='center';root.style.position='relative';root.style.pointerEvents='none';root.style.zIndex='40'
  const halo=document.createElement('div')
  halo.style.position='absolute';halo.style.inset='0';halo.style.border='4px solid rgba(250,204,21,.52)';halo.style.borderRadius='9999px';halo.style.boxShadow='0 0 0 5px rgba(15,23,42,.22)'
  const dot=document.createElement('div')
  dot.style.width='22px';dot.style.height='22px';dot.style.borderRadius='9999px';dot.style.background='#facc15';dot.style.border='4px solid white';dot.style.boxShadow='0 3px 10px rgba(0,0,0,.55)'
  const arrow=document.createElement('div')
  arrow.dataset.videoGpsHeading='1';arrow.style.position='absolute';arrow.style.top='-9px';arrow.style.left='15px';arrow.style.width='0';arrow.style.height='0';arrow.style.borderLeft='4px solid transparent';arrow.style.borderRight='4px solid transparent';arrow.style.borderBottom='10px solid #facc15';arrow.style.transformOrigin='4px 28px';arrow.style.display='none'
  root.append(halo,dot,arrow)
  return root
}


function industryDisplayName(candidate:IndustryCandidate){
  return String(candidate.display_name||candidate.name||'Industrial site')
}

function industryIdentityBadge(candidate:IndustryCandidate){
  if(candidate.identity_status==='OFFICIAL_KIADB_ALLOTTEE'||candidate.source==='KIADB'&&candidate.metadata?.allottee)return 'KIADB ALLOTTEE'
  if(candidate.identity_status==='NAMED_OSM_INDUSTRY'||candidate.metadata?.identity_confidence==='NAMED_MAP_FEATURE')return 'OSM NAME'
  if(candidate.identity_status==='NEARBY_GOOGLE_PLACES_MATCH')return 'BUSINESS MATCH'
  return 'ID UNVERIFIED'
}

function industryGeoJson(candidates:IndustryCandidate[]){
  return {type:'FeatureCollection',features:candidates.map(candidate=>({
    type:'Feature',
    id:candidate.id,
    properties:{
      id:candidate.id,name:industryDisplayName(candidate),display_name:industryDisplayName(candidate),source:candidate.source,source_id:candidate.source_id,identity_source:candidate.identity_source||String(candidate.metadata?.identity_source??''),identity_status:candidate.identity_status||String(candidate.metadata?.identity_status??''),
      category:candidate.category,address:candidate.address,distance_m:candidate.distance_from_route_m,current_distance_m:candidate.current_distance_m??candidate.distance_from_route_m,
      river_distance_m:candidate.river_distance_m??-1,nearest_river_name:candidate.nearest_river_name||'',river_source:candidate.river_source||'',
      river_relevance:candidate.river_relevance||'RIVER_DATA_UNAVAILABLE',current_relevance:candidate.current_relevance||'REVIEW',
      video_time:candidate.nearest_video_time,video_time_s:candidate.nearest_video_time_s,
      proximity_band:candidate.proximity_band??'',verification_status:candidate.verification_status,
      kiadb_plot_no:String(candidate.kiadb_plot_no??candidate.metadata?.kiadb_plot_no??''),industrial_area:String(candidate.industrial_area??candidate.metadata?.industrial_area??''),nature_of_industry:String(candidate.nature_of_industry??candidate.metadata?.nature_of_industry??''),plot_status:String(candidate.plot_status??candidate.metadata?.plot_status??''),identity_match_distance_m:Number(candidate.metadata?.identity_match_distance_m??-1),identity_provider:String(candidate.metadata?.identity_source??''),google_maps_uri:String(candidate.metadata?.google_maps_uri??'')
    },
    geometry:{type:'Point',coordinates:[candidate.lng,candidate.lat]}
  }))} as any
}

function industryLiveRadiusGeoJson(location:StreetLocation|null,radiusM:number){
  if(!location||!Number.isFinite(radiusM)||radiusM<=0)return {type:'FeatureCollection',features:[]} as any
  const points:[number,number][]=[];const latScale=111320;const lngScale=Math.max(1,111320*Math.cos(location.lat*Math.PI/180))
  for(let i=0;i<=72;i++){const a=2*Math.PI*i/72;points.push([location.lng+(Math.cos(a)*radiusM/lngScale),location.lat+(Math.sin(a)*radiusM/latScale)])}
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{radius_m:radiusM},geometry:{type:'Polygon',coordinates:[points]}}]} as any
}

function primaryIndustryLinkGeoJson(location:StreetLocation|null,candidate:IndustryCandidate|null){
  if(!location||!candidate)return {type:'FeatureCollection',features:[]} as any
  return {type:'FeatureCollection',features:[{type:'Feature',properties:{kind:'current-industry-link'},geometry:{type:'LineString',coordinates:[[location.lng,location.lat],[candidate.lng,candidate.lat]]}}]} as any
}

function makeIndustryCalloutElement(candidate:IndustryCandidate,primary:boolean){
  const root=document.createElement('div')
  root.dataset.industryCallout='1';root.style.pointerEvents='none';root.style.zIndex='45';root.style.maxWidth='220px';root.style.padding='6px 8px';root.style.borderRadius='9px';root.style.border=primary?'2px solid #fdba74':'2px solid #67e8f9';root.style.background=primary?'rgba(124,45,18,.94)':'rgba(8,47,73,.92)';root.style.color='#ffffff';root.style.boxShadow='0 5px 18px rgba(15,23,42,.42)';root.style.fontFamily='system-ui,sans-serif';root.style.lineHeight='1.2';root.style.transform='translateY(-2px)'
  const title=document.createElement('div');title.dataset.calloutTitle='1';title.style.fontSize='11px';title.style.fontWeight='900';title.style.whiteSpace='nowrap';title.style.overflow='hidden';title.style.textOverflow='ellipsis';title.textContent=`ðŸ­ ${industryDisplayName(candidate)}`
  const meta=document.createElement('div');meta.dataset.calloutMeta='1';meta.style.marginTop='3px';meta.style.fontSize='9px';meta.style.fontWeight='800';meta.style.color=primary?'#fed7aa':'#cffafe'
  const pointer=document.createElement('div');pointer.style.position='absolute';pointer.style.left='50%';pointer.style.bottom='-8px';pointer.style.marginLeft='-7px';pointer.style.width='0';pointer.style.height='0';pointer.style.borderLeft='7px solid transparent';pointer.style.borderRight='7px solid transparent';pointer.style.borderTop=primary?'8px solid #fdba74':'8px solid #67e8f9'
  root.style.position='relative';root.append(title,meta,pointer);updateIndustryCalloutElement(root,candidate,primary);return root
}

function updateIndustryCalloutElement(root:HTMLElement,candidate:IndustryCandidate,primary:boolean){
  root.style.border=primary?'2px solid #fdba74':'2px solid #67e8f9';root.style.background=primary?'rgba(124,45,18,.94)':'rgba(8,47,73,.92)'
  const title=root.querySelector('[data-callout-title]') as HTMLElement|null;if(title)title.textContent=`ðŸ­ ${industryDisplayName(candidate)}`
  const meta=root.querySelector('[data-callout-meta]') as HTMLElement|null
  if(meta){const drone=Math.round(candidate.current_distance_m??candidate.distance_from_route_m);const river=candidate.river_distance_m===null?'river â€”':`river ${Math.round(candidate.river_distance_m)} m`;meta.textContent=`${primary?'BEST NOW Â· ':''}${industryIdentityBadge(candidate)} Â· drone ${drone} m Â· ${river}`;meta.style.color=primary?'#fed7aa':'#cffafe'}
  const pointer=root.lastElementChild as HTMLElement|null;if(pointer)pointer.style.borderTop=primary?'8px solid #fdba74':'8px solid #67e8f9'
}

function setIndustryVisibility(map:MlMap,visible:boolean){
  for(const id of ['industry-live-radius-fill','industry-live-radius-line','industry-primary-link','industry-candidates-circle','industry-candidates-label','industry-current-ring']){
    if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')
  }
}
function setRiverContextVisibility(map:MlMap,visible:boolean){
  for(const id of ['industry-river-glow','industry-river-line','industry-river-label'])if(map.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')
}

function buildIndustryPopup(properties:any):HTMLElement{
  const root=document.createElement('div');root.className='ge-popup-root'
  const title=document.createElement('div');title.className='ge-popup-title';title.textContent=String(properties?.name??'Industrial candidate');root.append(title)
  const table=document.createElement('div');table.className='ge-popup-table'
  addGeRow(table,'Source',String(properties?.source??'â€”'))
  addGeRow(table,'Category',String(properties?.category??'â€”'))
  addGeRow(table,'Current GPS distance',`${Math.round(Number(properties?.current_distance_m??properties?.distance_m??0)).toLocaleString()} m`)
  addGeRow(table,'River distance',Number(properties?.river_distance_m)>=0?`${Math.round(Number(properties.river_distance_m)).toLocaleString()} m`:'River layer unavailable')
  if(properties?.nearest_river_name)addGeRow(table,'Nearest river / stream',String(properties.nearest_river_name))
  addGeRow(table,'Live relevance',String(properties?.current_relevance??'REVIEW'))
  addGeRow(table,'Nearest video time',String(properties?.video_time??'â€”'))
  if(properties?.identity_status)addGeRow(table,'Identity',String(properties.identity_status).replace(/_/g,' '))
  if(properties?.identity_provider)addGeRow(table,'Identity source',String(properties.identity_provider).replace(/_/g,' '))
  if(Number(properties?.identity_match_distance_m)>=0)addGeRow(table,'Identity match distance',`${Math.round(Number(properties.identity_match_distance_m))} m`)
  if(properties?.kiadb_plot_no)addGeRow(table,'KIADB plot',String(properties.kiadb_plot_no))
  if(properties?.industrial_area)addGeRow(table,'Industrial area',String(properties.industrial_area))
  if(properties?.nature_of_industry)addGeRow(table,'Nature / sector',String(properties.nature_of_industry))
  if(properties?.plot_status)addGeRow(table,'Plot status',String(properties.plot_status))
  root.append(table)
  const footer=document.createElement('div');footer.className='ge-popup-footer';footer.textContent='Candidate proximity only - field/video verification required';root.append(footer)
  return root
}

function installIndustryLayers(map:MlMap,registerPopup:(popup:maplibregl.Popup)=>void){
  if(map.getSource('industry-candidates'))return
  map.addSource('industry-river-context',{type:'geojson',data:{type:'FeatureCollection',features:[]}} as any)
  map.addLayer({id:'industry-river-glow',type:'line',source:'industry-river-context',paint:{'line-color':'#38bdf8','line-width':['interpolate',['linear'],['zoom'],9,7,15,12,18,18],'line-opacity':.25,'line-blur':2}} as any)
  map.addLayer({id:'industry-river-line',type:'line',source:'industry-river-context',paint:{'line-color':'#0ea5e9','line-width':['interpolate',['linear'],['zoom'],9,2.5,15,4.5,18,7],'line-opacity':.98}} as any)
  map.addLayer({id:'industry-river-label',type:'symbol',source:'industry-river-context',minzoom:13,layout:{'symbol-placement':'line','text-field':['get','name'],'text-size':11,'text-max-angle':30,'text-allow-overlap':false},paint:{'text-color':'#e0f2fe','text-halo-color':'#075985','text-halo-width':1.5}} as any)
  map.addSource('industry-live-radius',{type:'geojson',data:{type:'FeatureCollection',features:[]}} as any)
  map.addLayer({id:'industry-live-radius-fill',type:'fill',source:'industry-live-radius',paint:{'fill-color':'#06b6d4','fill-opacity':.08}} as any)
  map.addLayer({id:'industry-live-radius-line',type:'line',source:'industry-live-radius',paint:{'line-color':'#06b6d4','line-width':2,'line-opacity':.9,'line-dasharray':[2,2]}} as any)
  map.addSource('industry-primary-link',{type:'geojson',data:{type:'FeatureCollection',features:[]}} as any)
  map.addLayer({id:'industry-primary-link',type:'line',source:'industry-primary-link',paint:{'line-color':'#fb923c','line-width':2.5,'line-opacity':.95,'line-dasharray':[1.5,1.5]}} as any)
  map.addSource('industry-candidates',{type:'geojson',data:{type:'FeatureCollection',features:[]}} as any)
  map.addLayer({id:'industry-current-ring',type:'circle',source:'industry-candidates',paint:{'circle-radius':14,'circle-color':'rgba(0,0,0,0)','circle-stroke-color':'#facc15','circle-stroke-width':4,'circle-opacity':.95},filter:['==',['get','id'],'__none__']} as any)
  map.addLayer({id:'industry-candidates-circle',type:'circle',source:'industry-candidates',paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],9,5,14,7,18,10],
    'circle-color':['match',['get','current_relevance'],'HIGH','#f97316','MEDIUM','#06b6d4','#2563eb'],
    'circle-stroke-color':['match',['get','source'],'KIADB','#fef08a','#ffffff'],'circle-stroke-width':['match',['get','source'],'KIADB',3,2],'circle-opacity':.96
  }} as any)
  map.addLayer({id:'industry-candidates-label',type:'symbol',source:'industry-candidates',minzoom:14,layout:{'text-field':['coalesce',['get','display_name'],['get','name']],'text-size':10,'text-offset':[0,1.25],'text-anchor':'top','text-max-width':16,'text-allow-overlap':false},paint:{'text-color':'#ffffff','text-halo-color':'#0f172a','text-halo-width':1.5}} as any)
  map.on('mouseenter','industry-candidates-circle',()=>map.getCanvas().style.cursor='pointer')
  map.on('mouseleave','industry-candidates-circle',()=>map.getCanvas().style.cursor='')
  map.on('click','industry-candidates-circle',(event)=>{
    const feature=event.features?.[0];if(!feature)return
    const coords=(feature.geometry as any)?.coordinates
    if(!Array.isArray(coords)||coords.length<2)return
    const popup=new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:'390px',className:'arkavathi-google-earth-popup'})
      .setLngLat([Number(coords[0]),Number(coords[1])])
      .setDOMContent(buildIndustryPopup(feature.properties??{}))
      .addTo(map)
    registerPopup(popup)
  })
}

type Props = {
  summary: Summary
  tracks: any
  endpoints: any
  points: any
  selectedFlight: FlightDetail | null
  selectedPoint: TrackPoint | null
  onSelectFlight: (id:string)=>void
  onSelectPoint: (point:TrackPoint)=>void
  streetViewMode?: boolean
  streetViewLocation?: StreetLocation|null
  onStreetViewLocationChange?: (location:StreetLocation)=>void
  videoSyncMode?: boolean
  videoSyncTrack?: VideoSyncSample[]
  videoSyncLocation?: StreetLocation|null
  videoSyncHeading?: number|null
  videoSyncCurrentTime?: number
  videoSyncDuration?: number
  videoSyncPlaying?: boolean
  videoSyncLabel?: string
  industryCandidates?: IndustryCandidate[]
  industryRadiusM?: number
  industryRiverRadiusM?: number
  industryRiverContext?: IndustryRiverContext|null
  currentRiverDistanceM?: number|null
  primaryIndustryId?: string|null
  industryFocus?: {id:string;lat:number;lng:number;nonce:number}|null
  workspaceFullscreen?: boolean
}

export function SurveyMap({summary,tracks,endpoints,points,selectedFlight,selectedPoint,onSelectFlight,onSelectPoint,streetViewMode=false,streetViewLocation=null,onStreetViewLocationChange,videoSyncMode=false,videoSyncTrack=[],videoSyncLocation=null,videoSyncHeading=null,videoSyncCurrentTime=0,videoSyncDuration=0,videoSyncPlaying=false,videoSyncLabel='',industryCandidates=[],industryRadiusM=250,industryRiverRadiusM=250,industryRiverContext=null,currentRiverDistanceM=null,primaryIndustryId=null,industryFocus=null,workspaceFullscreen=false}:Props) {
  const node=useRef<HTMLDivElement|null>(null)
  const mapRef=useRef<MlMap|null>(null)
  const markerRef=useRef<maplibregl.Marker|null>(null)
  const popupRef=useRef<maplibregl.Popup|null>(null)
  const streetViewMarkerRef=useRef<maplibregl.Marker|null>(null)
  const videoSyncMarkerRef=useRef<maplibregl.Marker|null>(null)
  const videoStartMarkerRef=useRef<maplibregl.Marker|null>(null)
  const videoEndMarkerRef=useRef<maplibregl.Marker|null>(null)
  const videoRouteSvgRef=useRef<SVGSVGElement|null>(null)
  const videoOverlayStateRef=useRef<{active:boolean;track:VideoSyncSample[];time:number;duration:number;location:StreetLocation|null}>({active:false,track:[],time:0,duration:0,location:null})
  videoOverlayStateRef.current={active:videoSyncMode,track:videoSyncTrack,time:videoSyncCurrentTime,duration:videoSyncDuration,location:videoSyncLocation}
  const industryCalloutMarkersRef=useRef<Map<string,{marker:maplibregl.Marker;element:HTMLElement}>>(new Map())
  const videoRouteFitKeyRef=useRef('')
  const videoPairFocusKeyRef=useRef('')
  const lastVideoFollowAtRef=useRef(0)
  const previousSelectedPointId=useRef<string|null>(null)
  const coverageAbortRef=useRef<AbortController|null>(null)
  const coverageLinesRef=useRef<CoverageLine[]>([])
  const streetViewLocationRef=useRef<StreetLocation|null>(streetViewLocation)
  const streetViewChangeRef=useRef(onStreetViewLocationChange)
  const dragValidityRef=useRef<boolean|null>(null)
  const draggingPegmanRef=useRef(false)
  const suppressMapClickUntilRef=useRef(0)
  const [base,setBase]=useState<'satellite'|'street'>('satellite')
  const [playIndex,setPlayIndex]=useState(0)
  const [playing,setPlaying]=useState(false)
  const [showPoints,setShowPoints]=useState(true)
  const [showVideoProjectData,setShowVideoProjectData]=useState(false)
  const [showIndustryCandidates,setShowIndustryCandidates]=useState(true)
  const [industryObservations,setIndustryObservations]=useState<IndustryObservation[]>([])
  const [showIndustries,setShowIndustries]=useState(true)
  const [followVideoGps,setFollowVideoGps]=useState(true)
  const [mapReadyEpoch,setMapReadyEpoch]=useState(0)
  const [coverageState,setCoverageState]=useState<CoverageState>('idle')
  const [coverageLineCount,setCoverageLineCount]=useState(0)
  const [coverageTileCount,setCoverageTileCount]=useState(0)
  const [draggingPegman,setDraggingPegman]=useState(false)
  const [streetNotice,setStreetNotice]=useState('Blue lines show roads where KartaView street imagery actually exists. Drag the yellow person onto a blue line.')

  const redrawVideoRouteOverlay=useCallback(()=>{
    const map=mapRef.current,svg=videoRouteSvgRef.current,state=videoOverlayStateRef.current
    if(!svg)return
    if(!map||!state.active){svg.innerHTML='';return}
    try{drawVideoSrtOverlay(map,svg,state.track,state.time,state.duration,state.location)}catch{svg.innerHTML=''}
  },[])

  useEffect(()=>{streetViewLocationRef.current=streetViewLocation},[streetViewLocation?.lat,streetViewLocation?.lng])
  useEffect(()=>{streetViewChangeRef.current=onStreetViewLocationChange},[onStreetViewLocationChange])
  useEffect(()=>{if(videoSyncMode&&base!=='satellite')setBase('satellite')},[videoSyncMode,base])
  useEffect(()=>{
    const map=mapRef.current
    if(!videoSyncMode){videoPairFocusKeyRef.current='';return}
    if(!map||!videoSyncLocation)return
    return whenMapStyleReady(map,()=>{
      const key=videoSyncLabel||`${videoSyncTrack.length}:${videoSyncTrack[0]?.lat??''}:${videoSyncTrack[0]?.lng??''}`
      if(videoPairFocusKeyRef.current===key)return
      videoPairFocusKeyRef.current=key;setShowVideoProjectData(false);setFollowVideoGps(true);popupRef.current?.remove();popupRef.current=null
      setProjectDataVisibility(map,false,false);setCoverageVisibility(map,false)
      if(videoSyncTrack.length>=2)fitVideoSrtRoute(map,videoSyncTrack,450)
      else map.jumpTo({center:[videoSyncLocation.lng,videoSyncLocation.lat],zoom:Math.max(map.getZoom(),17)})
    })
  },[videoSyncMode,videoSyncLabel,videoSyncLocation?.lat,videoSyncLocation?.lng,videoSyncTrack.length,base,mapReadyEpoch])
  useEffect(()=>{
    let cancelled=false
    const load=()=>api.industryObservations({limit:5000}).then(rows=>{if(!cancelled)setIndustryObservations(rows)}).catch(()=>{})
    void load()
    const onUpdate=()=>void load();window.addEventListener('arkavathi-industry-updated',onUpdate)
    return()=>{cancelled=true;window.removeEventListener('arkavathi-industry-updated',onUpdate)}
  },[])

  const playback = useMemo(()=> selectedFlight?.playback?.length
    ? selectedFlight.playback
    : (selectedFlight?.coordinates ?? []).map((c,i)=>({time:`Point ${i+1}`,lon:c[0],lat:c[1],abs_alt_m:c[2]??0})),[selectedFlight])

  const refreshCoverage=useCallback(async(map:MlMap)=>{
    if(!streetViewMode||videoSyncMode||!map.isStyleLoaded())return
    coverageAbortRef.current?.abort()
    const controller=new AbortController();coverageAbortRef.current=controller
    const tiles=coverageTilesForMap(map)
    setCoverageTileCount(tiles.length);setCoverageState('loading')
    try{
      const settled=await Promise.allSettled(tiles.map(tile=>fetchCoverageTile(tile,controller.signal)))
      if(controller.signal.aborted)return
      const successful=settled.filter((r):r is PromiseFulfilledResult<CoverageLine[]>=>r.status==='fulfilled')
      if(!successful.length&&tiles.length){
        coverageLinesRef.current=[];setCoverageLineCount(0);setCoverageState('error')
        ;(map.getSource('street-coverage') as maplibregl.GeoJSONSource|undefined)?.setData(emptyCoverage)
        setStreetNotice('KartaView coverage geometry is temporarily unavailable. The coverage-tile overlay and direct imagery lookup remain active, so you can still click or drop the yellow person.')
        return
      }
      const lines=successful.flatMap(result=>result.value)
      coverageLinesRef.current=lines;setCoverageLineCount(lines.length);setCoverageState(lines.length?'ready':'empty')
      ;(map.getSource('street-coverage') as maplibregl.GeoJSONSource|undefined)?.setData(coverageGeoJson(lines) as any)
      if(!draggingPegmanRef.current)setStreetNotice(lines.length?'Blue lines are live KartaView imagery coverage. Drag the yellow person onto one, or click directly on a blue line.':'No vector coverage geometry was returned for this view. You can still click or drop anywhere and V20 will verify nearby imagery directly.')
    }catch(error){
      if(controller.signal.aborted)return
      coverageLinesRef.current=[];setCoverageLineCount(0);setCoverageState('error')
      setStreetNotice(`Coverage geometry error: ${error instanceof Error?error.message:String(error)}. Direct imagery verification is still available.`)
    }
  },[streetViewMode,videoSyncMode])

  useEffect(()=>{
    if(!node.current)return
    const map=new maplibregl.Map({container:node.current,style:base==='satellite'?satelliteStyle:streetStyle,center:[77.4388,13.1672],zoom:9.3,pitch:0})
    map.addControl(new maplibregl.NavigationControl(),'top-right')
    map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-right')
    mapRef.current=map
    map.on('load',()=>{
      installData(map,tracks,endpoints,points,onSelectFlight,onSelectPoint,summary.bbox,(popup)=>{popupRef.current?.remove();popupRef.current=popup})
      installIndustryObservationLayers(map,(popup)=>{popupRef.current?.remove();popupRef.current=popup})
      ;(map.getSource('industry-observations') as maplibregl.GeoJSONSource|undefined)?.setData(industryObservationGeoJson(industryObservations) as any)
      setIndustryObservationVisibility(map,videoSyncMode&&showIndustryCandidates)
      installIndustryLayers(map,(popup)=>{popupRef.current?.remove();popupRef.current=popup})
      ;(map.getSource('industry-candidates') as maplibregl.GeoJSONSource|undefined)?.setData(industryGeoJson(industryCandidates))
      ;(map.getSource('industry-river-context') as maplibregl.GeoJSONSource|undefined)?.setData((industryRiverContext?.geojson??{type:'FeatureCollection',features:[]}) as any)
      setIndustryVisibility(map,videoSyncMode&&showIndustries)
      setRiverContextVisibility(map,videoSyncMode&&Boolean(industryRiverContext?.available))
      setProjectDataVisibility(map,!videoSyncMode,videoSyncMode?showVideoProjectData:showPoints)
      // Always create Video+SRT sources/layers at initial style load. A later React effect
      // hydrates current route data and visibility. This removes the stale-closure race that
      // allowed the yellow HTML marker to exist while START/END/route sources were absent.
      installVideoSyncLayers(map)
      setVideoSyncVisibility(map,false)
      if(videoSyncMode)setCoverageVisibility(map,false)
      setMapReadyEpoch(v=>v+1)
    })
    return()=>{
      coverageAbortRef.current?.abort()
      popupRef.current?.remove();popupRef.current=null
      markerRef.current?.remove();markerRef.current=null
      streetViewMarkerRef.current?.remove();streetViewMarkerRef.current=null
      videoSyncMarkerRef.current?.remove();videoSyncMarkerRef.current=null
      videoStartMarkerRef.current?.remove();videoStartMarkerRef.current=null
      videoEndMarkerRef.current?.remove();videoEndMarkerRef.current=null
      industryCalloutMarkersRef.current.forEach(entry=>entry.marker.remove());industryCalloutMarkersRef.current.clear()
      map.remove();mapRef.current=null
    }
  },[base])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!streetViewMode)return
    if(videoSyncMode){
      coverageAbortRef.current?.abort();coverageLinesRef.current=[];setCoverageLineCount(0);setCoverageTileCount(0);setCoverageState('idle')
      return whenMapStyleReady(map,()=>setCoverageVisibility(map,false))
    }
    let detachReady=()=>{}
    const activate=()=>{installCoverageLayers(map);setCoverageVisibility(map,true);void refreshCoverage(map)}
    detachReady=whenMapStyleReady(map,activate)
    const onMoveEnd=()=>void refreshCoverage(map)
    map.on('moveend',onMoveEnd)
    return()=>{detachReady();map.off('moveend',onMoveEnd);coverageAbortRef.current?.abort()}
  },[streetViewMode,videoSyncMode,base,refreshCoverage])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!map.loaded())return
    ;(map.getSource('tracks') as maplibregl.GeoJSONSource|undefined)?.setData(tracks)
    ;(map.getSource('endpoints') as maplibregl.GeoJSONSource|undefined)?.setData(endpoints)
    ;(map.getSource('points') as maplibregl.GeoJSONSource|undefined)?.setData(points)
  },[tracks,endpoints,points])

  useEffect(()=>{
    const map=mapRef.current;if(!map||!map.loaded())return
    ;(map.getSource('industry-observations') as maplibregl.GeoJSONSource|undefined)?.setData(industryObservationGeoJson(industryObservations) as any)
    setIndustryObservationVisibility(map,videoSyncMode&&showIndustryCandidates)
  },[industryObservations,videoSyncMode,showIndustryCandidates,base])

  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    return whenMapStyleReady(map,()=>{
      installIndustryLayers(map,(popup)=>{popupRef.current?.remove();popupRef.current=popup})
      ;(map.getSource('industry-candidates') as maplibregl.GeoJSONSource|undefined)?.setData(industryGeoJson(industryCandidates))
      ;(map.getSource('industry-live-radius') as maplibregl.GeoJSONSource|undefined)?.setData(industryLiveRadiusGeoJson(videoSyncLocation,industryRadiusM))
      const primary=primaryIndustryId?(industryCandidates.find(candidate=>candidate.id===primaryIndustryId)??null):null
      ;(map.getSource('industry-primary-link') as maplibregl.GeoJSONSource|undefined)?.setData(primaryIndustryLinkGeoJson(videoSyncLocation,primary))
      ;(map.getSource('industry-river-context') as maplibregl.GeoJSONSource|undefined)?.setData((industryRiverContext?.geojson??{type:'FeatureCollection',features:[]}) as any)
      setIndustryVisibility(map,videoSyncMode&&showIndustries)
      setRiverContextVisibility(map,videoSyncMode&&Boolean(industryRiverContext?.available))
    })
  },[industryCandidates,industryRadiusM,videoSyncLocation?.lat,videoSyncLocation?.lng,videoSyncMode,showIndustries,industryRiverContext,primaryIndustryId,base,mapReadyEpoch])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!map.loaded()||!map.getLayer('industry-current-ring'))return
    if(!videoSyncMode||!showIndustries||!primaryIndustryId){map.setFilter('industry-current-ring',['==',['get','id'],'__none__'] as any);return}
    map.setFilter('industry-current-ring',['==',['get','id'],primaryIndustryId] as any)
  },[videoSyncMode,showIndustries,primaryIndustryId,industryCandidates,base])

  useEffect(()=>{
    const map=mapRef.current;const registry=industryCalloutMarkersRef.current
    if(!map||!videoSyncMode||!showIndustries){registry.forEach(entry=>entry.marker.remove());registry.clear();return}
    const ordered=[...industryCandidates].sort((a,b)=>{if(a.id===primaryIndustryId)return -1;if(b.id===primaryIndustryId)return 1;return (a.current_distance_m??a.distance_from_route_m)-(b.current_distance_m??b.distance_from_route_m)}).slice(0,6)
    const keep=new Set(ordered.map(candidate=>candidate.id))
    registry.forEach((entry,id)=>{if(!keep.has(id)){entry.marker.remove();registry.delete(id)}})
    for(const candidate of ordered){
      const primary=candidate.id===primaryIndustryId
      let entry=registry.get(candidate.id)
      if(!entry){const element=makeIndustryCalloutElement(candidate,primary);const marker=new maplibregl.Marker({element,anchor:'bottom',offset:[0,-12]}).setLngLat([candidate.lng,candidate.lat]).addTo(map);entry={marker,element};registry.set(candidate.id,entry)}
      else{entry.marker.setLngLat([candidate.lng,candidate.lat]);updateIndustryCalloutElement(entry.element,candidate,primary)}
    }
  },[videoSyncMode,showIndustries,industryCandidates,primaryIndustryId,base,mapReadyEpoch])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!map.loaded()||!industryFocus)return
    setShowIndustries(true)
    map.easeTo({center:[industryFocus.lng,industryFocus.lat],zoom:Math.max(map.getZoom(),17),duration:450,essential:true})
  },[industryFocus?.nonce,base])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!map.loaded())return
    if(videoSyncMode)setProjectDataVisibility(map,showVideoProjectData,showVideoProjectData)
    else setProjectDataVisibility(map,true,showPoints)
  },[showPoints,showVideoProjectData,videoSyncMode,base])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!streetViewMode)return
    const onMapClick=(event:maplibregl.MapMouseEvent)=>{
      if(Date.now()<suppressMapClickUntilRef.current)return
      const requested={lat:event.lngLat.lat,lng:event.lngLat.lng}
      const nearest=nearestCoveragePoint(requested,coverageLinesRef.current)
      const limit=snapLimitMeters(map,requested.lat)
      if(nearest&&nearest.distanceM<=limit){
        streetViewChangeRef.current?.(nearest.location)
        setStreetNotice(`Street View target snapped to blue imagery coverage (${Math.round(nearest.distanceM)} m from your click).`)
        return
      }
      // V19 blocked all imagery lookup when coverage geometry failed. V20 never gets
      // stuck in that state: the right panel performs a real nearby-photo lookup.
      streetViewChangeRef.current?.(requested)
      setStreetNotice(coverageState==='loading'
        ?'Coverage geometry is loading; checking this location directly for KartaView imagery.'
        :coverageState==='error'
          ?'Coverage geometry is unavailable; checking this location directly for KartaView imagery.'
          :'No blue vector line was close enough. Checking the selected location directly before rejecting it.')
    }
    map.on('click',onMapClick)
    map.getCanvas().style.cursor='crosshair'
    return()=>{map.off('click',onMapClick);if(map.getCanvas())map.getCanvas().style.cursor=''}
  },[streetViewMode,base,coverageState])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!streetViewMode)return
    if(streetViewMarkerRef.current)return
    const start=streetViewLocationRef.current??{lat:map.getCenter().lat,lng:map.getCenter().lng}
    const el=makePegmanElement()
    const marker=new maplibregl.Marker({element:el,anchor:'bottom',draggable:true}).setLngLat([start.lng,start.lat]).addTo(map)
    streetViewMarkerRef.current=marker
    marker.on('dragstart',()=>{
      dragValidityRef.current=null;draggingPegmanRef.current=true;setDraggingPegman(true);el.style.cursor='grabbing'
      setStreetNotice('Drag onto a blue line. Blue means street imagery exists; no blue means no KartaView coverage.')
      if(map.getLayer('street-coverage-line'))map.setPaintProperty('street-coverage-line','line-width',['interpolate',['linear'],['zoom'],6,2.5,12,5.5,18,9])
    })
    marker.on('drag',()=>{
      const pos=marker.getLngLat();const requested={lat:pos.lat,lng:pos.lng}
      const nearest=nearestCoveragePoint(requested,coverageLinesRef.current)
      const valid=Boolean(nearest&&nearest.distanceM<=snapLimitMeters(map,requested.lat))
      el.style.filter=valid?'drop-shadow(0 0 9px rgba(14,165,233,.95))':'drop-shadow(0 4px 5px rgba(15,23,42,.45))'
      if(valid!==dragValidityRef.current){
        dragValidityRef.current=valid
        setStreetNotice(valid?'Blue coverage found. Release the person to open the nearest street image.':'Move the person onto a blue imagery line before releasing.')
      }
    })
    marker.on('dragend',()=>{
      const pos=marker.getLngLat();const requested={lat:pos.lat,lng:pos.lng}
      const nearest=nearestCoveragePoint(requested,coverageLinesRef.current)
      const limit=snapLimitMeters(map,requested.lat)
      el.style.cursor='grab';el.style.filter='drop-shadow(0 4px 5px rgba(15,23,42,.45))'
      draggingPegmanRef.current=false;setDraggingPegman(false);dragValidityRef.current=null;suppressMapClickUntilRef.current=Date.now()+300
      if(map.getLayer('street-coverage-line'))map.setPaintProperty('street-coverage-line','line-width',['interpolate',['linear'],['zoom'],6,1.4,12,3.5,18,6.5])
      if(nearest&&nearest.distanceM<=limit){
        marker.setLngLat([nearest.location.lng,nearest.location.lat])
        streetViewLocationRef.current=nearest.location
        streetViewChangeRef.current?.(nearest.location)
        setStreetNotice(`Dropped on blue KartaView coverage. Loading street imagery from ${Math.round(nearest.distanceM)} m away.`)
      }else{
        // Do not silently bounce the person back just because the coverage geometry
        // endpoint failed. Verify the real photo API first; the viewer will report a
        // genuine no-imagery result when the provider has no capture nearby.
        streetViewLocationRef.current=requested
        streetViewChangeRef.current?.(requested)
        setStreetNotice(coverageState==='error'
          ?'Coverage geometry is unavailable. Verifying this drop directly against KartaView imageryâ€¦'
          :'No blue vector line was detected at the drop. Verifying nearby KartaView imagery before rejecting itâ€¦')
      }
    })
  },[streetViewMode,base])

  useEffect(()=>{
    if(!streetViewMode){streetViewMarkerRef.current?.remove();streetViewMarkerRef.current=null;return}
    if(!streetViewLocation||draggingPegman)return
    streetViewMarkerRef.current?.setLngLat([streetViewLocation.lng,streetViewLocation.lat])
  },[streetViewMode,streetViewLocation?.lat,streetViewLocation?.lng,draggingPegman,base])

  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    if(!videoSyncMode){
      videoSyncMarkerRef.current?.remove();videoSyncMarkerRef.current=null
      videoStartMarkerRef.current?.remove();videoStartMarkerRef.current=null
      videoEndMarkerRef.current?.remove();videoEndMarkerRef.current=null
      videoRouteFitKeyRef.current=''
      return whenMapStyleReady(map,()=>{setVideoSyncVisibility(map,false);setCoverageVisibility(map,streetViewMode);setProjectDataVisibility(map,true,showPoints)})
    }
    return whenMapStyleReady(map,()=>{
      installVideoSyncLayers(map);setVideoSyncVisibility(map,true);setCoverageVisibility(map,false);setProjectDataVisibility(map,showVideoProjectData,showVideoProjectData)
      ;(map.getSource('video-srt-route') as maplibregl.GeoJSONSource|undefined)?.setData(videoTrackLine(videoSyncTrack))
      ;(map.getSource('video-srt-samples') as maplibregl.GeoJSONSource|undefined)?.setData(videoTrackSamplePoints(videoSyncTrack))
      ;(map.getSource('video-srt-endpoints') as maplibregl.GeoJSONSource|undefined)?.setData(videoTrackEndpoints(videoSyncTrack))
      ;(map.getSource('video-srt-progress') as maplibregl.GeoJSONSource|undefined)?.setData(videoProgressLine(videoSyncTrack,videoSyncCurrentTime,videoSyncLocation,videoSyncDuration))
      if(videoSyncTrack.length){
        const first=videoSyncTrack[0],last=videoSyncTrack[videoSyncTrack.length-1]
        if(!videoStartMarkerRef.current)videoStartMarkerRef.current=new maplibregl.Marker({element:makeSrtEndpointMarker('start'),anchor:'bottom'}).addTo(map)
        if(!videoEndMarkerRef.current)videoEndMarkerRef.current=new maplibregl.Marker({element:makeSrtEndpointMarker('end'),anchor:'bottom'}).addTo(map)
        videoStartMarkerRef.current.setLngLat([first.lng,first.lat]);videoEndMarkerRef.current.setLngLat([last.lng,last.lat])
        const key=`${videoSyncTrack.length}:${first.lat.toFixed(7)}:${first.lng.toFixed(7)}:${last.lat.toFixed(7)}:${last.lng.toFixed(7)}`
        if(videoRouteFitKeyRef.current!==key){
          videoRouteFitKeyRef.current=key;setFollowVideoGps(true);fitVideoSrtRoute(map,videoSyncTrack,650)
        }
      }else{
        videoStartMarkerRef.current?.remove();videoStartMarkerRef.current=null
        videoEndMarkerRef.current?.remove();videoEndMarkerRef.current=null
      }
    })
  },[videoSyncMode,videoSyncTrack,base,mapReadyEpoch,streetViewMode,showPoints,showVideoProjectData])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!videoSyncMode)return
    if(!videoSyncLocation){videoSyncMarkerRef.current?.remove();videoSyncMarkerRef.current=null;return}
    if(!videoSyncMarkerRef.current){
      const el=makeVideoGpsMarker()
      videoSyncMarkerRef.current=new maplibregl.Marker({element:el,anchor:'center'}).setLngLat([videoSyncLocation.lng,videoSyncLocation.lat]).addTo(map)
    }else videoSyncMarkerRef.current.setLngLat([videoSyncLocation.lng,videoSyncLocation.lat])
    const arrow=videoSyncMarkerRef.current.getElement().querySelector('[data-video-gps-heading]') as HTMLElement|null
    if(arrow){
      if(typeof videoSyncHeading==='number'){arrow.style.display='block';arrow.style.transform=`rotate(${videoSyncHeading}deg)`}else arrow.style.display='none'
    }
    const detach=whenMapStyleReady(map,()=>{
      installVideoSyncLayers(map);setVideoSyncVisibility(map,true);setCoverageVisibility(map,false);setProjectDataVisibility(map,showVideoProjectData,showVideoProjectData)
      ;(map.getSource('video-srt-progress') as maplibregl.GeoJSONSource|undefined)?.setData(videoProgressLine(videoSyncTrack,videoSyncCurrentTime,videoSyncLocation,videoSyncDuration))
      ;(map.getSource('industry-live-radius') as maplibregl.GeoJSONSource|undefined)?.setData(industryLiveRadiusGeoJson(videoSyncLocation,industryRadiusM))
      const primary=primaryIndustryId?(industryCandidates.find(candidate=>candidate.id===primaryIndustryId)??null):null
      ;(map.getSource('industry-primary-link') as maplibregl.GeoJSONSource|undefined)?.setData(primaryIndustryLinkGeoJson(videoSyncLocation,primary))
    })
    if(followVideoGps){
      const now=performance.now();const interval=videoSyncPlaying?80:0
      if(now-lastVideoFollowAtRef.current>=interval){
        lastVideoFollowAtRef.current=now
        const targetZoom=videoSyncPlaying?Math.max(map.getZoom(),16):map.getZoom()
        if(videoSyncPlaying)map.jumpTo({center:[videoSyncLocation.lng,videoSyncLocation.lat],zoom:targetZoom})
        else map.easeTo({center:[videoSyncLocation.lng,videoSyncLocation.lat],zoom:targetZoom,duration:120,essential:true})
      }
    }
    return detach
  },[videoSyncMode,videoSyncLocation?.lat,videoSyncLocation?.lng,videoSyncHeading,videoSyncCurrentTime,videoSyncDuration,videoSyncPlaying,followVideoGps,videoSyncTrack,showVideoProjectData,industryRadiusM,industryCandidates,primaryIndustryId,base,mapReadyEpoch])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!videoSyncMode){redrawVideoRouteOverlay();return}
    const redraw=()=>redrawVideoRouteOverlay()
    redraw();map.on('move',redraw);map.on('resize',redraw);map.on('styledata',redraw)
    return()=>{map.off('move',redraw);map.off('resize',redraw);map.off('styledata',redraw)}
  },[videoSyncMode,base,mapReadyEpoch,redrawVideoRouteOverlay])

  useEffect(()=>{redrawVideoRouteOverlay()},[videoSyncMode,videoSyncTrack,videoSyncCurrentTime,videoSyncDuration,videoSyncLocation?.lat,videoSyncLocation?.lng,mapReadyEpoch,redrawVideoRouteOverlay])

  useEffect(()=>{
    const map=mapRef.current
    if(!map||!map.loaded()||!map.getSource('points'))return
    const previous=previousSelectedPointId.current
    if(previous){try{map.setFeatureState({source:'points',id:previous},{selected:false})}catch{}}
    if(selectedPoint?.point_id){try{map.setFeatureState({source:'points',id:selectedPoint.point_id},{selected:true})}catch{};previousSelectedPointId.current=selectedPoint.point_id}else previousSelectedPointId.current=null
  },[selectedPoint?.point_id,base,points])

  useEffect(()=>{
    setPlaying(false);setPlayIndex(0);markerRef.current?.remove();markerRef.current=null
    if(selectedFlight&&mapRef.current){
      const map=mapRef.current;const coords=selectedFlight.coordinates
      if(coords.length){const bounds=coords.reduce((b,c)=>b.extend([c[0],c[1]] as [number,number]),new maplibregl.LngLatBounds([coords[0][0],coords[0][1]],[coords[0][0],coords[0][1]]));map.fitBounds(bounds,{padding:80,maxZoom:15,duration:650})}
    }
  },[selectedFlight?.id])

  useEffect(()=>{
    if(!playing||!playback.length)return
    const t=window.setInterval(()=>setPlayIndex(i=>{if(i>=playback.length-1){setPlaying(false);return i}return i+1}),180)
    return()=>clearInterval(t)
  },[playing,playback.length])

  useEffect(()=>{
    if(videoSyncMode){setPlaying(false);markerRef.current?.remove();markerRef.current=null;return}
    if(!playback.length||!mapRef.current)return
    const p=playback[Math.min(playIndex,playback.length-1)]
    if(!markerRef.current){const el=document.createElement('div');el.className='h-5 w-5 rounded-full border-4 border-white bg-yellow-400 shadow-lg';markerRef.current=new maplibregl.Marker({element:el}).setLngLat([p.lon,p.lat]).addTo(mapRef.current)}else markerRef.current.setLngLat([p.lon,p.lat])
  },[playIndex,playback,videoSyncMode])

  useEffect(()=>{
    const map=mapRef.current
    if(!map)return
    const frame=requestAnimationFrame(()=>map.resize())
    const timer=window.setTimeout(()=>map.resize(),180)
    return()=>{cancelAnimationFrame(frame);window.clearTimeout(timer)}
  },[workspaceFullscreen])

  const fitAll=()=>mapRef.current?.fitBounds([[summary.bbox[0],summary.bbox[1]],[summary.bbox[2],summary.bbox[3]]],{padding:55,duration:600})
  const visiblePointCount=points?.features?.length??0
  const primaryIndustry=primaryIndustryId?(industryCandidates.find(candidate=>candidate.id===primaryIndustryId)??null):null
  const riverReady=Boolean(industryRiverContext?.available)
  const riverSource=industryRiverContext?.source==='KIADB'?'KIADB river GIS':industryRiverContext?.source==='OPENSTREETMAP'?'OSM river fallback':'River GIS unavailable'

  return <div className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-card ${workspaceFullscreen?'h-full min-h-0':'h-auto'}`}>
    <div ref={node} className={`${workspaceFullscreen?'h-full min-h-[320px]':'h-[610px]'} w-full`}/>
    <svg ref={videoRouteSvgRef} aria-hidden="true" className={`${videoSyncMode?'block':'hidden'} pointer-events-none absolute inset-0 z-[5] h-full w-full overflow-visible`}/>
    <div className="absolute left-3 top-3 z-30 flex max-w-[calc(100%-60px)] flex-wrap gap-2 rounded-xl bg-white/95 p-2 shadow-lg backdrop-blur">
      <button onClick={()=>{if(!videoSyncMode)setBase(base==='satellite'?'street':'satellite')}} className={`flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 ${videoSyncMode?'cursor-default':''}`}><Layers3 size={15}/>{videoSyncMode?'Satellite':base==='satellite'?'Satellite':'Street'}</button>
      {videoSyncMode?<button onClick={()=>{const map=mapRef.current;if(!map||!videoSyncTrack.length)return;setFollowVideoGps(false);fitVideoSrtRoute(map,videoSyncTrack,600)}} className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"><LocateFixed size={15}/>Route view: START â†’ END</button>:<button onClick={fitAll} className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"><LocateFixed size={15}/>Fit all</button>}
      {videoSyncMode?<><button onClick={()=>setFollowVideoGps(v=>!v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-black ${followVideoGps?'bg-amber-400 text-amber-950':'bg-slate-100 text-slate-700'}`}><Crosshair size={15}/>Follow drone {followVideoGps?'ON':'OFF'}</button><button onClick={()=>setShowVideoProjectData(v=>!v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${showVideoProjectData?'bg-navy-900 text-white':'bg-slate-100 text-slate-700'}`}><MousePointer2 size={15}/>Project data {showVideoProjectData?'ON':'OFF'}</button><button onClick={()=>setShowIndustryCandidates(v=>!v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${showIndustryCandidates?'bg-amber-500 text-amber-950':'bg-slate-100 text-slate-700'}`}><MapPin size={15}/>Field observations {showIndustryCandidates?'ON':'OFF'} <span className="rounded bg-white/30 px-1.5 py-0.5 font-mono text-[10px]">{industryObservations.length}</span></button><button onClick={()=>setShowIndustries(v=>!v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${showIndustries?'bg-cyan-700 text-white':'bg-slate-100 text-slate-700'}`}><Factory size={15}/>Route industries {showIndustries?'ON':'OFF'} <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">{industryCandidates.length}</span></button><span className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-black text-amber-950"><RouteIcon size={17}/>Video + SRT GPS</span></>:<button onClick={()=>setShowPoints(v=>!v)} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${showPoints?'bg-navy-900 text-white':'bg-slate-100 text-slate-700'}`}><MousePointer2 size={15}/>{showPoints?'Points ON':'Points OFF'} <span className="rounded bg-white/15 px-1.5 py-0.5 font-mono text-[10px]">{visiblePointCount.toLocaleString()}</span></button>}
      {streetViewMode&&!videoSyncMode&&<span className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-100 px-3 py-2 text-xs font-black text-amber-950"><PersonStanding size={17}/>Drag yellow person onto blue line</span>}
    </div>
    {videoSyncMode?<div className="absolute right-12 top-3 z-30 hidden max-w-[380px] rounded-lg border border-amber-200 bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow md:block"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 font-black text-amber-800"><Crosshair size={13}/>FRAME-LOCKED SRT GPS</div><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${followVideoGps?'bg-amber-200 text-amber-900':'bg-emerald-100 text-emerald-800'}`}>{followVideoGps?'VIDEO 2 FOLLOW':'ROUTE OVERVIEW'}</span></div><div className="mt-1 font-mono text-[10px]">{videoSyncLocation?`${videoSyncLocation.lat.toFixed(6)}, ${videoSyncLocation.lng.toFixed(6)}`:'Upload a valid Video + SRT pair'} Â· {Math.floor(videoSyncCurrentTime/60).toString().padStart(2,'0')}:{Math.floor(videoSyncCurrentTime%60).toString().padStart(2,'0')}</div><div className="mt-1 text-[10px] font-black text-slate-600">SRT progress {Math.round(videoProgressPercent(videoSyncTrack,videoSyncCurrentTime,videoSyncDuration))}% Â· START â†’ CURRENT GPS â†’ END</div>{videoSyncLabel&&<div className="mt-1 max-w-[340px] truncate text-[10px] text-slate-500">{videoSyncLabel}</div>}</div>:streetViewMode?<div className="absolute right-12 top-3 hidden max-w-[330px] rounded-lg bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow md:block">{coverageState==='loading'?<span className="flex items-center gap-2"><Loader2 size={13} className="animate-spin"/>Loading KartaView coverage...</span>:coverageState==='ready'?<span className="flex items-center gap-2"><RouteIcon size={13} className="text-sky-600"/>{coverageLineCount.toLocaleString()} blue coverage lines Â· {coverageTileCount} tiles</span>:coverageState==='empty'?<span className="flex items-center gap-2"><MapPin size={13}/>No vector coverage Â· direct lookup active</span>:coverageState==='error'?<span className="flex items-center gap-2 text-amber-700"><MapPin size={13}/>Coverage service issue Â· direct lookup active</span>:<span className="flex items-center gap-2"><MapPin size={13}/>Street imagery coverage</span>}</div>:<div className="absolute right-12 top-3 hidden rounded-lg bg-white/95 px-3 py-2 text-[11px] font-semibold text-slate-700 shadow md:block"><MapPin className="mr-1 inline" size={13}/>Click any survey dot for full telemetry</div>}
    {videoSyncMode&&<div className="absolute bottom-3 right-3 z-20 w-[330px] max-w-[46%] rounded-xl border border-slate-200 bg-slate-950/92 p-3 text-white shadow-xl backdrop-blur"><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-black uppercase tracking-[0.14em] text-cyan-300">Live river-side intelligence</div><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${riverReady?'bg-sky-500/20 text-sky-200':'bg-amber-500/20 text-amber-200'}`}>{riverReady?riverSource:'RIVER CHECK PENDING'}</span></div><div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-300"><span>GPS radius <strong className="text-white">{industryRadiusM} m</strong></span><span>River filter <strong className="text-white">{industryRiverRadiusM} m</strong></span>{currentRiverDistanceM!==null&&<span>Droneâ†’river <strong className="text-sky-200">{Math.round(currentRiverDistanceM)} m</strong></span>}</div>{primaryIndustry?<div className="mt-3 rounded-lg border border-white/10 bg-white/8 p-2.5"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><div className="truncate text-sm font-black text-white">{primaryIndustry.name}</div><div className="mt-0.5 truncate text-[10px] text-slate-300">{primaryIndustry.source==='KIADB'?'KIADB government plot':'OpenStreetMap fallback'}{primaryIndustry.nearest_river_name?` Â· ${primaryIndustry.nearest_river_name}`:''}</div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-black ${primaryIndustry.current_relevance==='HIGH'?'bg-orange-500 text-white':'bg-cyan-500/20 text-cyan-100'}`}>{primaryIndustry.current_relevance==='HIGH'?'HIGH RELEVANCE':'NEARBY'}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-[10px]"><div><div className="text-slate-400">Drone</div><div className="font-black text-white">{Math.round(primaryIndustry.current_distance_m??primaryIndustry.distance_from_route_m)} m</div></div><div><div className="text-slate-400">River</div><div className="font-black text-sky-200">{primaryIndustry.river_distance_m===null?'â€”':`${Math.round(primaryIndustry.river_distance_m)} m`}</div></div><div><div className="text-slate-400">Video</div><div className="font-mono font-black text-amber-300">{primaryIndustry.nearest_video_time}</div></div></div></div>:<div className="mt-3 rounded-lg border border-white/10 bg-white/5 p-3 text-[11px] leading-5 text-slate-300"><strong className="text-white">No river-side industry at this frame.</strong><br/>The drone keeps moving; candidates will appear automatically when they enter the current GPS + river filter.</div>}<div className="mt-2 text-[9px] leading-4 text-slate-400">Orange box = best industry for the CURRENT drone point. Cyan boxes = other nearby river-side industries. Spatial proximity does not prove discharge.</div></div>}
    {streetViewMode&&!videoSyncMode&&<div className={`absolute bottom-3 right-3 z-10 max-w-sm rounded-xl border px-3 py-2 text-[11px] font-semibold leading-5 shadow-lg backdrop-blur ${draggingPegman?'border-sky-300 bg-sky-50/95 text-sky-950':'border-slate-200 bg-white/95 text-slate-700'}`}>{streetNotice}</div>}
    <div className={`absolute bottom-3 left-3 z-30 rounded-xl bg-white/95 p-3 text-xs shadow-lg backdrop-blur ${videoSyncMode?'max-w-[50%]':'max-w-[calc(100%-24px)]'}`}>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1">{videoSyncMode?<><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500"/>SRT Start</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500"/>SRT End</span><span className="flex items-center gap-1.5 font-black text-slate-700"><i className="h-1 w-6 rounded-full bg-white ring-1 ring-slate-700"/>Full SRT route</span><span className="flex items-center gap-1.5 font-black text-slate-700"><i className="h-2 w-2 rounded-full border border-slate-700 bg-white"/>SRT GPS samples</span><span className="flex items-center gap-1.5 font-black text-amber-700"><i className="h-1 w-6 rounded-full bg-amber-500"/>Travelled path</span><span className="flex items-center gap-1.5 font-black text-slate-700"><i className="h-3 w-3 rounded-full border-4 border-white bg-yellow-400 shadow"/>Current video GPS</span>{riverReady&&<span className="flex items-center gap-1.5 font-black text-sky-700"><i className="h-1 w-6 rounded-full bg-sky-500"/>River / stream</span>}<span className="flex items-center gap-1.5 font-black text-amber-700"><i className="h-3 w-3 rounded-full border-2 border-white bg-amber-500 shadow"/>Field observation</span>{industryCandidates.length>0&&<span className="flex items-center gap-1.5 font-black text-cyan-800"><i className="h-3 w-3 rounded-full border-2 border-white bg-cyan-600 shadow"/>Route industries ({industryCandidates.length})</span>}</>:<>{Object.entries(dayColors).map(([day,color])=><span key={day} className="flex items-center gap-1.5 font-semibold text-slate-700"><i className="h-2.5 w-2.5 rounded-full" style={{background:color}}/>Day {day}</span>)}<span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500"/>Start</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-rose-500"/>End</span><span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full border border-slate-400 bg-white"/>Clickable telemetry point</span>{streetViewMode&&<span className="flex items-center gap-1.5 font-black text-sky-700"><i className="h-1 w-6 rounded-full bg-sky-500"/>Street imagery coverage</span>}</>}</div>
      {!videoSyncMode&&selectedFlight&&playback.length>0&&<div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-2"><button onClick={()=>setPlaying(p=>!p)} className="grid h-8 w-8 place-items-center rounded-lg bg-navy-900 text-white">{playing?<Pause size={14}/>:<Play size={14}/>}</button><button onClick={()=>{setPlaying(false);setPlayIndex(0)}} className="grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-slate-700"><RotateCcw size={14}/></button><input aria-label="Flight playback position" type="range" min={0} max={Math.max(0,playback.length-1)} value={playIndex} onChange={e=>{setPlaying(false);setPlayIndex(Number(e.target.value))}} className="w-48 max-w-full"/><Crosshair size={14} className="text-slate-500"/><span className="font-mono text-[11px] text-slate-700">{String(playback[playIndex]?.time??'').replace('T',' ')} - {playback[playIndex]?.abs_alt_m?.toFixed(1)} m</span></div>}
    </div>
  </div>
}

function installData(map:MlMap,tracks:any,endpoints:any,points:any,onSelectFlight:(id:string)=>void,onSelectPoint:(point:TrackPoint)=>void,bbox:[number,number,number,number],registerPopup:(popup:maplibregl.Popup)=>void){
  if(map.getSource('tracks'))return
  map.addSource('tracks',{type:'geojson',data:tracks})
  map.addLayer({id:'tracks-line',type:'line',source:'tracks',paint:{'line-width':['case',['boolean',['feature-state','selected'],false],6,3.3],'line-opacity':.95,'line-color':['match',['get','day'],3,dayColors[3],4,dayColors[4],5,dayColors[5],6,dayColors[6],7,dayColors[7],8,dayColors[8],'#ffffff']}})

  map.addSource('points',{type:'geojson',data:points})
  map.addLayer({id:'track-points-circle',type:'circle',source:'points',paint:{
    'circle-radius':['case',['boolean',['feature-state','selected'],false],8,['interpolate',['linear'],['zoom'],8,2,11,3.2,14,5.2,16,6.5]],
    'circle-color':['match',['get','day'],3,dayColors[3],4,dayColors[4],5,dayColors[5],6,dayColors[6],7,dayColors[7],8,dayColors[8],'#ffffff'],
    'circle-opacity':['case',['boolean',['feature-state','selected'],false],1,.72],
    'circle-stroke-color':['case',['boolean',['feature-state','selected'],false],'#facc15','#ffffff'],
    'circle-stroke-width':['case',['boolean',['feature-state','selected'],false],3,1]
  }})

  map.addSource('endpoints',{type:'geojson',data:endpoints})
  map.addLayer({id:'endpoints-circle',type:'circle',source:'endpoints',paint:{'circle-radius':7,'circle-color':['match',['get','kind'],'start','#22c55e','#ef4444'],'circle-stroke-color':'#ffffff','circle-stroke-width':2.5}})
  map.addLayer({id:'endpoints-label',type:'symbol',source:'endpoints',layout:{'text-field':['get','label'],'text-size':11,'text-offset':[0,1.2],'text-anchor':'top','text-allow-overlap':false},paint:{'text-color':'#ffffff','text-halo-color':'#0f172a','text-halo-width':1.4}})

  for(const layer of ['tracks-line','track-points-circle','endpoints-circle']){
    map.on('mouseenter',layer,()=>map.getCanvas().style.cursor='pointer')
    map.on('mouseleave',layer,()=>map.getCanvas().style.cursor='')
  }

  map.on('click','tracks-line',(e)=>{const id=e.features?.[0]?.properties?.id;if(id)onSelectFlight(String(id))})
  map.on('click','endpoints-circle',(e)=>{
    const feature=e.features?.[0]
    if(!feature)return
    const p=feature.properties ?? {}
    const coords=(feature.geometry as any)?.coordinates
    const id=p.flight_id?String(p.flight_id):''
    if(id)onSelectFlight(id)
    if(!Array.isArray(coords)||coords.length<2)return
    const endpoint={
      title:String(p.label??p.kind??'Survey Point'),
      clip:String(p.clip??'â€”'),
      time:p.time?String(p.time):null,
      frame:p.frame===null||p.frame===undefined||p.frame===''?null:Number(p.frame),
      lat:Number(coords[1]),lon:Number(coords[0]),
      rel_alt_m:p.rel_alt_m===null||p.rel_alt_m===undefined||p.rel_alt_m===''?null:Number(p.rel_alt_m),
      abs_alt_m:p.abs_alt_m===null||p.abs_alt_m===undefined||p.abs_alt_m===''?null:Number(p.abs_alt_m),
      flight_id:id,day:Number(p.day??0),kind:String(p.kind??'')
    }
    const popup=new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:'430px',className:'arkavathi-google-earth-popup'})
      .setLngLat([endpoint.lon,endpoint.lat])
      .setDOMContent(buildGoogleEarthEndpointPopup(endpoint))
      .addTo(map)
    registerPopup(popup)
  })
  map.on('click','track-points-circle',(e)=>{
    const feature=e.features?.[0]
    if(!feature)return
    const point=pointFromFeature(feature)
    if(!point)return
    onSelectPoint(point)
    const popup=new maplibregl.Popup({closeButton:true,closeOnClick:true,maxWidth:'390px',className:'arkavathi-google-earth-popup'})
      .setLngLat([point.lon,point.lat])
      .setDOMContent(buildPointPopup(point))
      .addTo(map)
    registerPopup(popup)
  })
  map.fitBounds([[bbox[0],bbox[1]],[bbox[2],bbox[3]]],{padding:55,duration:0})
}

function pointFromFeature(feature:any):TrackPoint|null{
  const p=feature?.properties ?? {}
  const n=(value:any)=>value===null||value===undefined||value===''?null:Number(value)
  const lat=n(p.lat),lon=n(p.lon)
  if(lat===null||lon===null||!Number.isFinite(lat)||!Number.isFinite(lon))return null
  return {
    point_id:String(p.point_id),flight_id:String(p.flight_id),day:Number(p.day),flight_sequence:Number(p.flight_sequence),clip:String(p.clip),
    point_index:Number(p.point_index),point_count:Number(p.point_count),time:p.time?String(p.time):null,date:p.date?String(p.date):null,time_of_day:p.time_of_day?String(p.time_of_day):null,
    frame:n(p.frame),lat,lon,rel_alt_m:n(p.rel_alt_m),abs_alt_m:n(p.abs_alt_m),source_row:n(p.source_row),source_workbook:p.source_workbook?String(p.source_workbook):null,
    source_time_delta_ms:n(p.source_time_delta_ms),elapsed_seconds:n(p.elapsed_seconds),distance_from_start_m:Number(p.distance_from_start_m??0),progress_pct:Number(p.progress_pct??0),
    detail_status:String(p.detail_status??''),schema_note:String(p.schema_note??'')
  }
}

function buildPointPopup(point:TrackPoint):HTMLElement{
  const root=document.createElement('div')
  root.className='ge-popup-root'

  const title=document.createElement('div')
  title.className='ge-popup-title'
  title.textContent=`Survey Point ${point.point_index} / ${point.point_count}`
  root.append(title)

  const table=document.createElement('div')
  table.className='ge-popup-table'
  addGeRow(table,'Clip',point.clip)
  addGeRow(table,'Time',point.time?point.time.replace('T',' '):(point.day===3?'Not supplied':'â€”'))
  addGeRow(table,'Frame',point.frame===null?(point.day===3?'Not supplied':'â€”'):point.frame.toLocaleString())
  addGeRow(table,'Latitude',point.lat.toFixed(6))
  addGeRow(table,'Longitude',point.lon.toFixed(6))
  addGeRow(table,'Rel_Alt (m)',point.rel_alt_m===null?'Not supplied':point.rel_alt_m.toFixed(1))
  addGeRow(table,'Abs_Alt (m)',point.abs_alt_m===null?'Not supplied':point.abs_alt_m.toFixed(3))
  root.append(table)

  const more=document.createElement('details')
  more.className='ge-popup-more'
  const summary=document.createElement('summary')
  summary.textContent='More point details'
  more.append(summary)
  const extra=document.createElement('div')
  extra.className='ge-popup-extra'
  addGeExtra(extra,'Point ID',point.point_id)
  addGeExtra(extra,'Flight ID',point.flight_id)
  addGeExtra(extra,'Survey Day',`Day ${point.day}`)
  addGeExtra(extra,'Distance from flight start',`${point.distance_from_start_m.toFixed(2)} m`)
  addGeExtra(extra,'Flight progress',`${point.progress_pct.toFixed(2)}%`)
  addGeExtra(extra,'Elapsed time',point.elapsed_seconds===null?'Not available':`${point.elapsed_seconds.toFixed(3)} s`)
  addGeExtra(extra,'Source workbook',point.source_workbook??'â€”')
  addGeExtra(extra,'Excel source row',point.source_row===null?'â€”':point.source_row.toLocaleString())
  more.append(extra)
  root.append(more)
  return root
}

function buildGoogleEarthEndpointPopup(point:{title:string,clip:string,time:string|null,frame:number|null,lat:number,lon:number,rel_alt_m:number|null,abs_alt_m:number|null,flight_id:string,day:number,kind:string}):HTMLElement{
  const root=document.createElement('div')
  root.className='ge-popup-root'
  const title=document.createElement('div')
  title.className='ge-popup-title'
  title.textContent=point.title || (point.kind==='start'?'Start':'End')
  root.append(title)
  const table=document.createElement('div')
  table.className='ge-popup-table'
  addGeRow(table,'Clip',point.clip)
  addGeRow(table,'Time',point.time?point.time.replace('T',' '):(point.day===3?'Not supplied':'â€”'))
  addGeRow(table,'Frame',point.frame===null?(point.day===3?'Not supplied':'â€”'):point.frame.toLocaleString())
  addGeRow(table,'Latitude',point.lat.toFixed(6))
  addGeRow(table,'Longitude',point.lon.toFixed(6))
  addGeRow(table,'Rel_Alt (m)',point.rel_alt_m===null?'Not supplied':point.rel_alt_m.toFixed(1))
  addGeRow(table,'Abs_Alt (m)',point.abs_alt_m===null?'Not supplied':point.abs_alt_m.toFixed(3))
  root.append(table)
  const footer=document.createElement('div')
  footer.className='ge-popup-footer'
  footer.textContent=`${point.flight_id} Â· Day ${point.day} Â· ${point.kind.toUpperCase()}`
  root.append(footer)
  return root
}

function addGeRow(parent:HTMLElement,label:string,value:string){
  const row=document.createElement('div');row.className='ge-popup-row'
  const left=document.createElement('div');left.className='ge-popup-label';left.textContent=label
  const right=document.createElement('div');right.className='ge-popup-value';right.textContent=value
  row.append(left,right);parent.append(row)
}

function addGeExtra(parent:HTMLElement,label:string,value:string){
  const row=document.createElement('div');row.className='ge-extra-row'
  const left=document.createElement('span');left.textContent=label
  const right=document.createElement('strong');right.textContent=value
  row.append(left,right);parent.append(row)
}

function addPopupRow(parent:HTMLElement,label:string,value:string){
  const row=document.createElement('div');row.className='grid grid-cols-[112px_1fr] gap-3 border-b border-slate-100 py-1.5 text-[11px] last:border-0'
  const left=document.createElement('span');left.className='font-semibold text-slate-500';left.textContent=label
  const right=document.createElement('span');right.className='break-all font-semibold text-slate-800';right.textContent=value
  row.append(left,right);parent.append(row)
}

