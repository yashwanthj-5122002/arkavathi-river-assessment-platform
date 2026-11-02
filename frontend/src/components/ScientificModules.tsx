import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle, Building2, CheckCircle2, ClipboardCheck, Database, Droplets, FileCheck2,
  FlaskConical, Gauge, Layers3, MapPinned, Plus, RefreshCw, Save, Search, ShieldCheck,
  TestTube2, Waves
} from 'lucide-react'
import { api } from '../lib/api'
import type {
  AuthUser, DatasetValidationResult, MicroCatchment, ScientificPackage, ScientificPackageStatus,
  ScientificRecord, ScientificRecordStatus, ScientificRecordType, ScientificSummary
} from '../lib/types'

type View = 'overview'|'micro'|'records'|'package'|'compliance'
type FieldKind = 'text'|'number'|'date'|'time'|'select'|'textarea'
type FieldDef = {key:string;label:string;kind?:FieldKind;required?:boolean;options?:string[];placeholder?:string}
type RecordDef = {type:ScientificRecordType;title:string;description:string;icon:any;fields:FieldDef[]}

const RECORD_DEFS:RecordDef[]=[
  {type:'WATERSHED',title:'Watershed & Micro-Catchment',description:'Watershed boundaries, drainage order, pour points, terrain and DEM-derived hydrological layers.',icon:Layers3,fields:[
    {key:'watershed_id',label:'Watershed / Sub-Watershed ID',required:true,placeholder:'WS-001'},{key:'basin_name',label:'Basin / Watershed Name',required:true},{key:'boundary_reference',label:'Boundary GIS Layer Reference'},{key:'catchment_area_sq_km',label:'Catchment Area (sq km)',kind:'number'},{key:'perimeter_km',label:'Perimeter (km)',kind:'number'},
    {key:'drainage_network_reference',label:'Drainage Network Reference'},{key:'stream_order',label:'Stream Order'},{key:'pour_points',label:'Pour Points / Outlets'},{key:'confluences',label:'Confluences'},{key:'flow_direction_reference',label:'Flow Direction Layer'},{key:'flow_accumulation_reference',label:'Flow Accumulation Layer'},
    {key:'elevation_range',label:'Elevation / Relief'},{key:'slope_reference',label:'Slope Layer'},{key:'aspect_reference',label:'Aspect Layer'},{key:'dem_reference',label:'DEM-Derived Layer Reference'},{key:'surveyed_rl_control',label:'Validated RL / Control Information'},{key:'remarks',label:'Remarks',kind:'textarea'}
  ]},
  {type:'DRAINAGE',title:'Drainage & Confluence',description:'Drain geometry, flow, confluence/outfall and pollution-source observations.',icon:Waves,fields:[
    {key:'drain_id',label:'Drain ID',required:true,placeholder:'DR-001'},{key:'drain_name',label:'Drain Name',required:true},{key:'drain_type',label:'Drain Type',kind:'select',options:['Natural','Stormwater','Sewer','Industrial','Mixed','Other']},
    {key:'latitude',label:'Latitude',kind:'number',required:true},{key:'longitude',label:'Longitude',kind:'number',required:true},{key:'chainage',label:'Chainage'},{key:'width_m',label:'Width (m)',kind:'number'},{key:'depth_m',label:'Depth (m)',kind:'number'},
    {key:'bed_level',label:'Bed Level / RL',kind:'number'},{key:'bank_level',label:'Bank Level / RL',kind:'number'},{key:'flow_direction',label:'Flow Direction'},{key:'flow_condition',label:'Flow Condition',kind:'select',options:['Dry','Low','Moderate','High','Continuous','Intermittent']},
    {key:'confluence_outfall',label:'Confluence / Outfall Location'},{key:'pollution_status',label:'Pollution Status',kind:'select',options:['Not Observed','Suspected','Confirmed','Under Verification']},{key:'pollution_source',label:'Pollution Source'},{key:'connected_industries_settlements',label:'Connected Industries / Settlements'},
    {key:'flow_measurement',label:'Flow Measurement / Discharge'},{key:'observations',label:'Field Notes / Observations',kind:'textarea'}
  ]},
  {type:'INDUSTRY',title:'Industrial Inventory',description:'Industry location, wastewater, treatment, consent and field-verification information.',icon:Building2,fields:[
    {key:'industry_id',label:'Industry ID',required:true,placeholder:'IND-001'},{key:'industry_name',label:'Industry Name',required:true},{key:'industry_category',label:'Category / Type',required:true},{key:'classification',label:'Organized / Unorganized',kind:'select',options:['Organized','Unorganized','Unknown']},
    {key:'village',label:'Village'},{key:'taluk',label:'Taluk'},{key:'district',label:'District'},{key:'latitude',label:'Latitude',kind:'number',required:true},{key:'longitude',label:'Longitude',kind:'number',required:true},
    {key:'water_source',label:'Water Source'},{key:'wastewater_source',label:'Wastewater Source'},{key:'etp_stp',label:'ETP / STP Information'},{key:'discharge_location',label:'Discharge Location'},{key:'discharge_quantity',label:'Discharge Quantity'},
    {key:'kspcb_reference',label:'KSPCB Consent / Registration'},{key:'department_reference',label:'BESCOM / KIADB / Department Reference'},{key:'verification_status',label:'Field Verification',kind:'select',options:['Pending','Verified','Not Found','Needs Revisit']},{key:'remarks',label:'Remarks',kind:'textarea'}
  ]},
  {type:'WATER_SAMPLE',title:'Water Sampling',description:'Sampling point, custody, preservation, weather, flow and laboratory tracking.',icon:Droplets,fields:[
    {key:'sample_id',label:'Unique Sample ID',required:true,placeholder:'SMP-001'},{key:'sampling_point_id',label:'Sampling Point ID',required:true},{key:'location',label:'Location',required:true},{key:'sample_class',label:'Position',kind:'select',required:true,options:['Upstream','Downstream','Confluence','Outfall','Other']},
    {key:'sampling_date',label:'Sampling Date',kind:'date',required:true},{key:'sampling_time',label:'Sampling Time',kind:'time'},{key:'latitude',label:'Latitude',kind:'number'},{key:'longitude',label:'Longitude',kind:'number'},
    {key:'weather',label:'Weather Condition'},{key:'flow_condition',label:'Flow Condition'},{key:'sample_collector',label:'Sample Collector'},{key:'preservation_details',label:'Preservation Details'},{key:'chain_of_custody',label:'Chain-of-Custody No.'},
    {key:'laboratory_id',label:'Laboratory Identification'},{key:'report_reference',label:'Laboratory Report / Certificate Ref.'},{key:'remarks',label:'Remarks',kind:'textarea'}
  ]},
  {type:'LAB_RESULT',title:'Laboratory & Water Quality',description:'Structured physical, chemical, biological and heavy-metal result entry.',icon:TestTube2,fields:[
    {key:'sample_id',label:'Sample ID',required:true},{key:'laboratory_name',label:'Laboratory Name',required:true},{key:'report_reference',label:'Report / Certificate Reference',required:true},{key:'analysis_date',label:'Analysis Date',kind:'date'},
    {key:'ph',label:'pH',kind:'number'},{key:'temperature_c',label:'Temperature (°C)',kind:'number'},{key:'electrical_conductivity',label:'Electrical Conductivity',kind:'number'},{key:'tds_mg_l',label:'TDS (mg/L)',kind:'number'},
    {key:'turbidity_ntu',label:'Turbidity (NTU)',kind:'number'},{key:'do_mg_l',label:'DO (mg/L)',kind:'number'},{key:'bod_mg_l',label:'BOD (mg/L)',kind:'number'},{key:'cod_mg_l',label:'COD (mg/L)',kind:'number'},{key:'tss_mg_l',label:'TSS (mg/L)',kind:'number'},
    {key:'hardness_mg_l',label:'Hardness (mg/L)',kind:'number'},{key:'alkalinity_mg_l',label:'Alkalinity (mg/L)',kind:'number'},{key:'chloride_mg_l',label:'Chloride (mg/L)',kind:'number'},{key:'sulphate_mg_l',label:'Sulphate (mg/L)',kind:'number'},{key:'nitrate_mg_l',label:'Nitrate (mg/L)',kind:'number'},{key:'phosphate_mg_l',label:'Phosphate (mg/L)',kind:'number'},
    {key:'total_coliform',label:'Total Coliform'},{key:'faecal_coliform',label:'Faecal Coliform'},{key:'e_coli',label:'E. coli'},
    {key:'iron_mg_l',label:'Iron (mg/L)',kind:'number'},{key:'lead_mg_l',label:'Lead (mg/L)',kind:'number'},{key:'chromium_mg_l',label:'Chromium (mg/L)',kind:'number'},{key:'cadmium_mg_l',label:'Cadmium (mg/L)',kind:'number'},{key:'mercury_mg_l',label:'Mercury (mg/L)',kind:'number'},{key:'nickel_mg_l',label:'Nickel (mg/L)',kind:'number'},{key:'copper_mg_l',label:'Copper (mg/L)',kind:'number'},{key:'zinc_mg_l',label:'Zinc (mg/L)',kind:'number'},{key:'arsenic_mg_l',label:'Arsenic (mg/L)',kind:'number'},
    {key:'additional_parameters',label:'Additional Tested Parameters',kind:'textarea',placeholder:'Enter any additional laboratory parameters and values.'}
  ]},
  {type:'HYDROLOGY',title:'Hydrology',description:'Rainfall, discharge, water level, velocity, cross-section, runoff and IDF information.',icon:Gauge,fields:[
    {key:'hydrology_id',label:'Hydrology Record ID',required:true,placeholder:'HYD-001'},{key:'observation_date',label:'Observation Date',kind:'date',required:true},{key:'location',label:'Location',required:true},{key:'latitude',label:'Latitude',kind:'number'},{key:'longitude',label:'Longitude',kind:'number'},
    {key:'rainfall_mm',label:'Rainfall (mm)',kind:'number'},{key:'rainfall_intensity',label:'Rainfall Intensity'},{key:'river_drain_discharge',label:'River / Drain Discharge'},{key:'water_level',label:'Water Level / Gauge Observation'},{key:'flow_velocity',label:'Flow Velocity'},
    {key:'cross_section_reference',label:'Cross-Section Reference'},{key:'catchment_area',label:'Catchment Area'},{key:'runoff',label:'Runoff Information'},{key:'peak_discharge',label:'Peak Discharge'},{key:'seasonal_flow',label:'Seasonal Flow Observation'},
    {key:'industrial_wastewater_flow',label:'Industrial Wastewater Flow / Estimate'},{key:'historical_reference',label:'Historical Record Reference'},{key:'idf_information',label:'IDF / Hydrological Analysis Output',kind:'textarea'}
  ]},
  {type:'POLLUTION_HOTSPOT',title:'Pollution Hotspot',description:'Hotspot severity, connected source, evidence, laboratory reference and intervention.',icon:AlertTriangle,fields:[
    {key:'hotspot_id',label:'Hotspot ID',required:true,placeholder:'HOT-001'},{key:'location',label:'Location',required:true},{key:'latitude',label:'Latitude',kind:'number',required:true},{key:'longitude',label:'Longitude',kind:'number',required:true},
    {key:'pollution_source',label:'Pollution Source',required:true},{key:'connected_drain_industry',label:'Connected Drain / Industry'},{key:'flow_discharge',label:'Flow / Discharge Information'},{key:'sampling_lab_reference',label:'Sampling / Laboratory Reference'},
    {key:'bod',label:'BOD',kind:'number'},{key:'cod',label:'COD',kind:'number'},{key:'tds',label:'TDS',kind:'number'},{key:'heavy_metals',label:'Heavy-Metal Indicators'},
    {key:'severity',label:'Severity',kind:'select',required:true,options:['Low','Moderate','High','Critical']},{key:'photographic_evidence',label:'Photographic Evidence Reference'},{key:'recommended_intervention',label:'Recommended Intervention',kind:'textarea'},{key:'verification_status',label:'Verification Status',kind:'select',options:['Pending','Field Verified','Technically Verified','Approved']}
  ]},
  {type:'ISSUE_RISK',title:'Issues, Risks & Constraints',description:'Project issues, risks, constraints, responsibility, impact and recommended action.',icon:AlertTriangle,fields:[
    {key:'issue_id',label:'Issue / Risk ID',required:true,placeholder:'RSK-001'},{key:'category',label:'Category',kind:'select',required:true,options:['Issue','Risk','Constraint','Dependency']},{key:'title',label:'Title',required:true},{key:'description',label:'Description',kind:'textarea',required:true},
    {key:'severity',label:'Severity',kind:'select',required:true,options:['Low','Medium','High','Critical']},{key:'impact',label:'Impact',kind:'textarea'},{key:'responsible_person',label:'Responsible Person / Institution'},{key:'target_date',label:'Target Date',kind:'date'},{key:'current_status',label:'Current Status',kind:'select',options:['Open','In Progress','Mitigated','Closed']},{key:'recommended_action',label:'Recommended Action / Mitigation',kind:'textarea'}
  ]},
]

const statusClass:Record<ScientificRecordStatus,string>={
  DRAFT:'bg-slate-100 text-slate-700',SUBMITTED:'bg-blue-100 text-blue-800',UNDER_REVIEW:'bg-violet-100 text-violet-800',
  CORRECTION_REQUIRED:'bg-amber-100 text-amber-900',APPROVED:'bg-emerald-100 text-emerald-800'
}
const packageClass:Record<ScientificPackageStatus,string>={
  PENDING:'bg-slate-100 text-slate-600',UPLOADED:'bg-blue-100 text-blue-800',VALIDATED:'bg-violet-100 text-violet-800',APPROVED:'bg-emerald-100 text-emerald-800'
}

const labelType=(t:ScientificRecordType)=>RECORD_DEFS.find(x=>x.type===t)?.title??t.replace(/_/g,' ')
const canWrite=(u:AuthUser)=>u.organization_type==='INSTITUTION'?['INSTITUTION_ADMIN','INSTITUTION_USER'].includes(u.role):u.organization_type==='COMPANY'&&u.role!=='COMPANY_VIEWER'&&u.role!=='COMPANY_DEPARTMENT_USER'
const canReview=(u:AuthUser)=>u.organization_type==='COMPANY'&&['COMPANY_ADMIN','COMPANY_PROJECT_MANAGER','COMPANY_REVIEWER','COMPANY_CIVIL_REVIEWER','COMPANY_GIS_REVIEWER','COMPANY_SURVEY_REVIEWER','COMPANY_LIDAR_REVIEWER','COMPANY_PHOTOGRAMMETRY_REVIEWER'].includes(u.role)
const canManageMicro=(u:AuthUser)=>u.organization_type==='COMPANY'&&['COMPANY_ADMIN','COMPANY_PROJECT_MANAGER'].includes(u.role)

export function ScientificModules({user}:{user:AuthUser}){
  const [view,setView]=useState<View>('overview')
  const [summary,setSummary]=useState<ScientificSummary|null>(null)
  const [micro,setMicro]=useState<MicroCatchment[]>([])
  const [records,setRecords]=useState<ScientificRecord[]>([])
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  async function load(){
    setError('')
    try{const [s,m,r]=await Promise.all([api.scientificSummary(),api.scientificMicroCatchments(),api.scientificRecords({limit:1500})]);setSummary(s);setMicro(m);setRecords(r)}
    catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  useEffect(()=>{load()},[])

  return <div className="space-y-5">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="bg-gradient-to-r from-navy-950 via-navy-900 to-blue-800 px-5 py-5 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-cyan-200"><FlaskConical size={15}/>Scientific Assessment Workspace</div><h2 className="mt-2 text-2xl font-black">Arkavati Scientific Data & Compliance</h2><p className="mt-1 max-w-4xl text-sm leading-6 text-blue-100">Watershed/micro-catchments, drainage, industries, sampling, laboratory results, hydrology, pollution hotspots, issues/risks and mandatory upload-package compliance in one controlled module.</p></div>
          <button onClick={()=>{setLoading(true);load().finally(()=>setLoading(false))}} className="inline-flex items-center gap-2 self-start rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-xs font-black hover:bg-white/15"><RefreshCw size={15} className={loading?'animate-spin':''}/>Refresh</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">{([
        ['overview','Overview',Layers3],['micro','Micro-Catchments',MapPinned],['records','Scientific Records',Database],['package','Upload Package',ClipboardCheck],['compliance','Data Compliance',FileCheck2]
      ] as const).map(([key,label,Icon])=><button key={key} onClick={()=>setView(key)} className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-black ${view===key?'bg-navy-950 text-white shadow-sm':'border border-slate-200 bg-white text-slate-600 hover:border-navy-300'}`}><Icon size={15}/>{label}</button>)}</div>
    </section>

    {error&&<div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
    {view==='overview'&&<Overview summary={summary} records={records} micro={micro}/>} 
    {view==='micro'&&<MicroCatchments user={user} items={micro} onChanged={load}/>} 
    {view==='records'&&<Records user={user} records={records} micro={micro} onChanged={load}/>} 
    {view==='package'&&<UploadPackage user={user} micro={micro}/>} 
    {view==='compliance'&&<DataCompliance/>}
  </div>
}

function Overview({summary,records,micro}:{summary:ScientificSummary|null;records:ScientificRecord[];micro:MicroCatchment[]}){
  const cards=[
    ['Micro-Catchments',summary?.micro_catchments??micro.length,MapPinned,'12 planned study units'],
    ['Scientific Records',summary?.records??records.length,Database,'All structured scientific entries'],
    ['Pending Review',summary?.pending_review??0,Search,'Submitted / under review'],
    ['Approved',summary?.approved_records??0,CheckCircle2,'Visible to authorized officials'],
  ] as const
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label,value,Icon,detail])=><div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><div className="text-[10px] font-black uppercase tracking-[.16em] text-slate-500">{label}</div><div className="mt-2 text-3xl font-black text-navy-950">{value}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div><div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-navy-900"><Icon size={20}/></div></div></div>)}</section>
    <section className="grid gap-4 xl:grid-cols-[1.2fr_.8fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-black text-slate-900">Scientific coverage</h3><p className="mt-1 text-xs text-slate-500">Structured modules added for the remaining assessment requirements.</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{RECORD_DEFS.map(def=>{const count=summary?.type_counts?.[def.type]??records.filter(r=>r.record_type===def.type).length;const Icon=def.icon;return <div key={def.type} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3"><div className="grid h-9 w-9 place-items-center rounded-lg bg-white text-navy-900"><Icon size={17}/></div><div className="min-w-0 flex-1"><div className="text-xs font-black text-slate-800">{def.title}</div><div className="text-[10px] text-slate-500">{def.description}</div></div><div className="text-xl font-black text-navy-950">{count}</div></div>})}</div></div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-black text-slate-900">Specification controls</h3><div className="mt-4 space-y-3">{['12 micro-catchment allocation','Institution-scoped scientific entry','Nakshatech review / correction / approval','CNNL approved-only visibility','Mandatory institution upload checklist','Filename + format + metadata + CRS validation'].map(item=><div key={item} className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-900"><CheckCircle2 size={16} className="mt-.5 shrink-0"/>{item}</div>)}</div>{summary?.institution_package_average_pct!==undefined&&<div className="mt-4 rounded-xl bg-navy-950 p-4 text-white"><div className="text-[10px] font-black uppercase tracking-wider text-cyan-200">12-Institution Package Readiness</div><div className="mt-1 text-3xl font-black">{summary.institution_package_average_pct.toFixed(1)}%</div></div>}</div>
    </section>
  </div>
}

function MicroCatchments({user,items,onChanged}:{user:AuthUser;items:MicroCatchment[];onChanged:()=>Promise<void>}){
  const [editing,setEditing]=useState<MicroCatchment|null>(null)
  const [form,setForm]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false)
  function start(item:MicroCatchment){setEditing(item);setForm({name:item.name,area_sq_km:item.area_sq_km?.toString()??'',perimeter_km:item.perimeter_km?.toString()??'',boundary_status:item.boundary_status,drainage_status:item.drainage_status,validation_status:item.validation_status,remarks:item.remarks})}
  async function save(){if(!editing)return;setBusy(true);try{await api.updateMicroCatchment(editing.id,{name:form.name,area_sq_km:form.area_sq_km,perimeter_km:form.perimeter_km,boundary_status:form.boundary_status as ScientificPackageStatus,drainage_status:form.drainage_status as ScientificPackageStatus,validation_status:form.validation_status as ScientificPackageStatus,remarks:form.remarks});setEditing(null);await onChanged()}catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy(false)}}
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><h3 className="text-xl font-black text-slate-900">12 Micro-Catchments</h3><p className="mt-1 text-sm text-slate-500">MC01–MC12 are mapped one-to-one to Institution 01–12 until official names and boundaries are supplied.</p></div>{canManageMicro(user)&&<div className="text-xs font-bold text-emerald-700">Nakshatech project-manager editing enabled</div>}</div>
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Micro-Catchment</th><th className="px-3 py-3">Institution</th><th className="px-3 py-3">Area</th><th className="px-3 py-3">Perimeter</th><th className="px-3 py-3">Boundary</th><th className="px-3 py-3">Drainage</th><th className="px-3 py-3">Validation</th>{canManageMicro(user)&&<th className="px-3 py-3">Action</th>}</tr></thead><tbody>{items.map(item=><tr key={item.id} className="border-t border-slate-100"><td className="px-3 py-3"><div className="font-black text-navy-950">{item.id}</div><div className="text-slate-500">{item.name}</div></td><td className="px-3 py-3 font-semibold">{item.institution_name}</td><td className="px-3 py-3">{item.area_sq_km??'—'}</td><td className="px-3 py-3">{item.perimeter_km??'—'}</td><td className="px-3 py-3"><PackageBadge status={item.boundary_status}/></td><td className="px-3 py-3"><PackageBadge status={item.drainage_status}/></td><td className="px-3 py-3"><PackageBadge status={item.validation_status}/></td>{canManageMicro(user)&&<td className="px-3 py-3"><button onClick={()=>start(item)} className="rounded-lg border border-slate-300 px-3 py-1.5 font-black text-navy-900">Edit</button></td>}</tr>)}</tbody></table></div>
    {editing&&<div className="mt-5 rounded-2xl border border-blue-200 bg-blue-50/50 p-4"><div className="flex items-center justify-between"><h4 className="font-black text-navy-950">Update {editing.id}</h4><button onClick={()=>setEditing(null)} className="text-xs font-bold text-slate-500">Cancel</button></div><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Input label="Name" value={form.name??''} onChange={v=>setForm(f=>({...f,name:v}))}/><Input label="Area (sq km)" kind="number" value={form.area_sq_km??''} onChange={v=>setForm(f=>({...f,area_sq_km:v}))}/><Input label="Perimeter (km)" kind="number" value={form.perimeter_km??''} onChange={v=>setForm(f=>({...f,perimeter_km:v}))}/>{(['boundary_status','drainage_status','validation_status'] as const).map(k=><label key={k} className="text-xs font-bold text-slate-700">{k.replace(/_/g,' ')}<select value={form[k]??'PENDING'} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">{['PENDING','UPLOADED','VALIDATED','APPROVED'].map(s=><option key={s}>{s}</option>)}</select></label>)}</div><div className="mt-3"><Input label="Remarks" kind="textarea" value={form.remarks??''} onChange={v=>setForm(f=>({...f,remarks:v}))}/></div><button disabled={busy} onClick={save} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Save size={15}/>{busy?'Saving…':'Save Micro-Catchment'}</button></div>}
  </section>
}

function Records({user,records,micro,onChanged}:{user:AuthUser;records:ScientificRecord[];micro:MicroCatchment[];onChanged:()=>Promise<void>}){
  const [type,setType]=useState<ScientificRecordType|'ALL'>('ALL')
  const [status,setStatus]=useState<ScientificRecordStatus|'ALL'>('ALL')
  const [showForm,setShowForm]=useState(false)
  const [recordType,setRecordType]=useState<ScientificRecordType>('DRAINAGE')
  const [mcId,setMcId]=useState(micro[0]?.id??'')
  const [fields,setFields]=useState<Record<string,string>>({})
  const [busy,setBusy]=useState(false)
  const def=RECORD_DEFS.find(x=>x.type===recordType)!
  const visible=useMemo(()=>records.filter(r=>(type==='ALL'||r.record_type===type)&&(status==='ALL'||r.status===status)),[records,type,status])
  useEffect(()=>{if(!mcId&&micro.length)setMcId(micro[0].id)},[micro,mcId])
  function changeType(next:ScientificRecordType){setRecordType(next);setFields({})}
  async function create(e:FormEvent,submit:boolean){e.preventDefault();setBusy(true);try{await api.createScientificRecord({record_type:recordType,micro_catchment_id:mcId||undefined,fields,submit});setFields({});setShowForm(false);await onChanged()}catch(err){alert(err instanceof Error?err.message:String(err))}finally{setBusy(false)}}
  async function action(record:ScientificRecord,act:'submit'|'resubmit'|'start-review'|'return'|'approve'|'reopen'){let comment='';if(act==='return')comment=window.prompt('Correction required comment:')?.trim()??'';if(act==='return'&&!comment)return;try{await api.scientificRecordAction(record.public_id,act,comment);await onChanged()}catch(e){alert(e instanceof Error?e.message:String(e))}}
  async function remove(record:ScientificRecord){if(!confirm(`Delete ${record.public_id}?`))return;try{await api.deleteScientificRecord(record.public_id);await onChanged()}catch(e){alert(e instanceof Error?e.message:String(e))}}
  return <section className="space-y-4">
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-xl font-black text-slate-900">Scientific Records</h3><p className="mt-1 text-sm text-slate-500">Institution-scoped structured records with Nakshatech review, correction and approval.</p></div><div className="flex flex-wrap gap-2"><select value={type} onChange={e=>setType(e.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"><option value="ALL">All record types</option>{RECORD_DEFS.map(x=><option key={x.type} value={x.type}>{x.title}</option>)}</select><select value={status} onChange={e=>setStatus(e.target.value as any)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold"><option value="ALL">All statuses</option>{['DRAFT','SUBMITTED','UNDER_REVIEW','CORRECTION_REQUIRED','APPROVED'].map(s=><option key={s}>{s}</option>)}</select>{canWrite(user)&&<button onClick={()=>setShowForm(v=>!v)} className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-4 py-2 text-xs font-black text-white"><Plus size={15}/>{showForm?'Close Form':'Add Record'}</button>}</div></div></div>
    {showForm&&<form onSubmit={e=>create(e,false)} className="rounded-2xl border border-blue-200 bg-white p-5 shadow-card"><div className="grid gap-3 lg:grid-cols-[1fr_1fr_2fr]"><label className="text-xs font-bold text-slate-700">Record Type<select value={recordType} onChange={e=>changeType(e.target.value as ScientificRecordType)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">{RECORD_DEFS.map(x=><option key={x.type} value={x.type}>{x.title}</option>)}</select></label><label className="text-xs font-bold text-slate-700">Micro-Catchment<select required value={mcId} onChange={e=>setMcId(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5"><option value="">Select…</option>{micro.map(m=><option key={m.id} value={m.id}>{m.id} · {m.institution_name}</option>)}</select></label><div className="rounded-xl bg-slate-50 px-4 py-3"><div className="font-black text-slate-900">{def.title}</div><div className="mt-1 text-xs text-slate-500">{def.description}</div></div></div><div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{def.fields.map(f=><Input key={f.key} label={f.label} kind={f.kind} required={f.required} options={f.options} placeholder={f.placeholder} value={fields[f.key]??''} onChange={v=>setFields(old=>({...old,[f.key]:v}))}/>)}</div><div className="mt-6 flex flex-wrap justify-end gap-2"><button disabled={busy} type="submit" className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50">Save Draft</button><button disabled={busy} type="button" onClick={e=>create(e as any,true)} className="rounded-xl bg-navy-950 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">Save & Submit</button></div></form>}
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-card"><table className="w-full min-w-[1200px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Record</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Micro-Catchment</th><th className="px-3 py-3">Institution</th><th className="px-3 py-3">Key Data</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Updated</th><th className="px-3 py-3">Actions</th></tr></thead><tbody>{visible.map(record=><tr key={record.public_id} className="border-t border-slate-100 align-top"><td className="px-3 py-3 font-mono text-[11px] font-black text-navy-900">{record.public_id}</td><td className="px-3 py-3 font-black">{labelType(record.record_type)}</td><td className="px-3 py-3">{record.micro_catchment_id??'—'}</td><td className="px-3 py-3">{record.institution_name??'Nakshatech'}</td><td className="max-w-[320px] px-3 py-3"><KeyData fields={record.fields}/>{record.review_comment&&<div className="mt-2 rounded-lg bg-amber-50 p-2 text-[10px] text-amber-900"><b>Review:</b> {record.review_comment}</div>}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black ${statusClass[record.status]}`}>{record.status.replace(/_/g,' ')}</span></td><td className="px-3 py-3 text-slate-500">{new Date(record.updated_at).toLocaleString()}</td><td className="px-3 py-3"><div className="flex max-w-[260px] flex-wrap gap-1.5">{user.organization_type==='INSTITUTION'&&record.status==='DRAFT'&&<button onClick={()=>action(record,'submit')} className="rounded-lg bg-blue-50 px-2 py-1.5 font-bold text-blue-800">Submit</button>}{user.organization_type==='INSTITUTION'&&record.status==='CORRECTION_REQUIRED'&&<button onClick={()=>action(record,'resubmit')} className="rounded-lg bg-blue-50 px-2 py-1.5 font-bold text-blue-800">Resubmit</button>}{canReview(user)&&record.status==='SUBMITTED'&&<button onClick={()=>action(record,'start-review')} className="rounded-lg bg-violet-50 px-2 py-1.5 font-bold text-violet-800">Start Review</button>}{canReview(user)&&['SUBMITTED','UNDER_REVIEW'].includes(record.status)&&<button onClick={()=>action(record,'return')} className="rounded-lg bg-amber-50 px-2 py-1.5 font-bold text-amber-900">Return</button>}{canReview(user)&&['SUBMITTED','UNDER_REVIEW'].includes(record.status)&&<button onClick={()=>action(record,'approve')} className="rounded-lg bg-emerald-50 px-2 py-1.5 font-bold text-emerald-800">Approve</button>}{user.role==='COMPANY_ADMIN'&&record.status==='APPROVED'&&<button onClick={()=>action(record,'reopen')} className="rounded-lg bg-slate-100 px-2 py-1.5 font-bold text-slate-700">Reopen</button>}{((user.organization_type==='INSTITUTION'&&record.status==='DRAFT')||user.role==='COMPANY_ADMIN')&&<button onClick={()=>remove(record)} className="rounded-lg bg-rose-50 px-2 py-1.5 font-bold text-rose-700">Delete</button>}</div></td></tr>)}{visible.length===0&&<tr><td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">No scientific records match these filters.</td></tr>}</tbody></table></div>
  </section>
}

function UploadPackage({user,micro}:{user:AuthUser;micro:MicroCatchment[]}){
  const institutions=useMemo(()=>Array.from(new Map(micro.map(m=>[m.institution_id,{id:m.institution_id,name:m.institution_name}])).values()),[micro])
  const [institution,setInstitution]=useState(user.organization_type==='INSTITUTION'?user.organization_id:(institutions[0]?.id??'INST-001'))
  const [data,setData]=useState<ScientificPackage|null>(null)
  const [busy,setBusy]=useState('')
  async function load(){try{setData(await api.scientificPackage(user.organization_type==='INSTITUTION'?undefined:institution))}catch(e){alert(e instanceof Error?e.message:String(e))}}
  useEffect(()=>{load()},[institution])
  async function update(itemKey:string,status:ScientificPackageStatus,notes:string){setBusy(itemKey);try{setData(await api.updateScientificPackageItem(itemKey,{institution_id:user.organization_type==='INSTITUTION'?undefined:institution,status,notes}))}catch(e){alert(e instanceof Error?e.message:String(e))}finally{setBusy('')}}
  const institutionCanOnlyUpload=user.organization_type==='INSTITUTION'
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><h3 className="text-xl font-black text-slate-900">Minimum Mandatory Upload Package</h3><p className="mt-1 text-sm text-slate-500">Tracks the specification's mandatory submission package for each participating institution.</p></div>{user.organization_type!=='INSTITUTION'&&<label className="text-xs font-bold text-slate-700">Institution<select value={institution} onChange={e=>setInstitution(e.target.value)} className="mt-1 block rounded-xl border border-slate-300 bg-white px-3 py-2">{institutions.map(i=><option key={i.id} value={i.id}>{i.name}</option>)}</select></label>}</div>
    {data&&<><div className="mt-5 rounded-2xl bg-navy-950 p-4 text-white"><div className="flex items-center justify-between gap-4"><div><div className="text-xs font-black">{data.institution_name}</div><div className="mt-1 text-[10px] text-blue-200">Validated/approved package items</div></div><div className="text-3xl font-black">{data.completion_pct.toFixed(1)}%</div></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-white" style={{width:`${data.completion_pct}%`}}/></div></div><div className="mt-4 space-y-2">{data.items.map(item=><PackageRow key={item.item_key} item={item} busy={busy===item.item_key} institutionCanOnlyUpload={institutionCanOnlyUpload} onUpdate={update}/>)}</div></>}
  </section>
}

function PackageRow({item,busy,institutionCanOnlyUpload,onUpdate}:{item:ScientificPackage['items'][number];busy:boolean;institutionCanOnlyUpload:boolean;onUpdate:(key:string,status:ScientificPackageStatus,notes:string)=>Promise<void>}){
  const [status,setStatus]=useState<ScientificPackageStatus>(item.status)
  const [notes,setNotes]=useState(item.notes)
  useEffect(()=>{setStatus(item.status);setNotes(item.notes)},[item.status,item.notes])
  return <div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:grid-cols-[minmax(0,1fr)_150px_minmax(220px,.8fr)_80px] lg:items-center"><div><div className="text-xs font-black text-slate-800">{item.label}</div><div className="mt-1"><PackageBadge status={item.status}/></div></div><select value={status} onChange={e=>setStatus(e.target.value as ScientificPackageStatus)} className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-bold">{(institutionCanOnlyUpload?['PENDING','UPLOADED']:['PENDING','UPLOADED','VALIDATED','APPROVED']).map(s=><option key={s}>{s}</option>)}</select><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Notes / file reference" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"/><button disabled={busy} onClick={()=>onUpdate(item.item_key,status,notes)} className="rounded-lg bg-navy-950 px-3 py-2 text-xs font-black text-white disabled:opacity-50">{busy?'…':'Save'}</button></div>
}

function DataCompliance(){
  const [filename,setFilename]=useState('ARK_MC05_WaterQuality_Sample03_20260825_R01.xlsx')
  const [meta,setMeta]=useState<Record<string,string>>({dataset_name:'Water Quality Sample 03',dataset_id:'ARK-MC05-WQ-S03',description:'',data_owner:'',responsibility:'',location:'MC05',creation_date:'',source_method:'',version:'R01',review_status:'Draft',crs:'',datum:'',units:'',accuracy_resolution:'',software:'',schema_description:''})
  const [result,setResult]=useState<DatasetValidationResult|null>(null)
  const [busy,setBusy]=useState(false)
  async function validate(e:FormEvent){e.preventDefault();setBusy(true);try{setResult(await api.validateScientificDataset({filename,metadata:meta}))}catch(err){alert(err instanceof Error?err.message:String(err))}finally{setBusy(false)}}
  const fields:[string,string][]=[['dataset_name','Dataset Name'],['dataset_id','Unique Dataset ID'],['description','Description'],['data_owner','Data Owner'],['responsibility','Institution / Nakshatech Responsibility'],['location','Micro-Catchment / Location'],['creation_date','Creation / Survey / Modification Date'],['source_method','Source / Survey / Processing Method'],['version','Version / Revision'],['review_status','Review / Approval Status'],['crs','Coordinate Reference System'],['datum','Datum'],['units','Units'],['accuracy_resolution','Accuracy / Resolution / Scale'],['software','Software Used'],['schema_description','Schema / Column Description']]
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card"><div><h3 className="text-xl font-black text-slate-900">Dataset Preflight Validation</h3><p className="mt-1 text-sm text-slate-500">Non-destructive validation before repository upload: supported format, naming convention, mandatory metadata and CRS/datum checks.</p></div><form onSubmit={validate} className="mt-5"><label className="text-xs font-black text-slate-700">File Name<input required value={filename} onChange={e=>setFilename(e.target.value)} className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-mono text-sm"/></label><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{fields.map(([key,label])=><Input key={key} label={label} value={meta[key]??''} onChange={v=>setMeta(m=>({...m,[key]:v}))}/>)}</div><button disabled={busy} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-navy-950 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50"><ShieldCheck size={16}/>{busy?'Validating…':'Validate Dataset'}</button></form>{result&&<div className={`mt-5 rounded-2xl border p-4 ${result.valid?'border-emerald-200 bg-emerald-50':'border-rose-200 bg-rose-50'}`}><div className="flex items-center gap-2 font-black"><span className={result.valid?'text-emerald-800':'text-rose-800'}>{result.valid?'VALIDATION PASSED':'VALIDATION FAILED'}</span>{result.data_group&&<span className="rounded-full bg-white px-2 py-1 text-[10px] text-slate-600">{result.data_group}</span>}</div>{result.errors.length>0&&<div className="mt-3 space-y-1">{result.errors.map(x=><div key={x} className="text-xs font-semibold text-rose-800">• {x}</div>)}</div>}{result.warnings.length>0&&<div className="mt-3 space-y-1">{result.warnings.map(x=><div key={x} className="text-xs font-semibold text-amber-900">• {x}</div>)}</div>}<div className="mt-3 text-[10px] text-slate-500">Naming convention: {result.naming_convention_ok?'OK':'Needs correction'} · Extension: {result.extension||'none'}</div></div>}</section>
}

function PackageBadge({status}:{status:ScientificPackageStatus}){return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ${packageClass[status]}`}>{status}</span>}

function KeyData({fields}:{fields:Record<string,any>}){const keys=['watershed_id','basin_name','drain_id','drain_name','industry_id','industry_name','sample_id','laboratory_name','hydrology_id','location','hotspot_id','issue_id','title','severity','pollution_source','report_reference'];const pairs=keys.filter(k=>fields[k]!==undefined&&fields[k]!==null&&fields[k]!=='').slice(0,4);return <div className="space-y-0.5 text-[11px] text-slate-600">{pairs.map(k=><div key={k}><span className="text-slate-400">{k.replace(/_/g,' ')}:</span> {String(fields[k])}</div>)}</div>}

function Input({label,value,onChange,kind='text',required=false,options,placeholder}:{label:string;value:string;onChange:(v:string)=>void;kind?:FieldKind;required?:boolean;options?:string[];placeholder?:string}){
  const cls='mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-blue-100'
  return <label className={`${kind==='textarea'?'md:col-span-2 xl:col-span-3':''} text-xs font-bold text-slate-700`}>{label}{required&&<span className="text-rose-600"> *</span>}{kind==='select'?<select required={required} value={value} onChange={e=>onChange(e.target.value)} className={cls}><option value="">Select…</option>{options?.map(o=><option key={o}>{o}</option>)}</select>:kind==='textarea'?<textarea required={required} rows={3} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={cls}/>:<input required={required} type={kind==='number'?'number':kind==='date'?'date':kind==='time'?'time':'text'} step={kind==='number'?'any':undefined} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} className={cls}/>}</label>
}
