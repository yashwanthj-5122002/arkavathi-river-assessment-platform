import { useCallback, useEffect, useRef, useState } from 'react'

const FALLBACK_VIDEO = '/videos/Dashboard_Drone_Video.mp4'

function normaliseVideoSource(entries: unknown): string {
  if (!Array.isArray(entries)) return FALLBACK_VIDEO
  const first = entries.find((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
  if (!first) return FALLBACK_VIDEO
  return first.startsWith('/') ? first : `/videos/${first}`
}

export function ArkavathiVideoShowcase() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoSrc, setVideoSrc] = useState(FALLBACK_VIDEO)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let cancelled = false

    fetch('/videos/video-playlist.json', { cache: 'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`Playlist request returned ${response.status}`)
        return response.json()
      })
      .then(data => {
        if (!cancelled) setVideoSrc(normaliseVideoSource(data))
      })
      .catch(() => {
        if (!cancelled) setVideoSrc(FALLBACK_VIDEO)
      })

    return () => {
      cancelled = true
      videoRef.current?.pause()
    }
  }, [])

  const ensurePlayback = useCallback(async () => {
    const video = videoRef.current
    if (!video) return
    try {
      await video.play()
      setLoadError('')
    } catch {
      // Muted autoplay is normally permitted. If the browser temporarily blocks
      // playback, visibility/focus and can-play events below retry automatically.
    }
  }, [])

  useEffect(() => {
    const resume = () => {
      if (!document.hidden) void ensurePlayback()
    }
    document.addEventListener('visibilitychange', resume)
    window.addEventListener('focus', resume)
    return () => {
      document.removeEventListener('visibilitychange', resume)
      window.removeEventListener('focus', resume)
    }
  }, [ensurePlayback])

  return (
    <section className="ark-overview-video overflow-hidden rounded-2xl border border-slate-200 bg-navy-950 shadow-card">
      <div className="relative h-[260px] overflow-hidden bg-navy-950 sm:h-[300px] lg:h-[340px] 2xl:h-[380px]">
        <video
          ref={videoRef}
          key={videoSrc}
          src={videoSrc}
          className="absolute inset-0 h-full w-full object-cover"
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          onCanPlay={() => void ensurePlayback()}
          onLoadedData={() => void ensurePlayback()}
          onError={() => setLoadError('Project video could not be played. Verify the Dashboard_Drone_Video file in frontend/public/videos.')}
        />

        <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-slate-950/80 via-transparent to-slate-950/10" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4 md:p-5">
          <div className="min-w-0 text-white">
            <div className="text-xs font-black uppercase tracking-[0.14em] text-blue-100">Arkavati River Project Visuals</div>
            <div className="mt-1 text-xs font-semibold text-white/80">Continuous project drone footage · looping automatically</div>
            {loadError && <div className="mt-1 text-[11px] font-semibold text-amber-200">{loadError}</div>}
          </div>
        </div>
      </div>
    </section>
  )
}
