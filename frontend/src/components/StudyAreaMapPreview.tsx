import { MapPinned } from 'lucide-react'

export function StudyAreaMapPreview() {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-card">
      <div className="flex h-[260px] flex-col sm:h-[300px] lg:h-[340px] 2xl:h-[380px]">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <div className="text-[10px] font-black uppercase tracking-[0.15em] text-blue-700">Study Area</div>
            <div className="mt-0.5 text-sm font-black text-navy-950">Arkavathi River System</div>
          </div>
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <MapPinned size={18} />
          </div>
        </div>
        <div className="min-h-0 flex-1 bg-slate-50 p-2">
          <img
            src="/project/arkavathi-study-area-map.png"
            alt="Arkavathi River basin study area map with major tributaries"
            className="h-full w-full object-contain"
          />
        </div>
        <div className="border-t border-slate-200 px-4 py-2 text-[11px] font-semibold text-slate-600">
          Arkavathi basin · Cauvery basin · 3 major tributaries
        </div>
      </div>
    </section>
  )
}
