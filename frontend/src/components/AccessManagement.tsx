import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Building2, KeyRound, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import { api } from '../lib/api'
import type { AccessOrganization, AccessSummary } from '../lib/types'

const rolesByType:Record<string,string[]> = {
  COMPANY:['COMPANY_ADMIN','COMPANY_PROJECT_MANAGER','COMPANY_REVIEWER','COMPANY_DATA_MANAGER','COMPANY_DEPARTMENT_USER','COMPANY_VIEWER','COMPANY_CIVIL_REVIEWER','COMPANY_GIS_REVIEWER','COMPANY_SURVEY_REVIEWER','COMPANY_LIDAR_REVIEWER','COMPANY_PHOTOGRAMMETRY_REVIEWER'],
  CNNL:['CNNL_ADMIN','CNNL_OFFICIAL','CNNL_VIEWER'],
  INSTITUTION:['INSTITUTION_ADMIN','INSTITUTION_USER','INSTITUTION_VIEWER'],
}

export function AccessManagement(){
  const [data,setData]=useState<AccessSummary|null>(null)
  const [error,setError]=useState('')
  const [loading,setLoading]=useState(false)
  const [showForm,setShowForm]=useState(false)
  const [createdPassword,setCreatedPassword]=useState<string|null>(null)
  const [createdEmail,setCreatedEmail]=useState('')
  const [form,setForm]=useState({display_name:'',email:'',organization_id:'ORG-NAKSHA',role:'COMPANY_VIEWER'})

  async function load(){
    setError('')
    try{setData(await api.accessSummary())}catch(e){setError(e instanceof Error?e.message:String(e))}
  }
  useEffect(()=>{load()},[])

  const selectedOrg = useMemo<AccessOrganization|undefined>(()=>data?.organizations.find(o=>o.id===form.organization_id),[data,form.organization_id])
  const roleOptions = rolesByType[selectedOrg?.org_type ?? 'COMPANY'] ?? []

  function changeOrg(id:string){
    const org=data?.organizations.find(o=>o.id===id)
    const roles=rolesByType[org?.org_type ?? 'COMPANY'] ?? []
    setForm(v=>({...v,organization_id:id,role:roles[0] ?? ''}))
  }

  async function create(e:FormEvent){
    e.preventDefault();setLoading(true);setError('');setCreatedPassword(null)
    try{
      const result=await api.createUser(form)
      setCreatedPassword(result.temporary_password)
      setCreatedEmail(result.email)
      setForm(v=>({...v,display_name:'',email:''}))
      await load()
    }catch(e){setError(e instanceof Error?e.message:String(e))}finally{setLoading(false)}
  }

  return <section id="access-control" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-navy-700"><KeyRound size={15}/> Company administration</div><h2 className="mt-1 text-xl font-black text-slate-900">Access Control & Organizations</h2><p className="mt-1 max-w-3xl text-sm text-slate-500">Company-only administration for Nakshatech workflow roles, CNNL officials and the 12 institution account scopes.</p></div>
      <div className="flex gap-2"><button onClick={load} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><RefreshCw size={14}/>Refresh</button><button onClick={()=>setShowForm(v=>!v)} className="inline-flex items-center gap-2 rounded-xl bg-navy-950 px-3 py-2 text-xs font-bold text-white"><Plus size={14}/>Create user</button></div>
    </div>

    {error&&<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</div>}

    {data&&<>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-blue-50 p-4"><Building2 className="text-navy-700" size={19}/><div className="mt-2 text-2xl font-black text-slate-900">{data.counts.organizations}</div><div className="text-xs text-slate-500">Organizations/scopes</div></div><div className="rounded-xl bg-emerald-50 p-4"><Users className="text-emerald-700" size={19}/><div className="mt-2 text-2xl font-black text-slate-900">{data.counts.users}</div><div className="text-xs text-slate-500">User accounts</div></div><div className="rounded-xl bg-violet-50 p-4"><ShieldCheck className="text-violet-700" size={19}/><div className="mt-2 text-2xl font-black text-slate-900">{data.counts.institutions}</div><div className="text-xs text-slate-500">Institution scopes</div></div></div>

      {showForm&&<form onSubmit={create} className="mt-5 grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 md:grid-cols-2 xl:grid-cols-4"><input required placeholder="Display name" value={form.display_name} onChange={e=>setForm(v=>({...v,display_name:e.target.value}))} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"/><input required type="email" placeholder="Email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm"/><select value={form.organization_id} onChange={e=>changeOrg(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{data.organizations.map(o=><option key={o.id} value={o.id}>{o.name} · {o.id}</option>)}</select><select value={form.role} onChange={e=>setForm(v=>({...v,role:e.target.value}))} className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm">{roleOptions.map(r=><option key={r}>{r}</option>)}</select><div className="md:col-span-2 xl:col-span-4 flex items-center justify-between gap-3"><div className="text-[11px] text-slate-500">A strong temporary password will be generated and shown once after creation.</div><button disabled={loading} className="rounded-xl bg-navy-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{loading?'Creating…':'Create account'}</button></div></form>}

      {createdPassword&&<div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="text-xs font-black uppercase tracking-wider text-amber-800">Temporary credential — copy now</div><div className="mt-2 grid gap-2 text-sm sm:grid-cols-[1fr_1fr]"><div><span className="text-slate-500">Email:</span> <strong>{createdEmail}</strong></div><div><span className="text-slate-500">Password:</span> <code className="rounded bg-white px-2 py-1 font-bold">{createdPassword}</code></div></div></div>}

      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">User</th><th className="px-3 py-3">Organization</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last Login</th></tr></thead><tbody>{data.users.map(u=><tr key={u.id} className="border-t border-slate-100"><td className="px-3 py-3"><div className="font-bold text-slate-800">{u.display_name}</div><div className="mt-0.5 text-slate-500">{u.email}</div></td><td className="px-3 py-3"><div className="font-semibold">{u.organization_name}</div><div className="text-slate-400">{u.organization_id}</div></td><td className="px-3 py-3 font-mono text-[11px]">{u.role}</td><td className="px-3 py-3"><span className={`rounded-full px-2 py-1 font-bold ${u.active?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'}`}>{u.active?'Active':'Disabled'}</span></td><td className="px-3 py-3 text-slate-500">{u.last_login_at?new Date(u.last_login_at).toLocaleString():'Never'}</td></tr>)}</tbody></table></div>

      <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs leading-5 text-amber-900">The labels “Institution 01” through “Institution 12” are placeholders only. The supplied Civil dashboard requirement confirms 12 institution dashboards, but it does not provide the official institution names or their actual watershed/location allocations.</div>
    </>}
  </section>
}
