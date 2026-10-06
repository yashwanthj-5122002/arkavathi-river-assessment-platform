import { useEffect, useState } from 'react'
import { Bell, ClipboardList, FolderArchive, GitPullRequest } from 'lucide-react'
import type { AuthUser } from '../lib/types'
import { AuthenticatedHeader } from './AuthenticatedHeader'
import { DepartmentDataHub } from './DepartmentDataHub'
import { TaskWorkspace } from './TaskWorkspace'
import { MySubmissionsV18 } from './MySubmissionsV18'
import { NotificationsCentre } from './NotificationsCentre'

type DepartmentView='data'|'tasks'|'workflow'|'notifications'
function fromHash():DepartmentView{const h=window.location.hash.toLowerCase();if(h.includes('/tasks'))return'tasks';if(h.includes('/workflow'))return'workflow';if(h.includes('/notifications'))return'notifications';return'data'}

export function DepartmentPortal({user,onLogout}:{user:AuthUser;onLogout:()=>void}){
  const [view,setView]=useState<DepartmentView>(fromHash())
  useEffect(()=>{const fn=()=>setView(fromHash());window.addEventListener('hashchange',fn);return()=>window.removeEventListener('hashchange',fn)},[])
  function nav(next:DepartmentView){window.location.hash=`department/${next}`;setView(next);window.scrollTo({top:0})}
  const items:[[DepartmentView,any,string],...[DepartmentView,any,string][]]=[['data',FolderArchive,'Department Data'],['tasks',ClipboardList,'My Tasks'],['workflow',GitPullRequest,'My Submissions'],['notifications',Bell,'Notifications']]
  return <div className="min-h-screen bg-slate-100"><AuthenticatedHeader user={user} onLogout={onLogout} subtitle="Nakshatech Department Workspace · passkey required for every new upload batch"/><div className="mx-auto flex max-w-[1700px] gap-5 p-4 md:p-6"><aside className="sticky top-4 hidden h-[calc(100vh-2rem)] w-64 shrink-0 flex-col rounded-2xl bg-navy-950 p-3 text-white shadow-card lg:flex"><div className="p-3"><div className="text-[11px] font-black uppercase tracking-[.18em] text-cyan-200">Nakshatech Data Team</div><div className="mt-2 text-xl font-black">Department Workspace</div><div className="mt-1 text-xs text-blue-200">{user.display_name}</div></div><nav className="mt-4 space-y-1">{items.map(([key,Icon,label])=><button key={key} onClick={()=>nav(key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-bold ${view===key?'bg-white text-navy-950':'text-blue-50 hover:bg-white/10'}`}><Icon size={18}/>{label}</button>)}</nav><div className="mt-auto rounded-xl border border-white/10 bg-white/5 p-3 text-xs leading-5 text-blue-100">Department passkeys authorize <strong className="text-white">one new upload batch at a time</strong>. Task and submission access comes from the logged-in account.</div></aside><main className="min-w-0 flex-1 space-y-4"><div className="flex gap-2 overflow-x-auto lg:hidden">{items.map(([key,,label])=><button key={key} onClick={()=>nav(key)} className={`whitespace-nowrap rounded-full px-4 py-2 text-xs font-black ${view===key?'bg-navy-950 text-white':'border border-slate-300 bg-white text-slate-700'}`}>{label}</button>)}</div>{view==='data'&&<><div className="rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-navy-900"><strong>Department upload access:</strong> select Civil, GIS, Survey, LiDAR or Photogrammetry. Every new upload asks for that department passkey again. Mixed-format multi-file batches remain supported.</div><DepartmentDataHub user={user}/></>}{view==='tasks'&&<TaskWorkspace title="My Department Tasks" subtitle="Tasks assigned by Nakshatech project management to this department uploader account."/>}{view==='workflow'&&<MySubmissionsV18/>}{view==='notifications'&&<NotificationsCentre/>}</main></div></div>
}
