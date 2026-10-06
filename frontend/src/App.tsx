import { useEffect, useState } from 'react'
import { api, ApiError } from './lib/api'
import type { AuthUser, PortalConfig } from './lib/types'
import { LoginPage } from './components/LoginPage'
import { ProjectDashboard } from './components/ProjectDashboard'
import { InstitutionPortal } from './components/InstitutionPortal'
import { DepartmentPortal } from './components/DepartmentPortal'
import { UpcomingEventPopup } from './components/UpcomingEventPopup'

function App(){
  const [config,setConfig]=useState<PortalConfig|null>(null)
  const [user,setUser]=useState<AuthUser|null>(null)
  const [checking,setChecking]=useState(true)
  const [fatal,setFatal]=useState('')
  const [showUpcomingEvent,setShowUpcomingEvent]=useState(false)

  useEffect(()=>{
    Promise.all([
      api.portalConfig(),
      api.me().catch(err=>{
        if(err instanceof ApiError && err.status===401) return null
        throw err
      })
    ]).then(([portalConfig,me])=>{
      setConfig(portalConfig)
      if(me)setUser(me.user)
    }).catch(e=>setFatal(e instanceof Error?e.message:String(e))).finally(()=>setChecking(false))
  },[])

  useEffect(()=>{
    if(user)setShowUpcomingEvent(true)
  },[user?.id])

  async function logout(){
    try{await api.logout()}finally{setUser(null)}
  }

  if(checking)return <div className="grid min-h-screen place-items-center bg-navy-950 text-sm font-semibold text-blue-100">Initializing secure Arkavati portal…</div>
  if(fatal||!config)return <div className="grid min-h-screen place-items-center bg-slate-100 px-4"><div className="max-w-xl rounded-2xl border border-rose-200 bg-white p-6 shadow-card"><h1 className="text-xl font-black text-rose-900">Arkavati portal could not initialize</h1><p className="mt-2 text-sm leading-6 text-rose-800">{fatal||'Portal configuration is unavailable.'}</p><button onClick={()=>window.location.reload()} className="mt-4 rounded-xl bg-navy-950 px-4 py-2.5 text-sm font-bold text-white">Retry</button></div></div>
  if(!user)return <LoginPage config={config} onLogin={setUser}/>

  const portal=user.organization_type==='INSTITUTION'
    ? <InstitutionPortal user={user} onLogout={logout}/>
    : user.organization_type==='COMPANY'&&user.role==='COMPANY_DEPARTMENT_USER'
      ? <DepartmentPortal user={user} onLogout={logout}/>
      : <ProjectDashboard user={user} onLogout={logout}/>

  return <>
    {portal}
    <UpcomingEventPopup open={showUpcomingEvent} onClose={()=>setShowUpcomingEvent(false)}/>
  </>
}

export default App
