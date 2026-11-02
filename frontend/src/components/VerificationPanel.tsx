import { BadgeCheck, CircleAlert } from 'lucide-react'
import type { Verification } from '../lib/types'

export function VerificationPanel({data}:{data:Verification}){
  const passed = data.validation_passed
  return <div className={`rounded-2xl border p-5 ${passed?'border-emerald-200 bg-emerald-50':'border-amber-200 bg-amber-50'}`}>
    <div className="flex items-start gap-3">
      {passed?<BadgeCheck className="mt-0.5 text-emerald-700"/>:<CircleAlert className="mt-0.5 text-amber-700"/>}
      <div className="min-w-0">
        <h3 className="font-extrabold text-slate-900">Project data checks: {passed?'Complete':'Review needed'}</h3>
        <p className="mt-2 text-sm leading-6 text-slate-600">{passed?'Project data is ready.':'Some project data needs review.'}</p>
      </div>
    </div>
  </div>
}
