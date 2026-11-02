import { useEffect, useRef } from 'react'
import type { SurveyRoutePoint, SurveyTrack } from './surveyRouteParser'

/**
 * Route playback engine for the GIS Atlas "Verified Survey" layer.
 *
 * The movement model is preserved from the existing Video/SRT survey map
 * (StreetViewPanel `syncPointForTime`): a binary search over the ordered sample
 * sequence followed by linear interpolation between the two bracketing points.
 * Only the surface changed - the engine is UI-free, keeps the complete coordinate
 * sequence in memory, and reports every frame through a callback instead of React state.
 */

export const PLAYBACK_SPEEDS = [0.5, 1, 2, 4] as const

const UI_PUBLISH_INTERVAL_MS = 80
const FALLBACK_SECONDS_PER_POINT = 0.05
const FALLBACK_MIN_SECONDS = 30
const FALLBACK_MAX_SECONDS = 3600

export type PlaybackSample = {
  index: number
  position: number
  totalPoints: number
  progress: number
  elapsed: number
  duration: number
  lon: number
  lat: number
  altitude: number | null
  timestamp: number | null
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'ended'

export type PlaybackSnapshot = {
  status: PlaybackStatus
  index: number
  position: number
  totalPoints: number
  progress: number
  elapsed: number
  duration: number
  speed: number
  lon: number | null
  lat: number | null
  altitude: number | null
  timestamp: number | null
  timed: boolean
}

export type SurveyTimeline = {
  totalPoints: number
  timed: boolean
  duration: number
  startTimestamp: number | null
  sampleAt: (elapsed: number) => PlaybackSample
}

const EMPTY_SNAPSHOT: PlaybackSnapshot = {
  status: 'idle',
  index: 0,
  position: 0,
  totalPoints: 0,
  progress: 0,
  elapsed: 0,
  duration: 0,
  speed: 1,
  lon: null,
  lat: null,
  altitude: null,
  timestamp: null,
  timed: false,
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

function lerpNumber(from: number, to: number, ratio: number): number {
  return from + (to - from) * ratio
}

/** Formats seconds as mm:ss, or hh:mm:ss beyond one hour. */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(2, '0')
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${String(h).padStart(2, '0')}:${mm}:${ss}` : `${mm}:${ss}`
}

function reliableTimes(points: SurveyRoutePoint[]): Float64Array | null {
  if (points.length < 2) return null
  const first = points[0].timestamp
  if (first === null) return null
  const times = new Float64Array(points.length)
  let previous: number = first
  for (let index = 0; index < points.length; index += 1) {
    const stamp = points[index].timestamp
    if (stamp === null || stamp < previous) return null
    previous = stamp
    times[index] = (stamp - first) / 1000
  }
  if (times[points.length - 1] <= 0) return null
  return times
}

/**
 * Builds the playback timeline for a track.
 * Timestamped tracks keep their real relative intervals; untimed tracks fall back to
 * ordered point-index playback. Either way every point of the sequence participates.
 */
export function buildSurveyTimeline(track: SurveyTrack | null): SurveyTimeline | null {
  const points = track?.points ?? []
  const totalPoints = points.length
  if (!totalPoints) return null

  const emptySample = (elapsed: number, duration: number, progress: number, index: number): PlaybackSample => {
    const point = points[index]
    return {
      index,
      position: index + 1,
      totalPoints,
      progress,
      elapsed,
      duration,
      lon: point.lon,
      lat: point.lat,
      altitude: point.altitude,
      timestamp: point.timestamp,
    }
  }

  if (totalPoints === 1) {
    return {
      totalPoints,
      timed: false,
      duration: 0,
      startTimestamp: points[0].timestamp,
      sampleAt: () => emptySample(0, 0, 1, 0),
    }
  }

  const times = reliableTimes(points)
  const timed = times !== null
  const duration = timed
    ? times[totalPoints - 1]
    : clamp(totalPoints * FALLBACK_SECONDS_PER_POINT, FALLBACK_MIN_SECONDS, FALLBACK_MAX_SECONDS)
  const safeDuration = Math.max(duration, 0.001)

  const sampleAt = (rawElapsed: number): PlaybackSample => {
    const elapsed = clamp(rawElapsed, 0, safeDuration)
    const progress = clamp(elapsed / safeDuration, 0, 1)

    if (timed && times) {
      const last = totalPoints - 1
      if (elapsed <= 0) return emptySample(0, safeDuration, 0, 0)
      if (elapsed >= times[last]) return emptySample(safeDuration, safeDuration, 1, last)
      let lo = 0
      let hi = last
      while (lo + 1 < hi) {
        const mid = Math.floor((lo + hi) / 2)
        if (times[mid] <= elapsed) lo = mid
        else hi = mid
      }
      const a = points[lo]
      const b = points[hi]
      const gap = Math.max(0.001, times[hi] - times[lo])
      const ratio = clamp((elapsed - times[lo]) / gap, 0, 1)
      return {
        index: lo,
        position: lo + 1,
        totalPoints,
        progress,
        elapsed,
        duration: safeDuration,
        lon: lerpNumber(a.lon, b.lon, ratio),
        lat: lerpNumber(a.lat, b.lat, ratio),
        altitude: a.altitude ?? b.altitude,
        timestamp: lerpNumber(a.timestamp ?? 0, b.timestamp ?? 0, ratio),
      }
    }

    const floatIndex = progress * (totalPoints - 1)
    const lower = Math.min(totalPoints - 2, Math.max(0, Math.floor(floatIndex)))
    const ratio = clamp(floatIndex - lower, 0, 1)
    if (ratio <= 0) return emptySample(elapsed, safeDuration, progress, lower)
    const a = points[lower]
    const b = points[lower + 1]
    return {
      index: lower,
      position: lower + 1,
      totalPoints,
      progress,
      elapsed,
      duration: safeDuration,
      lon: lerpNumber(a.lon, b.lon, ratio),
      lat: lerpNumber(a.lat, b.lat, ratio),
      altitude: a.altitude ?? b.altitude,
      timestamp: lerpNumber(a.timestamp ?? 0, b.timestamp ?? 0, ratio),
    }
  }

  return { totalPoints, timed, duration: safeDuration, startTimestamp: points[0].timestamp, sampleAt }
}

export class SurveyPlaybackEngine {
  private timeline: SurveyTimeline | null = null
  private track: SurveyTrack | null = null
  private elapsed = 0
  private speed = 1
  private status: PlaybackStatus = 'idle'
  private frameHandle: number | null = null
  private lastFrameAt = 0
  private lastPublishAt = 0
  private snapshot: PlaybackSnapshot = EMPTY_SNAPSHOT
  private listeners = new Set<() => void>()
  private disposed = false
  private onFrame: (sample: PlaybackSample | null) => void

  constructor(onFrame: (sample: PlaybackSample | null) => void) {
    this.onFrame = onFrame
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  getSnapshot = (): PlaybackSnapshot => this.snapshot

  /** Loads a track and resets every piece of playback state. */
  setTrack(track: SurveyTrack | null): void {
    // Reference equality: track ids are only unique within a dataset, and parsed track
    // objects are stable across renders, so this safely detects real selection changes.
    if (track === this.track) return
    this.stopLoop()
    this.track = track
    this.timeline = buildSurveyTimeline(track)
    this.elapsed = 0
    this.status = 'idle'
    this.lastFrameAt = 0
    this.onFrame(null)
    this.snapshot = this.composeSnapshot(EMPTY_SNAPSHOT)
    this.publish()
    if (this.timeline) {
      this.onFrame(this.timeline.sampleAt(0))
      this.publish()
    }
  }

  /** Re-emits the current sample, used once the map source exists. */
  emitCurrent(): void {
    if (!this.timeline) { this.onFrame(null); return }
    this.onFrame(this.timeline.sampleAt(this.elapsed))
  }

  play(): void {
    if (!this.timeline || this.timeline.totalPoints < 2) return
    if (this.status === 'ended') this.elapsed = 0
    this.status = 'playing'
    this.lastFrameAt = 0
    this.publish()
    this.startLoop()
  }

  pause(): void {
    if (this.status !== 'playing') return
    this.status = 'paused'
    this.stopLoop()
    this.publish()
  }

  toggle(): void {
    if (this.status === 'playing') this.pause()
    else this.play()
  }

  restart(): void {
    if (!this.timeline) return
    this.pause()
    this.elapsed = 0
    this.status = this.timeline.totalPoints < 2 ? 'idle' : 'paused'
    this.onFrame(this.timeline.sampleAt(0))
    this.publish()
  }

  seekFraction(fraction: number): void {
    if (!this.timeline) return
    const target = clamp(fraction, 0, 1)
    this.elapsed = target * this.timeline.duration
    if (this.status === 'ended' && target < 1) this.status = 'paused'
    this.onFrame(this.timeline.sampleAt(this.elapsed))
    this.publish()
  }

  seekIndex(index: number): void {
    if (!this.timeline) return
    this.seekFraction(this.timeline.totalPoints < 2 ? 0 : clamp(index, 0, this.timeline.totalPoints - 1) / (this.timeline.totalPoints - 1))
  }

  setSpeed(value: number): void {
    this.speed = value === 0.5 || value === 2 || value === 4 ? value : 1
    this.publish()
  }

  dispose(): void {
    this.disposed = true
    this.stopLoop()
    this.listeners.clear()
  }

  private composeSnapshot(base: PlaybackSnapshot): PlaybackSnapshot {
    if (!this.timeline) return { ...EMPTY_SNAPSHOT, speed: this.speed }
    const sample = this.timeline.sampleAt(this.elapsed)
    return {
      ...base,
      status: this.status,
      index: sample.index,
      position: sample.position,
      totalPoints: sample.totalPoints,
      progress: sample.progress,
      elapsed: sample.elapsed,
      duration: sample.duration,
      speed: this.speed,
      lon: sample.lon,
      lat: sample.lat,
      altitude: sample.altitude,
      timestamp: sample.timestamp,
      timed: this.timeline.timed,
    }
  }

  private publish(): void {
    this.snapshot = this.composeSnapshot(this.snapshot)
    for (const listener of this.listeners) listener()
  }

  private startLoop(): void {
    if (this.disposed || this.frameHandle !== null) return
    this.frameHandle = requestAnimationFrame(this.tick)
  }

  private stopLoop(): void {
    if (this.frameHandle !== null) {
      cancelAnimationFrame(this.frameHandle)
      this.frameHandle = null
    }
    this.lastFrameAt = 0
  }

  private tick = (now: number): void => {
    this.frameHandle = null
    const timeline = this.timeline
    if (this.disposed || !timeline || this.status !== 'playing') return
    const delta = this.lastFrameAt ? Math.max(0, (now - this.lastFrameAt) / 1000) : 0
    this.lastFrameAt = now
    let elapsed = this.elapsed + delta * this.speed
    if (elapsed >= timeline.duration) {
      elapsed = timeline.duration
      this.status = 'ended'
    }
    this.elapsed = elapsed
    const sample = timeline.sampleAt(elapsed)
    this.onFrame(sample)
    if (this.status === 'playing') {
      if (now - this.lastPublishAt >= UI_PUBLISH_INTERVAL_MS) {
        this.lastPublishAt = now
        this.publish()
      }
      this.startLoop()
    } else {
      this.lastPublishAt = now
      this.publish()
    }
  }
}

/** Creates a stable playback engine bound to the supplied track and per-frame callback. */
export function useSurveyPlaybackEngine(
  track: SurveyTrack | null,
  onFrame: (sample: PlaybackSample | null) => void,
): SurveyPlaybackEngine {
  const frameRef = useRef(onFrame)
  frameRef.current = onFrame
  const engineRef = useRef<SurveyPlaybackEngine | null>(null)
  if (!engineRef.current) engineRef.current = new SurveyPlaybackEngine(sample => frameRef.current(sample))
  const engine = engineRef.current
  useEffect(() => { engine.setTrack(track) }, [engine, track])
  useEffect(() => () => engine.dispose(), [engine])
  return engine
}