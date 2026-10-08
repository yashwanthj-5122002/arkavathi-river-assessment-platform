import { BarChart3, BadgeCheck, CalendarDays, ClipboardCheck, ClipboardList, Database, FileBarChart, FlaskConical, FolderArchive, History, Home, KeyRound, Map, PersonStanding, ShieldCheck, Waves } from 'lucide-react'
import type { AuthUser, PermissionProfile } from '../lib/types'

export type DashboardPage =
  'overview'|'gis-map'|'street-view'|'industry-intelligence'|'event-handler'|'flight-explorer'|'analytics'|'data-readiness'|'civil-modules'|'scientific-modules'|'verification'|'department-data'|'civil-review'|'task-management'|'review-centre'|'approval-dashboard'|'notifications'|'audit-history'|'cnnl-approved'|'access-control'

const baseItems = [
  [Home,'Overview','overview'],[Map,'GIS Map','gis-map'],[PersonStanding,'Street View','street-view'],[CalendarDays,'Event Handler','event-handler'],
  [BarChart3,'Coverage Analytics','analytics'],[Database,'Data Readiness','data-readiness'],
  [Waves,'Civil Modules','civil-modules'],[FlaskConical,'Scientific Modules','scientific-modules'],[FileBarChart,'Verification','verification']
] as const

export function Sidebar({user,permissions,activePage,onNavigate}:{user:AuthUser;permissions:PermissionProfile|null;activePage:DashboardPage;onNavigate:(page:DashboardPage)=>void}) {
  const has=(p:string)=>permissions?.permissions.includes(p)??false
  const items:any[]=[...baseItems]
  if(user.organization_type==='COMPANY'&&user.role==='COMPANY_ADMIN')items.push([FolderArchive,'Data Repository','department-data'])
  if(has('TASK.VIEW_ALL')||has('TASK.VIEW_ASSIGNED'))items.push([ClipboardList,user.organization_type==='COMPANY'?'Task Management':'My Tasks','task-management'])
  if(has('WORKFLOW.REVIEW'))items.push([ClipboardCheck,'Review Centre','review-centre'])
  if(has('WORKFLOW.FINAL_APPROVE')||has('WORKFLOW.INTEGRATE'))items.push([ShieldCheck,'Approval Dashboard','approval-dashboard'])
  if(has('CNNL.VIEW_APPROVED'))items.push([BadgeCheck,'Approved Data','cnnl-approved'])
  if(has('AUDIT.VIEW'))items.push([History,'Audit History','audit-history'])
  if(user.role==='COMPANY_ADMIN')items.push([KeyRound,'Access Control','access-control'])

  return <aside className="ark-sidebar sticky top-0 hidden h-screen shrink-0 flex-col px-3 py-4 text-white lg:flex">
    <div className="ark-sidebar-brand mb-5 flex items-center px-1.5 py-1">
      <div className="flex w-12 shrink-0 flex-col items-center justify-center">
        <img src="/branding/cnnl-logo.png" alt="CNNL logo" className="h-11 w-11 object-contain"/>
      </div>
      <div className="mx-2 h-11 w-px shrink-0 bg-white/20"/>
      <img src="/branding/karnataka-emblem.png" alt="Government of Karnataka emblem" className="h-11 w-11 shrink-0 object-contain"/>
      <div className="ml-2.5 min-w-0 flex-1">
        <div className="text-[12px] font-black leading-[15px] text-white">Cauvery Neeravari Nigama Limited</div>
        <div className="mt-0.5 text-[9px] font-semibold leading-3 text-blue-100">Government of Karnataka</div>
      </div>
    </div>

    <nav className="ark-sidebar-nav space-y-1 overflow-y-auto pr-1">{items.map(([Icon,label,page])=><button key={`${label}-${page}`} type="button" onClick={()=>onNavigate(page as DashboardPage)} aria-current={activePage===page?'page':undefined} className={`ark-sidebar-link flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition ${activePage===page?'bg-white/15 font-bold text-white shadow-sm':'text-blue-50 hover:bg-white/10'}`}><Icon size={18}/>{label}</button>)}</nav>
    <div className="ark-sidebar-foot mt-auto space-y-2 pt-4">
      <div className="rounded-xl border border-white/10 bg-white/8 p-3 text-xs leading-5 text-blue-100">
        <div className="flex items-center gap-2.5">
          <img src="/branding/nakshatech-mark.png" alt="Nakshatech" className="h-8 w-8 shrink-0 object-contain"/>
          <div className="min-w-0">
            <div className="font-bold text-white">{user.organization_name}</div>
            <div className="mt-0.5 text-[10px]">{user.role.replace(/_/g,' ')}</div>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-white/10 bg-white/8 p-3 text-[11px] leading-5 text-blue-100">Task, review, approval, notifications and audit pages are permission-driven by the backend.</div>
    </div>
  </aside>
}
