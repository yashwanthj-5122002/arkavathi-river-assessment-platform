import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Building2, Eye, EyeOff, Landmark, LockKeyhole, ShieldCheck, University, UserRound } from 'lucide-react'
import { api } from '../lib/api'
import type { AuthUser, PortalConfig, PortalId } from '../lib/types'

const portalCards: {id:PortalId;title:string;subtitle:string;icon:any}[] = [
  {id:'company',title:'Company Login',subtitle:'Nakshatech project administration',icon:Building2},
  {id:'cnnl',title:'CNNL Login',subtitle:'Official monitoring & review',icon:Landmark},
  {id:'institution',title:'Institution Login',subtitle:'12 participating institution portals',icon:University},
]

export function LoginPage({config,onLogin}:{config:PortalConfig;onLogin:(user:AuthUser)=>void}){
  const [portal,setPortal]=useState<PortalId>('company')
  const [institutionId,setInstitutionId]=useState(config.institutions[0]?.id ?? '')
  const [email,setEmail]=useState('')
  const [password,setPassword]=useState('')
  const [showPassword,setShowPassword]=useState(false)
  const [loading,setLoading]=useState(false)
  const [error,setError]=useState('')

  const current = useMemo(()=>portalCards.find(p=>p.id===portal)!,[portal])
  const CurrentIcon = current.icon

  async function submit(e:FormEvent){
    e.preventDefault()
    setError('')
    setLoading(true)
    try{
      const result = await api.login({
        portal,
        email:email.trim(),
        password,
        ...(portal==='institution'?{institution_id:institutionId}:{})
      })
      onLogin(result.user)
    }catch(err){
      setError(err instanceof Error ? err.message : String(err))
    }finally{
      setLoading(false)
    }
  }

  return <div className="min-h-screen bg-[radial-gradient(circle_at_15%_10%,rgba(14,116,144,.28),transparent_30%),radial-gradient(circle_at_85%_15%,rgba(37,99,235,.22),transparent_30%),linear-gradient(145deg,#021b38_0%,#053568_45%,#062b52_100%)] px-4 py-8 text-white">
    <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-[1500px] overflow-hidden rounded-[30px] border border-white/10 bg-white/5 shadow-2xl backdrop-blur md:grid-cols-[1.05fr_.95fr]">
      <section className="relative hidden overflow-hidden p-10 md:flex md:flex-col md:justify-between lg:p-14">
        <div className="absolute -left-24 top-36 h-80 w-80 rounded-full border border-cyan-300/10"/><div className="absolute -left-10 top-52 h-56 w-56 rounded-full border border-cyan-300/10"/>
        <div className="relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200/20 bg-cyan-100/10 px-3 py-2 text-xs font-bold text-cyan-100"><ShieldCheck size={15}/> Authorized Project Access</div>
          <h1 className="mt-7 max-w-2xl text-5xl font-black leading-[1.05] tracking-tight lg:text-6xl">Arkavati River Population Assessment Project</h1>
          <p className="mt-4 max-w-xl text-lg leading-8 text-blue-100">Industrial Pollution Assessment, DPR Preparation & River Revitalization</p>
          <div className="mt-10 grid max-w-2xl gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-2xl font-black">3</div><div className="mt-1 text-xs text-blue-100">Role-based portal types</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-2xl font-black">12</div><div className="mt-1 text-xs text-blue-100">Institution scopes prepared</div></div>
            <div className="rounded-2xl border border-white/10 bg-white/8 p-4"><div className="text-2xl font-black">RBAC</div><div className="mt-1 text-xs text-blue-100">Server-side access control</div></div>
          </div>
        </div>
        <div className="relative z-10 max-w-2xl rounded-2xl border border-white/10 bg-black/10 p-5 text-sm leading-6 text-blue-100">
          <div className="font-bold text-white">Access model</div>
          <div className="mt-1">Company users can administer the project, CNNL officials can monitor approved/global project evidence, and institution accounts are restricted to their own institution scope.</div>
        </div>
      </section>

      <section className="bg-slate-50 p-5 text-slate-900 sm:p-8 lg:p-12">
        <div className="mx-auto max-w-xl">
          <div className="md:hidden"><h1 className="text-3xl font-black text-navy-950">Arkavati River Population Assessment Project</h1><p className="mt-1 text-sm text-slate-500">Secure project portal</p></div>
          <div className="mt-6 md:mt-0">
            <div className="text-xs font-black uppercase tracking-[.18em] text-navy-700">Sign in</div>
            <h2 className="mt-2 text-3xl font-black text-slate-950">Choose your portal</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">Your account role is validated by the Python backend. Selecting a different portal does not bypass access controls.</p>
          </div>

          <div className="mt-7 grid gap-3 sm:grid-cols-3">
            {portalCards.map(({id,title,subtitle,icon:Icon})=><button type="button" key={id} onClick={()=>{setPortal(id);setError('')}} className={`rounded-2xl border p-4 text-left transition ${portal===id?'border-navy-700 bg-navy-950 text-white shadow-lg':'border-slate-200 bg-white hover:border-navy-300'}`}>
              <Icon size={21}/><div className="mt-3 text-sm font-black">{title}</div><div className={`mt-1 text-[11px] leading-4 ${portal===id?'text-blue-100':'text-slate-500'}`}>{subtitle}</div>
            </button>)}
          </div>

          <form onSubmit={submit} className="mt-7 rounded-3xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
            <div className="mb-5 flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-navy-800"><CurrentIcon size={22}/></div><div><div className="font-black">{current.title}</div><div className="text-xs text-slate-500">{current.subtitle}</div></div></div>

            {portal==='institution' && <label className="block"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Institution</span><select value={institutionId} onChange={e=>setInstitutionId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-blue-100">{config.institutions.map(inst=><option key={inst.id} value={inst.id}>{inst.name} · {inst.id}</option>)}</select><div className="mt-1 text-[11px] text-amber-700">Official university names are not in the supplied dataset yet, so Institution 01–12 are temporary labels.</div></label>}

            <label className={`block ${portal==='institution'?'mt-5':''}`}><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Email / User ID</span><div className="relative mt-2"><UserRound className="absolute left-3 top-3.5 text-slate-400" size={18}/><input autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)} className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-3 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-blue-100" placeholder="name@organization" required/></div></label>

            <label className="mt-5 block"><span className="text-xs font-bold uppercase tracking-wider text-slate-500">Password</span><div className="relative mt-2"><LockKeyhole className="absolute left-3 top-3.5 text-slate-400" size={18}/><input autoComplete="current-password" type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-11 text-sm outline-none focus:border-navy-600 focus:ring-2 focus:ring-blue-100" placeholder="Enter password" required/><button type="button" onClick={()=>setShowPassword(v=>!v)} className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-700" aria-label="Toggle password visibility">{showPassword?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>

            {error && <div className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{error}</div>}

            <button disabled={loading} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-navy-950 px-4 py-3.5 text-sm font-black text-white shadow-lg transition hover:bg-navy-800 disabled:cursor-wait disabled:opacity-60"><ShieldCheck size={18}/>{loading?'Signing in…':'Sign in securely'}</button>

            <div className="mt-5 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-500">Initial demo credentials are generated locally on the host PC during installation and stored in <strong className="text-slate-700">DEMO_LOGIN_CREDENTIALS.txt</strong>. Passwords are not embedded in this web page.</div>
          </form>
        </div>
      </section>
    </div>
  </div>
}
