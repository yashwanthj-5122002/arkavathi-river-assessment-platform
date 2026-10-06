import type {
  AccessSummary,
  AuthUser,
  CivilEntry,
  CivilEntryType,
  CivilStatus,
  DataAvailability,
  DepartmentId,
  DepartmentSummary,
  DepartmentUnlock,
  FlightDetail,
  FlightListItem,
  InstitutionOverview,
  PortalConfig,
  PortalId,
  RepositoryAuditItem,
  RepositoryBatch,
  RepositoryFilters,
  RepositorySummary,
  Summary,
  UploadInit,
  Verification,
  PermissionProfile,
  ProjectEvent,
  ProjectEventImage,
  ProjectEventStatus,
  ScientificRecord,
  ScientificRecordStatus,
  ScientificRecordType,
  ScientificPackage,
  ScientificPackageStatus,
  ScientificSummary,
  DatasetValidationResult,
  MicroCatchment,
  IndustryObservation,
  IndustryObservationStatus,
  IndustryDischargeStatus,
  IndustryCategory,
  IndustryIntelligenceSummary,
  IndustryDiscoveryResult,
  IndustrySourceStatus,
  TaskItem,
  TaskPriority,
  TaskStatus,
  TaskTargets,
  WorkflowAuditItem,
  WorkflowItem,
  WorkflowNotification,
  WorkflowSourceType,
  WorkflowStatus
} from './types'

export const API_BASE = ''

class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string){
    super(message)
    this.status = status
    this.code = code
  }
}

async function parseResponse<T>(response:Response):Promise<T>{
  const text=await response.text()
  let parsed:any=null
  if(text){try{parsed=JSON.parse(text)}catch{parsed=null}}
  if(!response.ok){
    const message=parsed?.detail||`${response.status} ${response.statusText}`
    throw new ApiError(message,response.status,parsed?.code)
  }
  return (parsed??{}) as T
}

async function requestJson<T>(path:string,init?:RequestInit):Promise<T>{
  let response:Response
  try{
    response=await fetch(`${API_BASE}${path}`,{
      credentials:'include',
      ...init,
      headers:{
        ...(init?.body?{'Content-Type':'application/json'}:{}),
        ...(init?.headers??{})
      }
    })
  }catch(error){
    throw new Error(`Arkavati service is not reachable. (${String(error)})`)
  }
  return parseResponse<T>(response)
}

function filterQuery(filters?:RepositoryFilters){
  const q=new URLSearchParams()
  if(!filters)return ''
  Object.entries(filters).forEach(([key,value])=>{
    if(value!==undefined&&value!==null&&String(value).trim()!=='')q.set(key,String(value))
  })
  return q.toString()?`?${q.toString()}`:''
}

function departmentHeaders(token:string,extra?:HeadersInit):HeadersInit{
  return {'X-Department-Token':token,...(extra as Record<string,string>|undefined)}
}

async function downloadBlob(path:string,filename:string,departmentToken?:string){
  const response=await fetch(path,{credentials:'include',headers:departmentToken?departmentHeaders(departmentToken):undefined})
  if(!response.ok){
    const text=await response.text();let parsed:any={}
    try{parsed=text?JSON.parse(text):{}}catch{}
    throw new ApiError(parsed?.detail||`${response.status} ${response.statusText}`,response.status,parsed?.code)
  }
  const blob=await response.blob()
  const url=URL.createObjectURL(blob)
  const a=document.createElement('a')
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove()
  setTimeout(()=>URL.revokeObjectURL(url),30000)
}

const dayQuery=(days:number[])=>days.length?`?days=${days.join(',')}`:''

export const api={
  health:()=>requestJson<{status:string;service:string;version:string;auth?:string}>('/health'),
  portalConfig:()=>requestJson<PortalConfig>('/api/v1/auth/portal-config'),
  me:()=>requestJson<{user:AuthUser}>('/api/v1/auth/me'),
  login:(payload:{portal:PortalId;email:string;password:string;institution_id?:string})=>requestJson<{user:AuthUser}>('/api/v1/auth/login',{method:'POST',body:JSON.stringify(payload)}),
  logout:()=>requestJson<{status:string}>('/api/v1/auth/logout',{method:'POST',body:'{}'}),
  changePassword:(currentPassword:string,newPassword:string)=>requestJson<{status:string;message:string;reauthenticate:boolean}>('/api/v1/auth/change-password',{method:'POST',body:JSON.stringify({current_password:currentPassword,new_password:newPassword})}),

  events:(status?:ProjectEventStatus)=>requestJson<ProjectEvent[]>(`/api/v1/events${status?`?status=${encodeURIComponent(status)}`:''}`),
  upcomingEvent:async()=>{
    const value=await requestJson<ProjectEvent|null|Record<string,never>>('/api/v1/events/upcoming')
    if(!value||typeof value!=='object'||typeof (value as any).public_id!=='string')return null
    const event=value as ProjectEvent
    return {...event,images:Array.isArray(event.images)?event.images:[]}
  },
  completedEvents:(limit=50)=>requestJson<ProjectEvent[]>(`/api/v1/events/completed?limit=${limit}`),
  event:(id:string)=>requestJson<ProjectEvent>(`/api/v1/events/${encodeURIComponent(id)}`),
  createEvent:(payload:{title:string;event_date?:string;event_time?:string;location?:string;short_description?:string;description?:string;status:ProjectEventStatus})=>requestJson<ProjectEvent>('/api/v1/events',{method:'POST',body:JSON.stringify(payload)}),
  updateEvent:(id:string,payload:{title:string;event_date?:string;event_time?:string;location?:string;short_description?:string;description?:string;status:ProjectEventStatus})=>requestJson<ProjectEvent>(`/api/v1/events/${encodeURIComponent(id)}/update`,{method:'POST',body:JSON.stringify(payload)}),
  setEventStatus:(id:string,status:ProjectEventStatus)=>requestJson<ProjectEvent>(`/api/v1/events/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status})}),
  deleteEvent:(id:string)=>requestJson<{status:string;deleted:string}>(`/api/v1/events/${encodeURIComponent(id)}/delete`,{method:'POST',body:'{}'}),
  uploadEventImage:async(id:string,file:File)=>{
    const response=await fetch(`/api/v1/events/${encodeURIComponent(id)}/images?filename=${encodeURIComponent(file.name)}`,{method:'POST',credentials:'include',headers:{'Content-Type':file.type||'application/octet-stream'},body:file})
    return parseResponse<ProjectEventImage>(response)
  },
  deleteEventImage:(eventId:string,imageId:string)=>requestJson<{status:string;deleted:string}>(`/api/v1/events/${encodeURIComponent(eventId)}/images/${encodeURIComponent(imageId)}/delete`,{method:'POST',body:'{}'}),

  industryIntelligenceSummary:()=>requestJson<IndustryIntelligenceSummary>('/api/v1/industry-intelligence/summary'),
  industryObservations:(filters?:{status?:IndustryObservationStatus|'';discharge_status?:IndustryDischargeStatus|'';day?:number|string;search?:string;limit?:number})=>{
    const q=new URLSearchParams()
    if(filters)Object.entries(filters).forEach(([key,value])=>{if(value!==undefined&&value!==null&&String(value).trim()!=='')q.set(key,String(value))})
    return requestJson<IndustryObservation[]>(`/api/v1/industry-intelligence/observations${q.toString()?`?${q.toString()}`:''}`)
  },
  industryObservation:(id:string)=>requestJson<IndustryObservation>(`/api/v1/industry-intelligence/observations/${encodeURIComponent(id)}`),
  createIndustryObservation:(payload:{name?:string;category?:IndustryCategory;latitude:number;longitude:number;video_name:string;srt_name:string;video_time_seconds:number;heading?:number|null;status?:IndustryObservationStatus;discharge_status?:IndustryDischargeStatus;discharge_notes?:string;notes?:string;registration_reference?:string})=>requestJson<IndustryObservation>('/api/v1/industry-intelligence/observations',{method:'POST',body:JSON.stringify(payload)}),
  updateIndustryObservation:(id:string,payload:{name?:string;category?:IndustryCategory;discharge_status?:IndustryDischargeStatus;discharge_notes?:string;notes?:string;registration_reference?:string})=>requestJson<IndustryObservation>(`/api/v1/industry-intelligence/observations/${encodeURIComponent(id)}/update`,{method:'POST',body:JSON.stringify(payload)}),
  setIndustryObservationStatus:(id:string,status:IndustryObservationStatus,registration_reference='')=>requestJson<IndustryObservation>(`/api/v1/industry-intelligence/observations/${encodeURIComponent(id)}/status`,{method:'POST',body:JSON.stringify({status,registration_reference})}),
  deleteIndustryObservation:(id:string)=>requestJson<{status:string;deleted:string}>(`/api/v1/industry-intelligence/observations/${encodeURIComponent(id)}/delete`,{method:'POST',body:'{}'}),
  uploadIndustryEvidence:async(id:string,blob:Blob,filename:string)=>{
    let response:Response
    try{response=await fetch(`/api/v1/industry-intelligence/observations/${encodeURIComponent(id)}/evidence?filename=${encodeURIComponent(filename)}`,{method:'POST',credentials:'include',headers:{'Content-Type':blob.type||'image/jpeg'},body:blob})}
    catch(error){throw new Error(`Arkavati service is not reachable. (${String(error)})`)}
    return parseResponse<IndustryObservation>(response)
  },
industrySourceStatus:()=>requestJson<IndustrySourceStatus>('/api/v1/industry/status'),
  latestIndustryDiscovery:()=>requestJson<IndustryDiscoveryResult>('/api/v1/industry/latest'),
  discoverIndustries:(payload:{route:{time:number;lat:number;lng:number}[];video_name?:string;srt_name?:string;radius_m?:number;river_radius_m?:number;include_osm?:boolean})=>requestJson<IndustryDiscoveryResult>('/api/v1/industry/discover',{method:'POST',body:JSON.stringify(payload)}),

  scientificSummary:()=>requestJson<ScientificSummary>('/api/v1/scientific/summary'),
  scientificMicroCatchments:()=>requestJson<MicroCatchment[]>('/api/v1/scientific/micro-catchments'),
  scientificRecords:(filters?:{record_type?:ScientificRecordType;status?:ScientificRecordStatus;institution_id?:string;micro_catchment_id?:string;limit?:number})=>{
    const q=new URLSearchParams();if(filters?.record_type)q.set('record_type',filters.record_type);if(filters?.status)q.set('status',filters.status);if(filters?.institution_id)q.set('institution_id',filters.institution_id);if(filters?.micro_catchment_id)q.set('micro_catchment_id',filters.micro_catchment_id);if(filters?.limit)q.set('limit',String(filters.limit))
    return requestJson<ScientificRecord[]>(`/api/v1/scientific/records${q.toString()?`?${q.toString()}`:''}`)
  },
  createScientificRecord:(payload:{record_type:ScientificRecordType;institution_id?:string;micro_catchment_id?:string;fields:Record<string,any>;metadata?:Record<string,any>;submit?:boolean})=>requestJson<ScientificRecord>('/api/v1/scientific/records',{method:'POST',body:JSON.stringify(payload)}),
  updateScientificRecord:(id:string,payload:{institution_id?:string;micro_catchment_id?:string;fields?:Record<string,any>;metadata?:Record<string,any>})=>requestJson<ScientificRecord>(`/api/v1/scientific/records/${encodeURIComponent(id)}/update`,{method:'POST',body:JSON.stringify(payload)}),
  scientificRecordAction:(id:string,action:'submit'|'resubmit'|'start-review'|'return'|'approve'|'reopen',comment='')=>requestJson<ScientificRecord>(`/api/v1/scientific/records/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action,comment})}),
  deleteScientificRecord:(id:string)=>requestJson<{status:string;deleted:string}>(`/api/v1/scientific/records/${encodeURIComponent(id)}/delete`,{method:'POST',body:'{}'}),
  updateMicroCatchment:(id:string,payload:{name?:string;area_sq_km?:number|string;perimeter_km?:number|string;boundary_status:ScientificPackageStatus;drainage_status:ScientificPackageStatus;validation_status:ScientificPackageStatus;remarks?:string})=>requestJson<MicroCatchment>(`/api/v1/scientific/micro-catchments/${encodeURIComponent(id)}/update`,{method:'POST',body:JSON.stringify(payload)}),
  scientificPackage:(institution_id?:string)=>requestJson<ScientificPackage>(`/api/v1/scientific/package${institution_id?`?institution_id=${encodeURIComponent(institution_id)}`:''}`),
  updateScientificPackageItem:(itemKey:string,payload:{institution_id?:string;status:ScientificPackageStatus;notes?:string})=>requestJson<ScientificPackage>(`/api/v1/scientific/package/${encodeURIComponent(itemKey)}`,{method:'POST',body:JSON.stringify(payload)}),
  validateScientificDataset:(payload:{filename:string;metadata:Record<string,any>})=>requestJson<DatasetValidationResult>('/api/v1/scientific/validate',{method:'POST',body:JSON.stringify(payload)}),


  permissionsMe:()=>requestJson<PermissionProfile>('/api/v18/permissions/me'),
  tasks:(filters?:{status?:TaskStatus;department_id?:string})=>{
    const q=new URLSearchParams();if(filters?.status)q.set('status',filters.status);if(filters?.department_id)q.set('department_id',filters.department_id)
    return requestJson<TaskItem[]>(`/api/v18/tasks${q.toString()?`?${q.toString()}`:''}`)
  },
  task:(id:string)=>requestJson<TaskItem>(`/api/v18/tasks/${encodeURIComponent(id)}`),
  taskTargets:()=>requestJson<TaskTargets>('/api/v18/task-targets'),
  createTask:(payload:{title:string;description?:string;department_id?:string;institution_id?:string;micro_catchment_id?:string;priority?:TaskPriority;due_date?:string})=>requestJson<TaskItem>('/api/v18/tasks',{method:'POST',body:JSON.stringify(payload)}),
  assignTask:(id:string,payload:{assignee_user_id?:number;assignee_organization_id?:string;assignee_department_id?:string;primary?:boolean;comment?:string})=>requestJson<TaskItem>(`/api/v18/tasks/${encodeURIComponent(id)}/assign`,{method:'POST',body:JSON.stringify(payload)}),
  taskAction:(id:string,action:'start'|'submit'|'review'|'return'|'approve'|'complete',comment='')=>requestJson<TaskItem>(`/api/v18/tasks/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action,comment})}),
  workflows:(filters?:{status?:WorkflowStatus;department_id?:string;source_type?:WorkflowSourceType;limit?:number})=>{
    const q=new URLSearchParams();if(filters?.status)q.set('status',filters.status);if(filters?.department_id)q.set('department_id',filters.department_id);if(filters?.source_type)q.set('source_type',filters.source_type);if(filters?.limit)q.set('limit',String(filters.limit))
    return requestJson<WorkflowItem[]>(`/api/v18/workflows${q.toString()?`?${q.toString()}`:''}`)
  },
  workflow:(id:string)=>requestJson<WorkflowItem>(`/api/v18/workflow/${encodeURIComponent(id)}`),
  reviewQueue:(filters?:{status?:WorkflowStatus;department_id?:string;source_type?:WorkflowSourceType})=>{
    const q=new URLSearchParams();if(filters?.status)q.set('status',filters.status);if(filters?.department_id)q.set('department_id',filters.department_id);if(filters?.source_type)q.set('source_type',filters.source_type)
    return requestJson<WorkflowItem[]>(`/api/v18/review/queue${q.toString()?`?${q.toString()}`:''}`)
  },
  workflowAction:(id:string,action:'submit'|'resubmit'|'start-review'|'return'|'technical-approve'|'final-approve'|'integrate',comment='')=>requestJson<WorkflowItem>(`/api/v18/workflow/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action,comment})}),
  notifications:(unread=false,limit=200)=>requestJson<WorkflowNotification[]>(`/api/v18/notifications?unread=${unread?1:0}&limit=${limit}`),
  markNotificationRead:(id:string)=>requestJson<{public_id:string;is_read:boolean;read_at:string}>(`/api/v18/notifications/${encodeURIComponent(id)}/read`,{method:'POST',body:'{}'}),
  audit:(module?:string,limit=300)=>requestJson<WorkflowAuditItem[]>(`/api/v18/audit?limit=${limit}${module?`&module=${encodeURIComponent(module)}`:''}`),
  cnnlApproved:(limit=500)=>requestJson<WorkflowItem[]>(`/api/v18/cnnl/approved?limit=${limit}`),
  summary:()=>requestJson<Summary>('/api/v1/summary'),
  flights:(day?:number)=>requestJson<FlightListItem[]>(`/api/v1/flights${day?`?day=${day}`:''}`),
  flight:(id:string)=>requestJson<FlightDetail>(`/api/v1/flights/${encodeURIComponent(id)}`),
  tracks:(days:number[])=>requestJson<any>(`/api/v1/map/tracks${dayQuery(days)}`),
  endpoints:(days:number[])=>requestJson<any>(`/api/v1/map/endpoints${dayQuery(days)}`),
  points:(days:number[])=>requestJson<any>(`/api/v1/map/points${dayQuery(days)}`),
  availability:()=>requestJson<DataAvailability>('/api/v1/data-availability'),
  verification:()=>requestJson<Verification>('/api/v1/verification'),

  institutionOverview:()=>requestJson<InstitutionOverview>('/api/v1/institution/overview'),
  institutionEntries:(filters?:{status?:CivilStatus;type?:CivilEntryType})=>{
    const q=new URLSearchParams();if(filters?.status)q.set('status',filters.status);if(filters?.type)q.set('type',filters.type)
    return requestJson<CivilEntry[]>(`/api/v1/institution/entries${q.toString()?`?${q}`:''}`)
  },
  institutionEntry:(id:string)=>requestJson<CivilEntry>(`/api/v1/institution/entries/${encodeURIComponent(id)}`),
  createCivilEntry:(payload:{entry_type:CivilEntryType;fields:Record<string,any>;submit?:boolean})=>requestJson<CivilEntry>('/api/v1/institution/entries',{method:'POST',body:JSON.stringify(payload)}),
  updateCivilEntry:(id:string,fields:Record<string,any>)=>requestJson<CivilEntry>(`/api/v1/institution/entries/${encodeURIComponent(id)}/update`,{method:'POST',body:JSON.stringify({fields})}),
  submitCivilEntry:(id:string)=>requestJson<CivilEntry>(`/api/v1/institution/entries/${encodeURIComponent(id)}/submit`,{method:'POST',body:'{}'}),
  uploadCivilAttachment:async(id:string,file:File)=>{
    const response=await fetch(`/api/v1/institution/entries/${encodeURIComponent(id)}/attachments?filename=${encodeURIComponent(file.name)}`,{method:'POST',credentials:'include',headers:{'Content-Type':file.type||'application/octet-stream'},body:file})
    return parseResponse<{public_id:string;original_name:string;content_type:string|null;size_bytes:number}>(response)
  },
  reviewEntries:(status?:CivilStatus)=>requestJson<CivilEntry[]>(`/api/v1/review/entries${status?`?status=${status}`:''}`),
  reviewCivilEntry:(id:string,action:'review'|'approve'|'return',comment='')=>requestJson<CivilEntry>(`/api/v1/review/entries/${encodeURIComponent(id)}/action`,{method:'POST',body:JSON.stringify({action,comment})}),
  approvedCivilEntries:()=>requestJson<CivilEntry[]>('/api/v1/civil/approved'),

  accessSummary:()=>requestJson<AccessSummary>('/api/v1/admin/access-summary'),
  createUser:(payload:{email:string;display_name:string;organization_id:string;role:string;password?:string})=>requestJson<{user_id:number;email:string;display_name:string;organization_id:string;role:string;temporary_password:string|null}>('/api/v1/admin/users',{method:'POST',body:JSON.stringify(payload)}),

  repositoryDepartments:()=>requestJson<DepartmentSummary[]>('/api/v1/repository/departments'),
  unlockDepartment:(department_id:DepartmentId,passkey:string,purpose:'BROWSE'|'UPLOAD'='BROWSE')=>requestJson<DepartmentUnlock>('/api/v1/repository/unlock',{method:'POST',body:JSON.stringify({department_id,passkey,purpose})}),
  companyRepositorySummary:()=>requestJson<RepositorySummary>('/api/v1/repository/company/summary'),
  companyRepositoryBatches:(filters?:RepositoryFilters)=>requestJson<RepositoryBatch[]>(`/api/v1/repository/company/batches${filterQuery(filters)}`),
  companyRepositoryActivity:(limit=100)=>requestJson<RepositoryBatch[]>(`/api/v1/repository/company/activity?limit=${limit}`),
  companyRepositoryAudit:(limit=200)=>requestJson<RepositoryAuditItem[]>(`/api/v1/repository/company/audit?limit=${limit}`),
  departmentRepositoryBatches:(token:string,filters?:RepositoryFilters)=>requestJson<RepositoryBatch[]>(`/api/v1/repository/department/batches${filterQuery(filters)}`,{headers:departmentHeaders(token)}),
  rotateDepartmentPasskey:(department_id:DepartmentId)=>requestJson<{department_id:string;department_name:string;passkey:string}>(`/api/v1/repository/company/departments/${encodeURIComponent(department_id)}/rotate-passkey`,{method:'POST',body:'{}'}),
  createRepositoryBatch:(token:string,payload:{data_date:string;category:string;description?:string;remarks?:string;uploader_label?:string})=>requestJson<RepositoryBatch>('/api/v1/repository/batches',{method:'POST',headers:departmentHeaders(token),body:JSON.stringify(payload)}),
  initRepositoryUpload:(token:string,batchId:string,file:File)=>requestJson<UploadInit>(`/api/v1/repository/batches/${encodeURIComponent(batchId)}/files/init`,{method:'POST',headers:departmentHeaders(token),body:JSON.stringify({filename:file.name,size_bytes:file.size,content_type:file.type||'application/octet-stream'})}),
  uploadRepositoryFile:async(token:string,batchId:string,file:File,onProgress?:(pct:number,received:number)=>void)=>{
    const init=await api.initRepositoryUpload(token,batchId,file)
    let offset=init.received_bytes
    onProgress?.(file.size?Math.min(100,(offset/file.size)*100):100,offset)
    while(offset<file.size){
      const end=Math.min(file.size,offset+init.chunk_size)
      const chunk=file.slice(offset,end)
      const response=await fetch(`/api/v1/repository/uploads/${encodeURIComponent(init.upload_id)}/chunk?offset=${offset}`,{
        method:'POST',credentials:'include',headers:departmentHeaders(token,{'Content-Type':'application/octet-stream','X-Upload-Offset':String(offset)}),body:chunk
      })
      const result=await parseResponse<{received_bytes:number;expected_size:number;offset_mismatch?:boolean}>(response)
      if(result.received_bytes===offset&&chunk.size>0&&!result.offset_mismatch)throw new Error(`Upload stalled for ${file.name}`)
      offset=result.received_bytes
      onProgress?.(file.size?Math.min(100,(offset/file.size)*100):100,offset)
    }
    return requestJson<any>(`/api/v1/repository/uploads/${encodeURIComponent(init.upload_id)}/complete`,{method:'POST',headers:departmentHeaders(token),body:'{}'})
  },
  finalizeRepositoryBatch:(token:string,batchId:string)=>requestJson<RepositoryBatch>(`/api/v1/repository/batches/${encodeURIComponent(batchId)}/finalize`,{method:'POST',headers:departmentHeaders(token),body:'{}'}),
  downloadRepositoryFile:(fileId:string,filename:string,token?:string)=>downloadBlob(`/api/v1/repository/files/${encodeURIComponent(fileId)}/download`,filename,token),
  downloadRepositoryBatch:(batchId:string,token?:string)=>downloadBlob(`/api/v1/repository/batches/${encodeURIComponent(batchId)}/download`,`${batchId}.zip`,token),
  downloadDepartmentRepositoryExport:(token:string,filters?:RepositoryFilters)=>downloadBlob(`/api/v1/repository/department/export${filterQuery(filters)}`,`ARKAVATHI_DEPARTMENT_EXPORT.zip`,token),
  downloadCompanyRepositoryExport:(filters?:RepositoryFilters)=>downloadBlob(`/api/v1/repository/company/export${filterQuery(filters)}`,`ARKAVATI_REPOSITORY_EXPORT.zip`),

  mediaStatus:()=>requestJson<{showcase_video_directory:string;video_srt_library_directory:string;showcase_videos:number;video_srt_pairs:number;unpaired_srts:number}>('/api/v1/media/status'),
  mediaPairs:()=>requestJson<Array<{id:string;folder:string;srt_name:string;srt_relative_path:string;video_name:string;video_relative_path:string;paired:boolean;srt_size_bytes:number;video_size_bytes:number}>>('/api/v1/media/pairs'),
  mediaPairSrt:async(pairId:string)=>{
    const response=await fetch(`/api/v1/media/pairs/${encodeURIComponent(pairId)}/srt`,{credentials:'include'})
    if(!response.ok){const text=await response.text();let parsed:any={};try{parsed=text?JSON.parse(text):{}}catch{};throw new ApiError(parsed?.detail||`${response.status} ${response.statusText}`,response.status,parsed?.code)}
    return response.text()
  },
  mediaPairVideoUrl:(pairId:string)=>`/api/v1/media/pairs/${encodeURIComponent(pairId)}/video`,
}

export {ApiError}
