import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Building2, CalendarDays, CheckCircle2, ChevronDown, ChevronRight, Clock3,
  Database, Download, FileArchive, FileStack, Filter, HardDrive, KeyRound,
  Layers3, LockKeyhole, RefreshCw, Search, ShieldCheck, UploadCloud, X
} from 'lucide-react'
import { api } from '../lib/api'
import type {
  AuthUser, DepartmentId, DepartmentSummary, RepositoryBatch, RepositoryFilters, RepositorySummary
} from '../lib/types'

const departmentOrder:DepartmentId[]=['CIVIL','GIS','SURVEY','LIDAR','PHOTOGRAMMETRY']

const categories:Record<DepartmentId,string[]>={
  CIVIL:['Field Survey','River / Drain Survey','Hydraulic Structures','Outfalls','Water Sampling','Critical Locations','Drawings','BOQ / Estimate','DPR / Report','Other'],
  GIS:['River / Tributary Layer','Watershed Boundary','Drain Network','Structures / Outfalls','GeoDatabase','KML / KMZ','Raster / Basemap','Map Layout','Other'],
  SURVEY:['Drone Telemetry','GNSS / GPS','Total Station','Topographic Survey','Cross Section','Control Points','KML / KMZ','Survey Report','Other'],
  LIDAR:['Raw Point Cloud','Classified Point Cloud','DEM / DTM / DSM','QC / Validation','Derived Products','Point Cloud Tiles','Other'],
  PHOTOGRAMMETRY:['Raw Images','Orthomosaic','Dense Point Cloud','Mesh / 3D Model','Texture','DSM / DTM','Camera / Flight Data','Other']
}

const depHelp:Record<DepartmentId,string>={
  CIVIL:'Civil surveys, structures, drawings, BOQ and reports',
  GIS:'Vector, raster, geodatabase and project mapping data',
  SURVEY:'Drone, GNSS, total-station and field-survey outputs',
  LIDAR:'LAS/LAZ/E57 point clouds and derived terrain products',
  PHOTOGRAMMETRY:'Images, orthomosaics, meshes and 3D products'
}

const allowedFormats='XLS/XLSX/CSV, PDF/DOCX, JPG/PNG/TIF, MP4/MOV, KML/KMZ/GPKG/SHP set, DWG/DXF/IFC, LAS/LAZ/E57/PLY/XYZ, OBJ/FBX/GLB/GLTF, ZIP/7Z/RAR and other enabled project formats.'

type FileState={file:File;progress:number;status:'READY'|'UPLOADING'|'DONE'|'ERROR';message?:string;duplicateOf?:string|null}
type PasskeyMode='UPLOAD'|'BROWSE'
type PasskeyPrompt={department:DepartmentId;mode:PasskeyMode}|null

function bytes(value:number){
  if(!value)return '0 B'
  const units=['B','KB','MB','GB','TB'];let n=value;let i=0
  while(n>=1024&&i<units.length-1){n/=1024;i++}
  return `${n>=10||i===0?n.toFixed(i===0?0:1):n.toFixed(2)} ${units[i]}`
}

function dt(value:string|null|undefined){
  if(!value)return '-'
  const d=new Date(value);return Number.isNaN(d.getTime())?value:d.toLocaleString()
}

function todayLocal(){
  const d=new Date();const off=d.getTimezoneOffset()*60000
  return new Date(d.getTime()-off).toISOString().slice(0,10)
}

export function DepartmentDataHub({user}:{user:AuthUser}){
  const isAdmin=user.role==='COMPANY_ADMIN'
  const [departments,setDepartments]=useState<DepartmentSummary[]>([])
  const [summary,setSummary]=useState<RepositorySummary|null>(null)
  const [batches,setBatches]=useState<RepositoryBatch[]>([])
  const [selected,setSelected]=useState<DepartmentId|null>(null)
  const [filters,setFilters]=useState<RepositoryFilters>({order:'latest'})
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [loading,setLoading]=useState(false)
  const [expanded,setExpanded]=useState<string|null>(null)
  const [showPasskeys,setShowPasskeys]=useState(false)
  const [rotated,setRotated]=useState<{department:string;passkey:string}|null>(null)

  // Passkeys are never stored in localStorage/sessionStorage.
  // Browse grants live only in this React component and disappear on refresh/navigation.
  const [browseTokens,setBrowseTokens]=useState<Partial<Record<DepartmentId,string>>>({})
  const [uploadToken,setUploadToken]=useState<string|null>(null)
  const [passkeyPrompt,setPasskeyPrompt]=useState<PasskeyPrompt>(null)
  const [passkey,setPasskey]=useState('')

  const [showUpload,setShowUpload]=useState(false)
  const [uploadForm,setUploadForm]=useState({data_date:todayLocal(),category:'',description:'',remarks:'',uploader_label:''})
  const [files,setFiles]=useState<FileState[]>([])
  const [activeBatch,setActiveBatch]=useState<string|null>(null)
  const fileInput=useRef<HTMLInputElement|null>(null)

  async function loadDepartments(){
    const d=await api.repositoryDepartments();setDepartments(d)
    if(!selected&&d.length)setSelected(d[0].id)
  }

  async function loadAdmin(){
    if(!isAdmin)return
    const [s,b]=await Promise.all([api.companyRepositorySummary(),api.companyRepositoryBatches(filters)])
    setSummary(s);setBatches(b)
  }

  async function loadDepartment(id:DepartmentId,token?:string){
    const t=token||browseTokens[id]
    if(!t){setBatches([]);return}
    try{setBatches(await api.departmentRepositoryBatches(t,{...filters,department_id:''}))}
    catch(e:any){
      if(e?.status===403)setBrowseTokens(v=>({...v,[id]:undefined}))
      throw e
    }
  }

  async function refresh(){
    setError('');setLoading(true)
    try{
      await loadDepartments()
      if(isAdmin)await loadAdmin()
      else if(selected&&browseTokens[selected])await loadDepartment(selected)
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }

  useEffect(()=>{refresh()},[])
  useEffect(()=>{
    if(!selected)return
    setUploadForm(v=>({...v,category:categories[selected][0]}))
    setUploadToken(null);setShowUpload(false);setFiles([]);setActiveBatch(null)
    setPasskeyPrompt(null);setPasskey('');setNotice('');setError('')
    if(!isAdmin&&browseTokens[selected])loadDepartment(selected).catch(e=>setError(e instanceof Error?e.message:String(e)))
    else if(!isAdmin)setBatches([])
  },[selected])

  async function applyFilters(e?:FormEvent){
    e?.preventDefault();setError('');setLoading(true)
    try{isAdmin?await loadAdmin():selected&&await loadDepartment(selected)}catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }

  function requestPasskey(mode:PasskeyMode,department?:DepartmentId){
    const dep=department||selected
    if(!dep)return
    setError('');setNotice('');setPasskey('');setPasskeyPrompt({department:dep,mode})
  }

  async function verifyPasskey(e:FormEvent){
    e.preventDefault();if(!passkeyPrompt)return
    setLoading(true);setError('');setNotice('')
    try{
      const result=await api.unlockDepartment(passkeyPrompt.department,passkey,passkeyPrompt.mode)
      setSelected(result.department.id)
      setPasskey('')
      if(passkeyPrompt.mode==='UPLOAD'){
        // One upload grant = exactly one upload batch. Backend enforces this too.
        setUploadToken(result.token)
        setFiles([]);setActiveBatch(null)
        setUploadForm({data_date:todayLocal(),category:categories[result.department.id][0],description:'',remarks:'',uploader_label:''})
        setShowUpload(true)
        setNotice(`${result.department.name} passkey verified for this upload batch only. The next new batch will ask for the passkey again.`)
      }else{
        setBrowseTokens(v=>({...v,[result.department.id]:result.token}))
        await loadDepartment(result.department.id,result.token)
        setNotice(`${result.department.name} history opened. This browse access is kept only in memory and is not saved in the browser.`)
      }
      setPasskeyPrompt(null)
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }

  function chooseFiles(event:ChangeEvent<HTMLInputElement>){
    const picked=Array.from(event.target.files||[])
    setFiles(prev=>{
      const seen=new Set(prev.map(x=>`${x.file.name}|${x.file.size}|${x.file.lastModified}`))
      const next=[...prev]
      for(const file of picked){
        const key=`${file.name}|${file.size}|${file.lastModified}`
        if(!seen.has(key)){seen.add(key);next.push({file,progress:0,status:'READY'})}
      }
      return next
    })
    event.target.value=''
  }

  async function uploadAll(){
    if(!selected)return
    if(!uploadToken){requestPasskey('UPLOAD',selected);return}
    if(!files.length){setError('Select one or more files first.');return}
    if(!uploadForm.category){setError('Select a data category.');return}
    setError('');setNotice('');setLoading(true)
    try{
      let batchId=activeBatch
      if(!batchId){
        const batch=await api.createRepositoryBatch(uploadToken,uploadForm)
        batchId=batch.public_id;setActiveBatch(batchId)
      }
      let failed=false
      for(let i=0;i<files.length;i++){
        if(files[i].status==='DONE')continue
        setFiles(v=>v.map((x,j)=>j===i?{...x,status:'UPLOADING',message:undefined}:x))
        try{
          const result=await api.uploadRepositoryFile(uploadToken,batchId,files[i].file,(pct)=>setFiles(v=>v.map((x,j)=>j===i?{...x,progress:pct}:x)))
          setFiles(v=>v.map((x,j)=>j===i?{...x,status:'DONE',progress:100,duplicateOf:result.duplicate_of,message:result.duplicate_of?`Duplicate of ${result.duplicate_of}; preserved as a traceable upload.`:'Uploaded and checksum verified.'}:x))
        }catch(e){
          failed=true;setFiles(v=>v.map((x,j)=>j===i?{...x,status:'ERROR',message:e instanceof Error?e.message:String(e)}:x))
        }
      }
      if(failed){setError(`Batch ${batchId} is not finalized because one or more files need retry. Retry continues the same batch without another passkey.`);return}
      await api.finalizeRepositoryBatch(uploadToken,batchId)
      setNotice(`Batch ${batchId} completed. Department passkey cleared. Enter it again for the next new upload batch.`)
      setUploadToken(null);setFiles([]);setActiveBatch(null);setShowUpload(false)
      if(isAdmin)await Promise.all([loadDepartments(),loadAdmin()])
      else if(browseTokens[selected])await loadDepartment(selected,browseTokens[selected])
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }

  function closeUpload(){
    if(activeBatch){
      const ok=confirm('This upload batch is still active. Closing only hides this window; keep this page open if you want to resume the same batch without entering the passkey again.')
      if(!ok)return
    }
    setShowUpload(false)
    if(!activeBatch){setUploadToken(null);setFiles([])}
  }

  async function rotatePasskey(id:DepartmentId){
    if(!confirm(`Rotate the ${id} passkey? Existing temporary browse/upload grants will be invalidated.`))return
    setError('');setRotated(null)
    try{
      const r=await api.rotateDepartmentPasskey(id)
      setBrowseTokens(v=>({...v,[id]:undefined}))
      if(selected===id){setUploadToken(null);setShowUpload(false)}
      setRotated({department:r.department_name,passkey:r.passkey});setShowPasskeys(true)
    }catch(e){setError(e instanceof Error?e.message:String(e))}
  }

  async function downloadFiltered(){
    setError('')
    try{
      if(isAdmin)await api.downloadCompanyRepositoryExport(filters)
      else if(selected&&browseTokens[selected])await api.downloadDepartmentRepositoryExport(browseTokens[selected]!,filters)
      else requestPasskey('BROWSE',selected||undefined)
    }catch(e){setError(e instanceof Error?e.message:String(e))}
  }

  function departmentDownloadToken(){
    if(isAdmin)return undefined
    return selected?browseTokens[selected]:undefined
  }

  const selectedDep=departments.find(d=>d.id===selected)
  const browseToken=selected?browseTokens[selected]:undefined
  const totalSelectedBytes=useMemo(()=>files.reduce((a,b)=>a+b.file.size,0),[files])

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
      <div><div className="text-xs font-black uppercase tracking-[0.18em] text-navy-700">Nakshatech internal project repository</div><h2 className="mt-1 text-2xl font-black text-slate-950">Department Data Hub</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-slate-500">Civil, GIS, Survey, LiDAR and Photogrammetry upload into isolated department namespaces. Every <strong>new upload batch requires the department passkey again</strong>; no department stays permanently unlocked.</p></div>
      <div className="flex flex-wrap gap-2"><button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw size={14}/>Refresh</button><button onClick={downloadFiltered} className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-4 py-2 text-xs font-black text-white"><Download size={14}/>{isAdmin?'Download filtered / all':'Download department data'}</button></div>
    </div>

    {error&&<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{error}</div>}
    {notice&&<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-800">{notice}</div>}

    {isAdmin&&summary&&<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[
        ['Departments',summary.departments,Building2],['Completed batches',summary.total_batches,FileStack],['Files',summary.total_files,Database],['Storage',bytes(summary.total_bytes),HardDrive],['Today',summary.today_batches,Clock3]
      ].map(([label,value,Icon]:any)=><div key={label} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><Icon size={17} className="text-navy-700"/><div className="mt-2 text-2xl font-black text-slate-900">{value}</div><div className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div></div>)}
    </div>}

    <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
      {departmentOrder.map(id=>departments.find(d=>d.id===id)).filter(Boolean).map(dep=>{
        dep=dep as DepartmentSummary
        const active=selected===dep.id
        return <button key={dep.id} type="button" onClick={()=>setSelected(dep.id)} className={`rounded-2xl border p-4 text-left transition ${active?'border-navy-700 bg-blue-50 ring-2 ring-blue-100':'border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50'}`}>
          <div className="flex items-start justify-between"><div className="grid h-10 w-10 place-items-center rounded-xl bg-navy-950 text-xs font-black text-white">{dep.code}</div><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700"><LockKeyhole size={11}/>Passkey protected</span></div>
          <div className="mt-3 font-black text-slate-900">{dep.name}</div><div className="mt-1 min-h-8 text-[11px] leading-4 text-slate-500">{depHelp[dep.id]}</div>
          {isAdmin&&<div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-slate-500"><div><strong className="text-slate-800">{dep.total_batches}</strong> batches</div><div><strong className="text-slate-800">{dep.total_files}</strong> files</div><div className="col-span-2">Last: {dt(dep.last_upload_at)}</div></div>}
        </button>
      })}
    </div>

    {selectedDep&&<div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="text-xs font-black uppercase tracking-wider text-navy-700">Selected department</div><div className="mt-1 text-lg font-black text-slate-900">{selectedDep.name} <span className="text-sm font-semibold text-slate-400">{selectedDep.id}</span></div><div className="mt-1 text-xs text-slate-500">The passkey is treated like a department password. It is required again for every new upload batch.</div></div><div className="flex flex-wrap gap-2"><button onClick={()=>requestPasskey('UPLOAD',selectedDep.id)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-black text-white"><UploadCloud size={15}/>New upload · enter passkey</button>{!isAdmin&&<button onClick={()=>requestPasskey('BROWSE',selectedDep.id)} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-black text-slate-700"><KeyRound size={15}/>{browseToken?'Re-enter passkey':'View department history'}</button>}{isAdmin&&<button onClick={()=>rotatePasskey(selectedDep.id)} className="rounded-xl border border-amber-300 bg-white px-3 py-2.5 text-xs font-bold text-amber-800">Rotate passkey</button>}</div></div>
    </div>}

    <form onSubmit={applyFilters} className="mt-5 grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
      {isAdmin&&<label className="text-[11px] font-bold text-slate-500">Department<select value={filters.department_id||''} onChange={e=>setFilters(v=>({...v,department_id:e.target.value as any}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"><option value="">All departments</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>}
      <label className="text-[11px] font-bold text-slate-500">Upload date from<input type="date" value={filters.date_from||''} onChange={e=>setFilters(v=>({...v,date_from:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"/></label>
      <label className="text-[11px] font-bold text-slate-500">Upload date to<input type="date" value={filters.date_to||''} onChange={e=>setFilters(v=>({...v,date_to:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"/></label>
      <label className="text-[11px] font-bold text-slate-500">Data date from<input type="date" value={filters.data_date_from||''} onChange={e=>setFilters(v=>({...v,data_date_from:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"/></label>
      <label className="text-[11px] font-bold text-slate-500">Data date to<input type="date" value={filters.data_date_to||''} onChange={e=>setFilters(v=>({...v,data_date_to:e.target.value}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"/></label>
      <label className="text-[11px] font-bold text-slate-500">File type<input value={filters.extension||''} onChange={e=>setFilters(v=>({...v,extension:e.target.value}))} placeholder=".laz / .kmz" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"/></label>
      <label className="text-[11px] font-bold text-slate-500">Order<select value={filters.order||'latest'} onChange={e=>setFilters(v=>({...v,order:e.target.value as any}))} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs"><option value="latest">Latest first</option><option value="oldest">Oldest first</option></select></label>
      <div className="flex items-end"><button className="w-full rounded-lg bg-navy-950 px-3 py-2 text-xs font-black text-white"><Filter size={13} className="mr-1 inline"/>Apply</button></div>
      <label className="sm:col-span-2 lg:col-span-4 xl:col-span-8"><div className="relative"><Search className="absolute left-3 top-2.5 text-slate-400" size={15}/><input value={filters.search||''} onChange={e=>setFilters(v=>({...v,search:e.target.value}))} placeholder="Search batch ID, description, remarks or uploader..." className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs"/></div></label>
    </form>

    {!isAdmin&&!browseToken?<div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center"><KeyRound size={28} className="mx-auto text-slate-400"/><div className="mt-3 font-black text-slate-800">Department history is protected</div><div className="mt-1 text-sm text-slate-500">Enter the selected department passkey to view or download its previous data dumps.</div><button onClick={()=>selected&&requestPasskey('BROWSE',selected)} className="mt-4 rounded-xl bg-navy-950 px-4 py-2.5 text-xs font-black text-white">Enter passkey to view history</button></div>:
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[1180px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3"></th><th className="px-3 py-3">Uploaded</th><th className="px-3 py-3">Department</th><th className="px-3 py-3">Batch</th><th className="px-3 py-3">Data date</th><th className="px-3 py-3">Category</th><th className="px-3 py-3">Uploader</th><th className="px-3 py-3">Files</th><th className="px-3 py-3">Size</th><th className="px-3 py-3">Download</th></tr></thead><tbody>{batches.map(batch=><Fragment key={batch.public_id}>
        <tr className="border-t border-slate-100"><td className="px-3 py-3"><button onClick={()=>setExpanded(v=>v===batch.public_id?null:batch.public_id)} className="text-slate-500">{expanded===batch.public_id?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button></td><td className="px-3 py-3"><div className="font-semibold text-slate-800">{dt(batch.created_at)}</div><div className="text-[10px] text-slate-400">Exact dump time</div></td><td className="px-3 py-3 font-black text-navy-800">{batch.department_name}</td><td className="px-3 py-3 font-mono text-[11px] font-bold">{batch.public_id}</td><td className="px-3 py-3">{batch.data_date}</td><td className="px-3 py-3">{batch.category}</td><td className="px-3 py-3"><div>{batch.uploader_label||batch.created_by_name}</div><div className="text-[10px] text-slate-400">{batch.created_by_name}</div></td><td className="px-3 py-3 font-bold">{batch.total_files}</td><td className="px-3 py-3">{bytes(batch.total_bytes)}</td><td className="px-3 py-3"><button onClick={()=>api.downloadRepositoryBatch(batch.public_id,departmentDownloadToken()).catch(e=>setError(e instanceof Error?e.message:String(e)))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-bold text-slate-700"><Download size={12}/>Batch ZIP</button></td></tr>
        {expanded===batch.public_id&&<tr className="bg-slate-50/60"><td colSpan={10} className="px-5 py-4"><div className="mb-3 grid gap-2 md:grid-cols-2"><div><span className="font-bold">Description:</span> {batch.description||'-'}</div><div><span className="font-bold">Remarks:</span> {batch.remarks||'-'}</div></div><div className="overflow-hidden rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[850px]"><thead className="bg-slate-50 text-[10px] text-slate-500"><tr><th className="px-3 py-2">File</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Size</th><th className="px-3 py-2">Version</th><th className="px-3 py-2">Checksum</th><th className="px-3 py-2">Duplicate</th><th className="px-3 py-2"></th></tr></thead><tbody>{batch.files.map(f=><tr key={f.public_id} className="border-t border-slate-100"><td className="px-3 py-2"><div className="font-bold text-slate-800">{f.original_name}</div><div className="font-mono text-[9px] text-slate-400">{f.public_id}</div></td><td className="px-3 py-2">{f.extension}</td><td className="px-3 py-2">{bytes(f.size_bytes)}</td><td className="px-3 py-2">V{f.version_no}</td><td className="px-3 py-2 font-mono text-[9px]">{f.sha256.slice(0,16)}...</td><td className="px-3 py-2">{f.duplicate_of?<span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-bold text-amber-700">{f.duplicate_of}</span>:'-'}</td><td className="px-3 py-2"><button onClick={()=>api.downloadRepositoryFile(f.public_id,f.original_name,departmentDownloadToken()).catch(e=>setError(e instanceof Error?e.message:String(e)))} className="rounded-lg border border-slate-300 px-2 py-1 text-[10px] font-bold"><Download size={11} className="mr-1 inline"/>File</button></td></tr>)}</tbody></table></div></td></tr>}
      </Fragment>)}</tbody></table>
      {!batches.length&&<div className="p-10 text-center text-sm text-slate-500">No completed department data batches match the selected filters.</div>}
    </div>}

    <div className="mt-4 grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-900"><ShieldCheck size={15} className="mb-1"/><strong>Every upload re-authenticates.</strong> A passkey grant can create only one new batch; the backend rejects reuse for another batch.</div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-900"><Layers3 size={15} className="mb-1"/><strong>No department collision.</strong> Civil, GIS, Survey, LiDAR and Photogrammetry are stored in separate namespaces with unique batch/file IDs.</div>
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-navy-900"><CalendarDays size={15} className="mb-1"/><strong>Day-wise traceability.</strong> Work date, exact upload timestamp, uploader, checksum, version and download history remain recorded.</div>
    </div>

    {passkeyPrompt&&<div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"><form onSubmit={verifyPasskey} className="w-full max-w-md rounded-3xl border border-white/20 bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-950 text-white"><KeyRound size={22}/></div><button type="button" onClick={()=>{setPasskeyPrompt(null);setPasskey('')}} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18}/></button></div><div className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-navy-700">{passkeyPrompt.mode==='UPLOAD'?'Upload authorization':'Repository authorization'}</div><h3 className="mt-1 text-xl font-black text-slate-950">Enter {departments.find(d=>d.id===passkeyPrompt.department)?.name||passkeyPrompt.department} passkey</h3><p className="mt-2 text-sm leading-6 text-slate-500">{passkeyPrompt.mode==='UPLOAD'?'Required every time a new upload batch is started. The passkey is not remembered after the batch is completed.':'Required to view/download this department’s private history. It is not saved in browser storage.'}</p><input autoFocus type="password" value={passkey} onChange={e=>setPasskey(e.target.value)} placeholder="Department passkey" className="mt-5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/><div className="mt-4 flex justify-end gap-2"><button type="button" onClick={()=>{setPasskeyPrompt(null);setPasskey('')}} className="rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700">Cancel</button><button disabled={loading||!passkey.trim()} className="rounded-xl bg-navy-950 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{loading?'Verifying…':'Verify passkey'}</button></div></form></div>}

    {showUpload&&selected&&selectedDep&&uploadToken&&<div className="fixed inset-0 z-[110] bg-slate-950/65 p-3 backdrop-blur-sm md:p-6"><div className="mx-auto flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><div><div className="text-xs font-black uppercase tracking-[0.16em] text-emerald-700">Passkey verified · one batch only</div><h3 className="mt-1 text-xl font-black text-slate-950">New {selectedDep.name} upload batch</h3><p className="mt-1 text-xs text-slate-500">Mixed file formats are allowed together. Starting another new batch will require the {selectedDep.name} passkey again.</p></div><button onClick={closeUpload} className="rounded-xl p-2 text-slate-400 hover:bg-slate-100"><X size={20}/></button></div><div className="overflow-y-auto p-5">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-bold text-slate-600">Work / data date<input type="date" value={uploadForm.data_date} onChange={e=>setUploadForm(v=>({...v,data_date:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"/></label><label className="text-xs font-bold text-slate-600">Category<select value={uploadForm.category} onChange={e=>setUploadForm(v=>({...v,category:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{categories[selected].map(c=><option key={c}>{c}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Uploader / team member<input value={uploadForm.uploader_label} onChange={e=>setUploadForm(v=>({...v,uploader_label:e.target.value}))} placeholder="Name or team label" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"/></label><label className="text-xs font-bold text-slate-600">Description<input value={uploadForm.description} onChange={e=>setUploadForm(v=>({...v,description:e.target.value}))} placeholder="Short description" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"/></label></div>
      <label className="mt-3 block text-xs font-bold text-slate-600">Remarks<textarea value={uploadForm.remarks} onChange={e=>setUploadForm(v=>({...v,remarks:e.target.value}))} rows={2} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm" placeholder="Optional notes about this data dump"/></label>
      <input ref={fileInput} type="file" multiple className="hidden" onChange={chooseFiles}/>
      <div onClick={()=>fileInput.current?.click()} className="mt-4 cursor-pointer rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-6 text-center transition hover:bg-emerald-50"><UploadCloud className="mx-auto text-emerald-700" size={28}/><div className="mt-2 font-black text-slate-900">Select multiple files</div><div className="mt-1 text-xs text-slate-500">Choose many files at once, including different formats, then add more before upload if needed.</div><div className="mx-auto mt-2 max-w-4xl text-[10px] leading-5 text-slate-400">{allowedFormats}</div></div>
      {files.length>0&&<div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="flex items-center justify-between bg-slate-50 px-3 py-2 text-xs"><strong>{files.length} files selected</strong><span>{bytes(totalSelectedBytes)}</span></div>{files.map((item,i)=><div key={`${item.file.name}-${item.file.size}-${i}`} className="border-t border-slate-100 px-3 py-3"><div className="flex items-start gap-3"><FileArchive size={17} className="mt-0.5 shrink-0 text-slate-500"/><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="truncate text-xs font-bold text-slate-800">{item.file.name}</div><div className="text-[10px] text-slate-400">{bytes(item.file.size)} · {item.status}</div></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${item.status==='ERROR'?'bg-rose-500':item.status==='DONE'?'bg-emerald-500':'bg-blue-600'}`} style={{width:`${item.progress}%`}}/></div>{item.message&&<div className={`mt-1 text-[10px] ${item.status==='ERROR'?'text-rose-700':'text-slate-500'}`}>{item.message}</div>}</div>{item.status==='READY'&&<button onClick={()=>setFiles(v=>v.filter((_,j)=>j!==i))} className="text-slate-400 hover:text-rose-600"><X size={15}/></button>}</div></div>)}</div>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><div className="text-[11px] leading-5 text-slate-500">8 MB resumable chunks · SHA-256 checksum · duplicate/version tracking · department-isolated storage.</div><div className="flex gap-2"><button type="button" onClick={()=>fileInput.current?.click()} className="rounded-xl border border-emerald-300 bg-white px-4 py-2.5 text-xs font-bold text-emerald-800">+ Add more files</button><button type="button" disabled={loading||!files.length} onClick={uploadAll} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">{loading?'Uploading…':activeBatch?'Resume / finish batch':'Upload batch'}</button></div></div>
    </div></div></div>}

    {showPasskeys&&rotated&&<div className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/65 p-4"><div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><CheckCircle2 size={28} className="text-emerald-600"/><h3 className="mt-3 text-xl font-black text-slate-950">{rotated.department} passkey rotated</h3><p className="mt-2 text-sm text-slate-500">Store this securely. Existing temporary grants were invalidated.</p><div className="mt-4 select-all rounded-xl bg-slate-950 p-4 font-mono text-sm font-bold text-white">{rotated.passkey}</div><button onClick={()=>setShowPasskeys(false)} className="mt-4 w-full rounded-xl bg-navy-950 px-4 py-2.5 text-xs font-black text-white">Close</button></div></div>}
  </section>
}
