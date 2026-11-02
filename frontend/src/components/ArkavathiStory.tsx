import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import maplibregl, { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, FileText, Images, LocateFixed, MapPin, Maximize2, Minus, Plus, X } from 'lucide-react'
import {
  CHAPTERS, EVIDENCE_COLORS, EVIDENCE_LABELS, GLOSSARY, INTRO_FACTS, MAP_COLORS, PLACES, RIVER_COLORS, RIVER_NAMES,
  SOURCE_REACH_KM, STRETCH_FROM, STRETCH_TO,
} from './arkavathiStoryContent'
import type { Bbox, Chapter, EvidenceFilter, EvidenceGroup, Photo, PlaceKey, ReachId, RiverId, Stop } from './arkavathiStoryContent'
import '../styles/arkavathi-story.css'

// ---------------------------------------------------------------------------
// Public GIS data (static, unauthenticated assets only)
// ---------------------------------------------------------------------------

type Collection = GeoJSON.FeatureCollection
type Feature = GeoJSON.Feature
type Props = Record<string, unknown>

const DATA_PATH = '/gis/arkavathi/'
const FILES = {
  boundary: 'boundary.geojson',
  sheds: 'sub-hydrosheds.geojson',
  rivers: 'rivers.geojson',
  water: 'waterbodies-major.geojson',
  evidence: 'evidence-points.geojson',
  drains: 'prs-drains.geojson',
  industrial: 'pressure-industrial.geojson',
  drainage: 'drainage-network.geojson',
} as const
type DataKey = keyof typeof FILES
const DATA_KEYS = Object.keys(FILES) as DataKey[]
const EMPTY: Collection = { type: 'FeatureCollection', features: [] }
const RIVER_IDS = Object.keys(RIVER_NAMES) as RiverId[]
const ELEVATION_MANIFEST = `${DATA_PATH}elevation-dem1.manifest.json`
const ELEVATION_IMAGE = `${DATA_PATH}elevation-dem1.png`
const DESKTOP_QUERY = '(min-width: 960px)'

function evidenceGroup(properties: Props): EvidenceGroup {
  if (String(properties.contributor ?? '').startsWith('Paani')) return 'paani'
  return properties.evidenceType === 'citizen' ? 'citizen' : 'research'
}

function prepare(key: DataKey, input: unknown): Collection {
  const value = input as Partial<Collection> | null
  if (value?.type !== 'FeatureCollection' || !Array.isArray(value.features)) throw new Error(`${FILES[key]} is not a GeoJSON FeatureCollection`)
  const features = value.features.filter(feature => feature?.type === 'Feature' && feature.geometry)
  features.forEach((feature, index) => {
    feature.id = index
    const properties: Props = feature.properties ?? {}
    feature.properties = properties
    if (key === 'evidence') {
      properties._group = evidenceGroup(properties)
      properties._site = /^Site ([A-Z])\b/.exec(String(properties.locationName ?? ''))?.[1] ?? ''
    }
    if (key === 'drains') properties._town = /kanakapura/i.test(String(properties.description ?? '')) ? 'Kanakapura' : 'Ramanagara'
  })
  return { type: 'FeatureCollection', features }
}

// One request per dataset for the lifetime of the page, shared by every map
// instance (React StrictMode mounts twice in development).
const dataCache = new Map<DataKey, Promise<Collection>>()
function loadData(key: DataKey): Promise<Collection> {
  let request = dataCache.get(key)
  if (!request) {
    request = fetch(DATA_PATH + FILES[key])
      .then(response => {
        if (!response.ok) throw new Error(`${FILES[key]}: HTTP ${response.status}`)
        return response.json()
      })
      .then(json => prepare(key, json))
    request.catch(() => dataCache.delete(key))
    dataCache.set(key, request)
  }
  return request
}

function dataKeysFor(stop: Stop): DataKey[] {
  const keys = new Set<DataKey>(['boundary', 'rivers'])
  if (stop.reservoirs?.length || stop.waterContext) keys.add('water')
  if (stop.sheds) keys.add('sheds')
  if (stop.drainage) keys.add('drainage')
  if (stop.industrial) keys.add('industrial')
  if (stop.evidence) keys.add('evidence')
  if (stop.drains) keys.add('drains')
  for (const ref of stop.frame) {
    if (ref.kind === 'water') keys.add('water')
    if (ref.kind === 'shed') keys.add('sheds')
    if (ref.kind === 'evidence') keys.add('evidence')
    if (ref.kind === 'drains') keys.add('drains')
  }
  return [...keys]
}

function matchesEvidence(properties: Props, filter: EvidenceFilter): boolean {
  if (filter.groups && !filter.groups.includes(properties._group as EvidenceGroup)) return false
  if (filter.sheds && !filter.sheds.includes(String(properties.shedId ?? ''))) return false
  if (filter.sites && !filter.sites.includes(String(properties._site ?? ''))) return false
  if (filter.contributors && !filter.contributors.some(name => String(properties.contributor ?? '').includes(name))) return false
  return true
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

type Position = number[]

function haversineKm(a: Position, b: Position) {
  const rad = Math.PI / 180
  const dLat = (b[1] - a[1]) * rad
  const dLng = (b[0] - a[0]) * rad
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2
  return 2 * 6371.0088 * Math.asin(Math.sqrt(h))
}

function extendBox(box: Bbox | null, coordinates: unknown): Bbox | null {
  if (Array.isArray(coordinates) && typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
    const [x, y] = coordinates as number[]
    if (!Number.isFinite(x) || !Number.isFinite(y)) return box
    return box ? [Math.min(box[0], x), Math.min(box[1], y), Math.max(box[2], x), Math.max(box[3], y)] : [x, y, x, y]
  }
  if (Array.isArray(coordinates)) for (const child of coordinates) box = extendBox(box, child)
  return box
}

function featuresBox(features: Feature[]): Bbox | null {
  let box: Bbox | null = null
  for (const feature of features) {
    if (feature.geometry && 'coordinates' in feature.geometry) box = extendBox(box, feature.geometry.coordinates)
  }
  return box
}

function unionBox(a: Bbox | null, b: Bbox | null): Bbox | null {
  if (!a) return b
  if (!b) return a
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])]
}

function pointBox([lng, lat]: [number, number], km: number): Bbox {
  const dLat = km / 110.574
  const dLng = km / (111.32 * Math.cos(lat * Math.PI / 180))
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat]
}

function lineOf(feature: Feature | undefined): Position[] {
  const geometry = feature?.geometry
  if (!geometry) return []
  if (geometry.type === 'LineString') return geometry.coordinates
  if (geometry.type === 'MultiLineString') return geometry.coordinates.flat()
  return []
}

function nearestIndex(line: Position[], point: Position) {
  let best = 0
  let bestDistance = Infinity
  line.forEach((vertex, index) => {
    const distance = (vertex[0] - point[0]) ** 2 + (vertex[1] - point[1]) ** 2
    if (distance < bestDistance) { bestDistance = distance; best = index }
  })
  return best
}

// Highlighted reaches are slices of the verified Arkavathi line, never new geometry.
function buildReaches(rivers: Collection): Collection {
  const line = lineOf(rivers.features.find(feature => feature.properties?.riverId === 'arkavathi'))
  if (line.length < 2) return EMPTY
  let km = 0
  let sourceEnd = 1
  while (sourceEnd < line.length - 1 && km < SOURCE_REACH_KM) { km += haversineKm(line[sourceEnd - 1], line[sourceEnd]); sourceEnd += 1 }
  const from = nearestIndex(line, STRETCH_FROM)
  const to = nearestIndex(line, STRETCH_TO)
  const confluence = nearestIndex(line, PLACES.vrishConf.at)
  const reach = (id: string, coordinates: Position[]): Feature => ({ type: 'Feature', properties: { reach: id }, geometry: { type: 'LineString', coordinates } })
  return {
    type: 'FeatureCollection',
    features: [
      reach('source', line.slice(0, sourceEnd + 1)),
      reach('downstream', line.slice(confluence)),
      reach('stretch', line.slice(Math.min(from, to), Math.max(from, to) + 1)),
    ],
  }
}

type LoadedData = Partial<Record<DataKey, Collection>> & { reaches?: Collection }

function resolveFrame(stop: Stop, data: LoadedData): Bbox {
  let box: Bbox | null = null
  for (const ref of stop.frame) {
    let part: Bbox | null = null
    if (ref.kind === 'place') part = pointBox(PLACES[ref.key].at, ref.km)
    else if (ref.kind === 'boundary') part = data.boundary ? featuresBox(data.boundary.features) : null
    else if (ref.kind === 'river') part = data.rivers ? featuresBox(data.rivers.features.filter(f => ref.ids.includes(f.properties?.riverId))) : null
    else if (ref.kind === 'reach') part = data.reaches ? featuresBox(data.reaches.features.filter(f => f.properties?.reach === ref.id)) : null
    else if (ref.kind === 'water') part = data.water ? featuresBox(data.water.features.filter(f => ref.names.includes(f.properties?.name))) : null
    else if (ref.kind === 'shed') part = data.sheds ? featuresBox(data.sheds.features.filter(f => ref.names.includes(f.properties?.name))) : null
    else if (ref.kind === 'drains') part = data.drains ? featuresBox(data.drains.features) : null
    else if (ref.kind === 'evidence' && data.evidence) part = featuresBox(data.evidence.features.filter(f => matchesEvidence(f.properties ?? {}, ref)))
    // If any referenced dataset is not loaded yet, use the precomputed bounds.
    if (!part) return stop.fallback
    box = unionBox(box, part)
  }
  // Every labelled place of the stop is kept inside the frame.
  for (const key of stop.places ?? []) box = unionBox(box, pointBox(PLACES[key].at, 0.4))
  return box ?? stop.fallback
}

// ---------------------------------------------------------------------------
// StoryMapState: the single authoritative description of what the map shows.
// ---------------------------------------------------------------------------

type Active = { chapter: number; stop: number }

type StoryMapState = {
  chapter: number
  stop: number
  def: Stop
  basemap: 'street' | 'satellite'
  boundary: 'full' | 'context'
  rivers: { active: RiverId[]; context: RiverId[] }
  reach: ReachId | null
  reservoirs: { active: string[]; focus: string | null; context: boolean }
  sheds: { visible: boolean; active: string[] }
  drainage: boolean
  elevation: boolean
  industrial: boolean
  evidence: EvidenceFilter | null
  drains: boolean
  places: PlaceKey[]
  spotlight: PlaceKey | null
}

function storyMapState({ chapter, stop }: Active): StoryMapState {
  const def = CHAPTERS[chapter].stops[stop]
  const active = def.rivers ?? []
  return {
    chapter,
    stop,
    def,
    basemap: def.basemap ?? 'street',
    boundary: def.boundary ?? 'context',
    rivers: { active, context: (def.riverContext ?? []).filter(id => !active.includes(id)) },
    reach: def.reach ?? null,
    reservoirs: { active: def.reservoirs ?? [], focus: def.reservoirFocus ?? null, context: Boolean(def.waterContext) },
    sheds: { visible: Boolean(def.sheds), active: Array.isArray(def.sheds) ? def.sheds : [] },
    drainage: Boolean(def.drainage),
    elevation: Boolean(def.elevation),
    industrial: Boolean(def.industrial),
    evidence: def.evidence ?? null,
    drains: Boolean(def.drains),
    places: def.places ?? [],
    spotlight: def.spotlight ?? null,
  }
}

// ---------------------------------------------------------------------------
// Map style and layers (natural basemap, strictly two-dimensional, north-up)
// ---------------------------------------------------------------------------

const NONE = '__none__'
type Expression = maplibregl.ExpressionSpecification
type Filter = maplibregl.FilterSpecification

function mapStyle(reducedMotion: boolean): maplibregl.StyleSpecification {
  return {
    version: 8,
    transition: { duration: reducedMotion ? 0 : 450, delay: 0 },
    sources: {
      street: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' },
      satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 18, attribution: 'Imagery © Esri' },
    },
    // The provider tiles are shown in their own natural colours, with no tint or filter.
    layers: [
      { id: 'story-paper', type: 'background', paint: { 'background-color': '#f2efe9' } },
      { id: 'story-street', type: 'raster', source: 'street' },
      { id: 'story-satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
    ],
  }
}

const sourceId = (key: string) => `story-source-${key}`
const none = (property: string): Filter => ['==', ['get', property], NONE]
const anyOf = (property: string, values: string[]): Filter => ['in', ['get', property], ['literal', values]]

function evidenceFilter(filter: EvidenceFilter | null): Filter {
  if (!filter) return none('_group')
  const parts: Expression[] = []
  if (filter.groups) parts.push(['in', ['get', '_group'], ['literal', filter.groups]])
  if (filter.sheds) parts.push(['in', ['coalesce', ['get', 'shedId'], ''], ['literal', filter.sheds]])
  if (filter.sites) parts.push(['in', ['get', '_site'], ['literal', filter.sites]])
  if (filter.contributors) parts.push(['any', ...filter.contributors.map(name => ['in', name, ['coalesce', ['get', 'contributor'], '']] as Expression)])
  return (parts.length ? ['all', ...parts] : ['has', '_group']) as Filter
}

function addStoryLayers(map: MapLibreMap) {
  for (const key of DATA_KEYS) map.addSource(sourceId(key), { type: 'geojson', data: EMPTY })
  map.addSource(sourceId('reaches'), { type: 'geojson', data: EMPTY })
  const hidden = { visibility: 'none' as const }
  const round = { 'line-join': 'round' as const, 'line-cap': 'round' as const }

  map.addLayer({ id: 'story-sheds-active', type: 'fill', source: sourceId('sheds'), filter: anyOf('name', []), paint: { 'fill-color': '#171C1A', 'fill-opacity': 0.1 } })
  map.addLayer({ id: 'story-industrial-fill', type: 'fill', source: sourceId('industrial'), filter: ['==', ['geometry-type'], 'Polygon'], layout: hidden, paint: { 'fill-color': MAP_COLORS.industrial, 'fill-opacity': 0.45 } })
  map.addLayer({ id: 'story-industrial-line', type: 'line', source: sourceId('industrial'), filter: ['==', ['geometry-type'], 'Polygon'], layout: hidden, paint: { 'line-color': '#4E3A2E', 'line-width': 1, 'line-opacity': 0.8 } })
  map.addLayer({ id: 'story-water-context', type: 'fill', source: sourceId('water'), layout: hidden, paint: { 'fill-color': MAP_COLORS.waterContext, 'fill-opacity': 0.65 } })
  map.addLayer({ id: 'story-water-active', type: 'fill', source: sourceId('water'), filter: anyOf('name', []), paint: { 'fill-color': MAP_COLORS.reservoir, 'fill-opacity': 0.82 } })
  map.addLayer({ id: 'story-water-active-line', type: 'line', source: sourceId('water'), filter: anyOf('name', []), paint: { 'line-color': MAP_COLORS.reservoirLine, 'line-width': 1.6 } })
  map.addLayer({ id: 'story-water-focus-line', type: 'line', source: sourceId('water'), filter: none('name'), paint: { 'line-color': '#171C1A', 'line-width': 2.8 } })
  map.addLayer({ id: 'story-sheds-line', type: 'line', source: sourceId('sheds'), layout: hidden, paint: { 'line-color': MAP_COLORS.shedLine, 'line-width': 1.1, 'line-opacity': 0.75, 'line-dasharray': [3, 2] } })
  map.addLayer({ id: 'story-sheds-active-line', type: 'line', source: sourceId('sheds'), filter: anyOf('name', []), paint: { 'line-color': '#171C1A', 'line-width': 2.2 } })
  map.addLayer({
    id: 'story-drainage-line', type: 'line', source: sourceId('drainage'), filter: ['>=', ['get', 'grid_code'], 2], layout: { ...hidden, ...round },
    paint: {
      'line-color': MAP_COLORS.drainage,
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, ['*', 0.2, ['get', 'grid_code']], 12, ['*', 0.5, ['get', 'grid_code']]],
      'line-opacity': ['interpolate', ['linear'], ['get', 'grid_code'], 2, 0.4, 7, 0.95],
    },
  })
  // Real basin boundary: near-black line with a light casing, no fill.
  map.addLayer({ id: 'story-boundary-casing', type: 'line', source: sourceId('boundary'), layout: round, paint: { 'line-color': '#ffffff', 'line-width': 6, 'line-opacity': 0.75 } })
  map.addLayer({ id: 'story-boundary-line', type: 'line', source: sourceId('boundary'), layout: round, paint: { 'line-color': MAP_COLORS.boundary, 'line-width': 2.6 } })
  map.addLayer({ id: 'story-reach-band', type: 'line', source: sourceId('reaches'), filter: none('reach'), layout: round, paint: { 'line-color': MAP_COLORS.stretch, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 10, 12, 18], 'line-opacity': 0.3 } })
  map.addLayer({ id: 'story-rivers-casing', type: 'line', source: sourceId('rivers'), filter: anyOf('riverId', []), layout: round, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 6.5, 12, 10], 'line-opacity': 0.85 } })
  map.addLayer({
    id: 'story-rivers-line', type: 'line', source: sourceId('rivers'), filter: anyOf('riverId', []), layout: round,
    paint: { 'line-color': ['match', ['get', 'riverId'], ...RIVER_IDS.flatMap(id => [id, RIVER_COLORS[id]]), '#1677D2'] as unknown as Expression, 'line-width': 3 },
  })
  map.addLayer({ id: 'story-reach-casing', type: 'line', source: sourceId('reaches'), filter: none('reach'), layout: round, paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 8, 12, 12], 'line-opacity': 0.9 } })
  map.addLayer({ id: 'story-reach-line', type: 'line', source: sourceId('reaches'), filter: none('reach'), layout: round, paint: { 'line-color': RIVER_COLORS.arkavathi, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 4.2, 12, 7] } })
  map.addLayer({ id: 'story-industrial-point', type: 'circle', source: sourceId('industrial'), filter: ['==', ['geometry-type'], 'Point'], layout: hidden, paint: { 'circle-color': MAP_COLORS.industrial, 'circle-radius': 4.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.4 } })
  map.addLayer({
    id: 'story-drains-point', type: 'circle', source: sourceId('drains'), layout: hidden,
    paint: {
      'circle-color': MAP_COLORS.drains,
      'circle-radius': ['interpolate', ['linear'], ['coalesce', ['get', 'bodDec2020'], 0], 0, 4.5, 500, 10],
      'circle-opacity': 0.92, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.6,
    },
  })
  map.addLayer({
    id: 'story-evidence-point', type: 'circle', source: sourceId('evidence'), filter: none('_group'), layout: hidden,
    paint: {
      'circle-color': ['match', ['get', '_group'], 'paani', EVIDENCE_COLORS.paani, 'citizen', EVIDENCE_COLORS.citizen, EVIDENCE_COLORS.research] as Expression,
      'circle-radius': 6.5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1.8,
    },
  })
  map.addLayer({ id: 'story-evidence-selected', type: 'circle', source: sourceId('evidence'), filter: ['in', ['id'], ['literal', []]], paint: { 'circle-color': 'rgba(0,0,0,0)', 'circle-radius': 12, 'circle-stroke-color': '#171C1A', 'circle-stroke-width': 2.4 } })
}

/** Applies one complete StoryMapState. Everything not in the state is switched off. */
function applyStoryMapState(map: MapLibreMap, state: StoryMapState) {
  const visible = (id: string, on: boolean) => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none') }

  // Clear transient selections left by the previous stop.
  map.setFilter('story-evidence-selected', ['in', ['id'], ['literal', []]])

  // Basemap and basin boundary.
  const satellite = state.basemap === 'satellite'
  visible('story-satellite', satellite)
  const full = state.boundary === 'full'
  map.setPaintProperty('story-boundary-line', 'line-width', full ? 2.6 : 1.6)
  map.setPaintProperty('story-boundary-line', 'line-opacity', full ? 1 : 0.65)
  map.setPaintProperty('story-boundary-casing', 'line-width', full ? 6 : 4)
  map.setPaintProperty('story-boundary-casing', 'line-opacity', full || satellite ? 0.75 : 0.4)

  // Rivers keep their permanent colours; only weight and visibility change.
  const { active, context } = state.rivers
  const isActive: Expression = ['in', ['get', 'riverId'], ['literal', active]]
  map.setFilter('story-rivers-line', anyOf('riverId', [...active, ...context]))
  map.setFilter('story-rivers-casing', anyOf('riverId', active))
  map.setPaintProperty('story-rivers-line', 'line-width', ['interpolate', ['linear'], ['zoom'], 8, ['case', isActive, 3.6, 1.5], 12, ['case', isActive, 6, 2.4]] as Expression)
  map.setPaintProperty('story-rivers-line', 'line-opacity', ['case', isActive, 1, 0.55] as Expression)

  // Highlighted reach of the Arkavathi, and the listed polluted stretch.
  const focusReach = state.reach === 'source' || state.reach === 'downstream' ? state.reach : NONE
  map.setFilter('story-reach-line', ['==', ['get', 'reach'], focusReach])
  map.setFilter('story-reach-casing', ['==', ['get', 'reach'], focusReach])
  map.setFilter('story-reach-band', ['==', ['get', 'reach'], state.reach === 'stretch' ? 'stretch' : NONE])

  // Reservoirs: all listed ones highlighted together; the focus one gets an outline.
  const { reservoirs } = state
  map.setFilter('story-water-active', anyOf('name', reservoirs.active))
  map.setFilter('story-water-active-line', anyOf('name', reservoirs.active))
  map.setFilter('story-water-focus-line', ['==', ['get', 'name'], reservoirs.focus ?? NONE])
  map.setPaintProperty('story-water-active', 'fill-opacity', reservoirs.focus ? ['case', ['==', ['get', 'name'], reservoirs.focus], 0.9, 0.7] as Expression : 0.82)
  visible('story-water-context', reservoirs.context)

  // Watersheds.
  visible('story-sheds-line', state.sheds.visible)
  map.setPaintProperty('story-sheds-line', 'line-color', satellite ? '#ffffff' : MAP_COLORS.shedLine)
  map.setFilter('story-sheds-active', anyOf('name', state.sheds.active))
  map.setFilter('story-sheds-active-line', anyOf('name', state.sheds.active))

  // Thematic layers: on only when this stop is about them.
  visible('story-drainage-line', state.drainage)
  visible('story-elevation', state.elevation)
  visible('story-industrial-fill', state.industrial)
  visible('story-industrial-line', state.industrial)
  visible('story-industrial-point', state.industrial)
  visible('story-drains-point', state.drains)
  visible('story-evidence-point', Boolean(state.evidence))
  map.setFilter('story-evidence-point', evidenceFilter(state.evidence))
}

/** Quiet cartographic reveal of the real boundary and river lines (Story 1). */
function revealBasin(map: MapLibreMap) {
  const targets: Array<[string, string]> = [
    ['story-boundary-casing', 'line-opacity'], ['story-boundary-line', 'line-opacity'],
    ['story-rivers-casing', 'line-opacity'], ['story-rivers-line', 'line-opacity'],
  ]
  const values = targets.map(([id, property]) => map.getPaintProperty(id, property))
  targets.forEach(([id, property]) => {
    map.setPaintProperty(id, `${property}-transition`, { duration: 0, delay: 0 })
    map.setPaintProperty(id, property, 0)
  })
  window.requestAnimationFrame(() => {
    targets.forEach(([id, property], index) => {
      if (!map.getLayer(id)) return
      map.setPaintProperty(id, `${property}-transition`, { duration: 1600, delay: id.includes('rivers') ? 500 : 100 })
      map.setPaintProperty(id, property, values[index] as number)
    })
    window.setTimeout(() => targets.forEach(([id, property]) => {
      if (map.getLayer(id)) map.setPaintProperty(id, `${property}-transition`, { duration: 450, delay: 0 })
    }), 2400)
  })
}

// ---------------------------------------------------------------------------
// Popups (built with DOM APIs so dataset text is never parsed as HTML)
// ---------------------------------------------------------------------------

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function popupContent(kicker: string, title: string, rows: Array<[string, string]>, link?: string | null, note?: string): HTMLElement {
  const root = document.createElement('article')
  root.className = 'ark-chron-popup'
  const label = document.createElement('p')
  label.className = 'ark-chron-popup-kicker'
  label.textContent = kicker
  const heading = document.createElement('h3')
  heading.textContent = title
  root.append(label, heading)
  const list = document.createElement('dl')
  for (const [key, value] of rows) {
    if (!value) continue
    const row = document.createElement('div')
    const term = document.createElement('dt')
    term.textContent = key
    const detail = document.createElement('dd')
    detail.textContent = value
    row.append(term, detail)
    list.append(row)
  }
  if (list.childElementCount) root.append(list)
  if (link) {
    const anchor = document.createElement('a')
    anchor.href = link
    anchor.target = '_blank'
    anchor.rel = 'noopener noreferrer'
    anchor.textContent = 'Open source document ↗'
    root.append(anchor)
  }
  if (note) {
    const small = document.createElement('p')
    small.className = 'ark-chron-popup-note'
    small.textContent = note
    root.append(small)
  }
  return root
}

function featurePopup(layerId: string, properties: Props): HTMLElement | null {
  if (layerId === 'story-evidence-point') {
    const group = properties._group as EvidenceGroup
    return popupContent(
      group === 'citizen' ? 'Citizen / RTI evidence' : group === 'paani' ? 'Paani.Earth × ICCW · documented finding' : 'Research study · documented finding',
      text(properties.locationName) || 'Evidence location',
      [['Period', text(properties.period)], ['Contributor', text(properties.contributor)], ['Evidence type', text(properties.evidenceType)], ['Recorded finding', text(properties.findings)]],
      safeUrl(properties.evidenceUrl),
      'Reproduced from the project evidence dataset. See the linked source for full results.',
    )
  }
  if (layerId === 'story-drains-point') {
    const bod = text(properties.bodDec2020)
    return popupContent('Polluting drain', text(properties.name) || 'Drain', [['BOD, Dec 2020', bod ? `${bod} mg/L` : ''], ['Location', text(properties.description)], ['Listed stretch', text(properties.stretch)]], null, 'From the project polluting-drain dataset.')
  }
  if (layerId === 'story-water-active' || layerId === 'story-water-context') {
    const name = text(properties.name) === 'Hessarghatta Reservoir' ? 'Hesaraghatta Reservoir' : text(properties.name)
    return popupContent('Waterbody', name || 'Waterbody', [['Custodian', text(properties.custodian)], ['District', text(properties.district)], ['Tank ID', text(properties.tankId)]])
  }
  if (layerId === 'story-industrial-fill' || layerId === 'story-industrial-point') {
    return popupContent('Industrial area (present day)', text(properties.agency) || 'Industrial area', [['Type', text(properties.kind).replace(/-/g, ' ')], ['CETP status', text(properties.cetpNote) || text(properties.cetp)]])
  }
  return null
}

// ---------------------------------------------------------------------------
// Rich narrative text: **highlight** and {{glossary:term}}
// ---------------------------------------------------------------------------

const TOKEN = /\*\*(.+?)\*\*|\{\{(\w+):(.+?)\}\}/g

function Term({ k, uid, children }: { k: string; uid: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const entry = GLOSSARY[k]
  if (!entry) return <>{children}</>
  const tipId = `ark-term-${uid}`
  return (
    <span className={`ark-term${open ? ' is-open' : ''}`}>
      <button
        type="button"
        aria-describedby={tipId}
        onClick={() => setOpen(value => !value)}
        onBlur={() => setOpen(false)}
        onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); event.currentTarget.blur() } }}
      >
        {children}
      </button>
      <span role="tooltip" id={tipId} className="ark-term-tip">
        <strong>{entry.term}</strong> {entry.definition}
      </span>
    </span>
  )
}

function Rich({ value, uid }: { value: string; uid: string }) {
  const parts: ReactNode[] = []
  let last = 0
  let index = 0
  for (const match of value.matchAll(TOKEN)) {
    const start = match.index ?? 0
    if (start > last) parts.push(value.slice(last, start))
    if (match[1] !== undefined) parts.push(<strong key={index} className="ark-hl">{match[1]}</strong>)
    else parts.push(<Term key={index} k={match[2]} uid={`${uid}-${index}`}>{match[3]}</Term>)
    last = start + match[0].length
    index += 1
  }
  if (last < value.length) parts.push(value.slice(last))
  return <>{parts}</>
}

// Dataset findings get glossary support for the water-quality abbreviations.
const withTerms = (value: string) => value.replace(/\b(BOD|COD|DO)\b/g, match => `{{${match.toLowerCase()}:${match}}}`)

// ---------------------------------------------------------------------------
// Legend (derived from the active StoryMapState)
// ---------------------------------------------------------------------------

type LegendItem = { kind: 'line' | 'line-thin' | 'reach' | 'fill' | 'shade' | 'dot' | 'dash' | 'band' | 'ramp'; color: string; label: string }

function legendFor(state: StoryMapState): LegendItem[] {
  const items: LegendItem[] = [{ kind: 'line', color: MAP_COLORS.boundary, label: 'Arkavathi basin boundary' }]
  for (const id of state.rivers.active) items.push({ kind: 'line', color: RIVER_COLORS[id], label: RIVER_NAMES[id] })
  for (const id of state.rivers.context) items.push({ kind: 'line-thin', color: RIVER_COLORS[id], label: RIVER_NAMES[id] })
  if (state.reach === 'source') items.push({ kind: 'reach', color: RIVER_COLORS.arkavathi, label: 'Upper Arkavathi' })
  if (state.reach === 'downstream') items.push({ kind: 'reach', color: RIVER_COLORS.arkavathi, label: 'Lower Arkavathi' })
  if (state.reach === 'stretch') items.push({ kind: 'band', color: MAP_COLORS.stretch, label: 'Listed polluted stretch (approx.)' })
  if (state.reservoirs.active.length) items.push({ kind: 'fill', color: MAP_COLORS.reservoir, label: 'Hesaraghatta & Thippagondanahalli reservoirs' })
  if (state.reservoirs.context) items.push({ kind: 'fill', color: MAP_COLORS.waterContext, label: 'Other lakes and tanks' })
  if (state.sheds.active.length) items.push({ kind: 'shade', color: '#171C1A', label: 'Highlighted catchments' })
  if (state.sheds.visible) items.push({ kind: 'dash', color: MAP_COLORS.shedLine, label: 'Sub-hydrosheds' })
  if (state.drainage) items.push({ kind: 'line-thin', color: MAP_COLORS.drainage, label: 'Drainage network' })
  if (state.elevation) items.push({ kind: 'ramp', color: '', label: 'Elevation 300–1,500 m' })
  if (state.industrial) items.push({ kind: 'fill', color: MAP_COLORS.industrial, label: 'Industrial areas (present day)' })
  if (state.drains) items.push({ kind: 'dot', color: MAP_COLORS.drains, label: 'Polluting drains (size = BOD)' })
  if (state.evidence) {
    const filter = state.evidence
    const groups: EvidenceGroup[] = filter.groups ?? (filter.sites ? ['paani'] : filter.contributors ? ['research'] : ['paani', 'research', 'citizen'])
    for (const group of groups) items.push({ kind: 'dot', color: EVIDENCE_COLORS[group], label: EVIDENCE_LABELS[group] })
  }
  if (state.basemap === 'satellite') items.push({ kind: 'fill', color: '#5b6b4a', label: 'Esri satellite imagery' })
  return items
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type GalleryState = { chapter: number; index: number }
type MapState = 'idle' | 'loading' | 'ready' | 'error'

function chapterGallery(chapter: Chapter): Photo[] {
  const photos: Photo[] = []
  for (const stop of chapter.stops) for (const item of stop.photos ?? []) if (!photos.some(p => p.src === item.src)) photos.push(item)
  for (const item of chapter.extraPhotos) if (!photos.some(p => p.src === item.src)) photos.push(item)
  return photos
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** The reading line that decides which chapter/stop is active (shared by scroll and click). */
function triggerLine(stage: HTMLElement | null) {
  const height = window.innerHeight
  if (window.matchMedia(DESKTOP_QUERY).matches) return height * 0.58
  const box = stage?.getBoundingClientRect()
  const bottom = box ? Math.max(0, Math.min(height, box.bottom)) : 0
  return bottom + (height - bottom) * 0.32
}

const fadeIn = (event: { currentTarget: HTMLImageElement }) => event.currentTarget.classList.add('is-loaded')

export function ArkavathiStory() {
  const introRef = useRef<HTMLElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const mapNode = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const hudRef = useRef<HTMLDivElement>(null)
  const legendRef = useRef<HTMLUListElement>(null)
  const progressRef = useRef<HTMLElement>(null)
  const toolsRef = useRef<HTMLDivElement>(null)
  const stepRefs = useRef(new Map<string, HTMLElement>())
  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const placeMarkers = useRef(new Map<PlaceKey, Marker>())
  const extraMarkers = useRef<Array<{ marker: Marker; show: (state: StoryMapState) => boolean }>>([])
  const loadedRef = useRef<LoadedData>({})
  const activeRef = useRef<Active>({ chapter: 0, stop: 0 })
  const stateRef = useRef<StoryMapState>(storyMapState({ chapter: 0, stop: 0 }))
  const userMovedRef = useRef(false)
  const reducedRef = useRef(false)
  const cameraTimer = useRef<number | null>(null)
  const navLock = useRef(0)
  const revealed = useRef(false)
  const lastFocus = useRef<HTMLElement | null>(null)
  const closeButton = useRef<HTMLButtonElement>(null)

  const [mapStarted, setMapStarted] = useState(false)
  const [mapState, setMapState] = useState<MapState>('idle')
  const [active, setActive] = useState<Active>({ chapter: 0, stop: 0 })
  const [userMoved, setUserMoved] = useState(false)
  const [layerError, setLayerError] = useState(false)
  const [evidence, setEvidence] = useState<Feature[] | null>(null)
  const [drains, setDrains] = useState<Feature[] | null>(null)
  const [findingsError, setFindingsError] = useState(false)
  const [gallery, setGallery] = useState<GalleryState | null>(null)
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  reducedRef.current = reducedMotion

  const galleries = useMemo(() => CHAPTERS.map(chapterGallery), [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // Start the map (and the small findings datasets) shortly before the story is reached.
  useEffect(() => {
    const node = introRef.current
    if (!node || !('IntersectionObserver' in window)) { setMapStarted(true); return }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setMapStarted(true); observer.disconnect() }
    }, { rootMargin: '600px 0px' })
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!mapStarted) return
    let cancelled = false
    Promise.all([loadData('evidence'), loadData('drains')])
      .then(([evidenceData, drainData]) => { if (!cancelled) { setEvidence(evidenceData.features); setDrains(drainData.features) } })
      .catch(() => { if (!cancelled) setFindingsError(true) })
    return () => { cancelled = true }
  }, [mapStarted])

  /** Padding that keeps framed features clear of the story cards, HUD, legend and controls. */
  const framePadding = useCallback(() => {
    const stage = stageRef.current?.getBoundingClientRect()
    if (!stage || !stage.width || !stage.height) return { top: 24, right: 24, bottom: 24, left: 24 }
    const rect = (element: Element | null) => {
      const box = element?.getBoundingClientRect()
      return box && box.width > 0 && box.height > 0 ? box : null
    }
    const hud = rect(hudRef.current)
    const legend = rect(legendRef.current)
    const tools = rect(toolsRef.current)
    const progress = rect(progressRef.current)
    let padding: { top: number; right: number; bottom: number; left: number }
    if (window.matchMedia(DESKTOP_QUERY).matches) {
      const rail = rect(railRef.current)
      const rightEdge = Math.min(tools?.left ?? stage.right, progress?.left ?? stage.right)
      padding = {
        left: rail ? rail.right - stage.left + 36 : stage.width * 0.45,
        top: hud ? hud.bottom - stage.top + 18 : 90,
        right: stage.right - rightEdge + 20,
        bottom: legend ? stage.bottom - legend.top + 16 : 40,
      }
    } else {
      padding = {
        left: 14,
        top: hud ? hud.bottom - stage.top + 12 : 70,
        right: tools ? stage.right - tools.left + 10 : 56,
        bottom: legend ? stage.bottom - legend.top + 10 : 22,
      }
    }
    // Clearance for marker radii, letter pins (drawn above their point) and labels.
    padding.top += 30
    padding.right += 12
    padding.bottom += 12
    padding.left += 12
    // Never let padding consume the whole canvas (fitBounds would refuse to move).
    const spareX = stage.width - padding.left - padding.right
    const spareY = stage.height - padding.top - padding.bottom
    if (spareX < 140) { const scale = Math.max(0, stage.width - 140) / (padding.left + padding.right); padding.left *= scale; padding.right *= scale }
    if (spareY < 120) { const scale = Math.max(0, stage.height - 120) / (padding.top + padding.bottom); padding.top *= scale; padding.bottom *= scale }
    return { top: Math.round(padding.top), right: Math.round(padding.right), bottom: Math.round(padding.bottom), left: Math.round(padding.left) }
  }, [])

  const frameCamera = useCallback((map: MapLibreMap, box: Bbox, maxZoom: number, animate: boolean, offsetY = 0) => {
    // Cancels any outdated camera transition before starting the new one.
    map.stop()
    map.fitBounds([[box[0], box[1]], [box[2], box[3]]], {
      padding: framePadding(),
      offset: [0, offsetY],
      maxZoom,
      bearing: 0,
      pitch: 0,
      duration: animate && !reducedRef.current ? 1500 : 0,
      essential: true,
    })
  }, [framePadding])

  /** Point each place label toward the middle of the open map area so it is not clipped or covered. */
  const orientLabels = useCallback(() => {
    const map = mapRef.current
    if (!map) return
    const padding = framePadding()
    const middle = (padding.left + map.getCanvas().clientWidth - padding.right) / 2
    placeMarkers.current.forEach((marker, key) => {
      const element = marker.getElement()
      const x = map.project(PLACES[key].at).x
      const east = Math.abs(x - middle) < 24 ? PLACES[key].side === 'left' : x < middle
      element.classList.toggle('is-west', !east)
    })
  }, [framePadding])

  const showMarkers = useCallback((state: StoryMapState) => {
    const places = new Set(state.places)
    placeMarkers.current.forEach((marker, key) => {
      const element = marker.getElement()
      element.classList.toggle('is-visible', places.has(key))
      element.classList.toggle('is-spotlight', state.spotlight === key)
    })
    for (const item of extraMarkers.current) item.marker.getElement().classList.toggle('is-visible', item.show(state))
  }, [])

  const openPopup = useCallback((map: MapLibreMap, lngLat: maplibregl.LngLatLike, content: HTMLElement) => {
    popupRef.current?.remove()
    popupRef.current = new Popup({ closeButton: true, maxWidth: 'min(340px, 82vw)', className: 'ark-chron-popup-shell', focusAfterOpen: false })
      .setLngLat(lngLat)
      .setDOMContent(content)
      .addTo(map)
  }, [])

  const addRiverLabels = useCallback((map: MapLibreMap, rivers: Collection) => {
    for (const feature of rivers.features) {
      const id = feature.properties?.riverId as RiverId
      const line = lineOf(feature)
      if (!RIVER_NAMES[id] || line.length < 2) continue
      const element = document.createElement('div')
      element.className = 'ark-river-label'
      element.textContent = RIVER_NAMES[id]
      element.style.setProperty('--river', RIVER_COLORS[id])
      const marker = new maplibregl.Marker({ element, anchor: 'left', offset: [8, 0] }).setLngLat(line[Math.floor(line.length * 0.5)] as [number, number]).addTo(map)
      // Only active rivers are named, and not on close-up place views.
      extraMarkers.current.push({ marker, show: state => state.rivers.active.includes(id) && !state.def.frame.some(ref => ref.kind === 'place') })
    }
    showMarkers(stateRef.current)
  }, [showMarkers])

  const addSiteMarkers = useCallback((map: MapLibreMap, data: Collection) => {
    for (const feature of data.features) {
      const site = feature.properties?._site as string
      if (!site || feature.geometry?.type !== 'Point') continue
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'ark-site-marker'
      element.textContent = site
      element.setAttribute('aria-label', `Paani.Earth site ${site}: ${text(feature.properties?.locationName)}`)
      const coordinates = feature.geometry.coordinates as [number, number]
      element.addEventListener('click', event => {
        event.stopPropagation()
        const content = featurePopup('story-evidence-point', feature.properties ?? {})
        if (content) openPopup(map, coordinates, content)
      })
      const marker = new maplibregl.Marker({ element, anchor: 'bottom', offset: [0, -7] }).setLngLat(coordinates).addTo(map)
      const properties = feature.properties ?? {}
      extraMarkers.current.push({ marker, show: state => Boolean(state.evidence && matchesEvidence(properties, state.evidence)) })
    }
    showMarkers(stateRef.current)
  }, [openPopup, showMarkers])

  const ensureData = useCallback((map: MapLibreMap, stop: Stop) => {
    for (const key of dataKeysFor(stop)) {
      if (loadedRef.current[key]) continue
      loadData(key).then(collection => {
        if (mapRef.current !== map || loadedRef.current[key]) return
        loadedRef.current[key] = collection
        ;(map.getSource(sourceId(key)) as maplibregl.GeoJSONSource | undefined)?.setData(collection)
        if (key === 'rivers') {
          loadedRef.current.reaches = buildReaches(collection)
          ;(map.getSource(sourceId('reaches')) as maplibregl.GeoJSONSource | undefined)?.setData(loadedRef.current.reaches)
          addRiverLabels(map, collection)
        }
        if (key === 'evidence') addSiteMarkers(map, collection)
        // Refine the framing once real geometry replaces the precomputed bounds.
        const current = stateRef.current
        if (!userMovedRef.current && dataKeysFor(current.def).includes(key)) {
          frameCamera(map, resolveFrame(current.def, loadedRef.current), current.def.maxZoom ?? 12.5, true)
          showMarkers(current)
        }
      }).catch(() => { if (mapRef.current === map) setLayerError(true) })
    }
  }, [addRiverLabels, addSiteMarkers, frameCamera, showMarkers])

  /** Builds and applies the complete StoryMapState for a chapter stop, then frames it. */
  const applyStop = useCallback((map: MapLibreMap, target: Active, animate: boolean) => {
    if (!CHAPTERS[target.chapter]?.stops[target.stop]) return
    const previous = stateRef.current
    const state = storyMapState(target)
    stateRef.current = state
    popupRef.current?.remove()
    popupRef.current = null
    applyStoryMapState(map, state)
    showMarkers(state)
    ensureData(map, state.def)
    const next = CHAPTERS[target.chapter].stops[target.stop + 1] ?? CHAPTERS[target.chapter + 1]?.stops[0]
    if (next) ensureData(map, next)
    if (state.chapter === 0 && previous.chapter !== 0 && !reducedRef.current) revealBasin(map)
    frameCamera(map, resolveFrame(state.def, loadedRef.current), state.def.maxZoom ?? 12.5, animate)
  }, [ensureData, frameCamera, showMarkers])

  /** Single entry point for scroll- and click-driven chapter changes. */
  const activate = useCallback((target: Active, immediate: boolean) => {
    const current = activeRef.current
    const changed = current.chapter !== target.chapter || current.stop !== target.stop
    if (!changed && !immediate) return
    activeRef.current = target
    setActive(target)
    // A new chapter or stop is a meaningful transition: the story camera resumes.
    userMovedRef.current = false
    setUserMoved(false)
    if (cameraTimer.current !== null) window.clearTimeout(cameraTimer.current)
    const run = () => {
      cameraTimer.current = null
      // Story layers exist once the style has loaded; tile loading must not block the camera.
      const map = mapRef.current
      if (map?.getLayer('story-rivers-line')) applyStop(map, activeRef.current, true)
    }
    if (immediate) run()
    else cameraTimer.current = window.setTimeout(run, 120)
  }, [applyStop])

  // ---- Map lifecycle: one MapLibre instance for the whole story ------------------
  useEffect(() => {
    if (!mapStarted || !mapNode.current) return
    let map: MapLibreMap
    setMapState('loading')
    try {
      const coarse = window.matchMedia('(pointer: coarse)').matches
      map = new maplibregl.Map({
        container: mapNode.current,
        style: mapStyle(reducedRef.current),
        bounds: [[77.204, 12.2683], [77.6921, 13.388]],
        // Strictly flat, north-up: no pitch, bearing or roll is ever possible.
        pitch: 0,
        bearing: 0,
        minPitch: 0,
        maxPitch: 0,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        rollEnabled: false,
        scrollZoom: false,
        boxZoom: false,
        cooperativeGestures: coarse,
        attributionControl: false,
        fadeDuration: reducedRef.current ? 0 : 200,
      })
    } catch {
      setMapState('error')
      return
    }
    map.touchZoomRotate.disableRotation()
    map.keyboard.disableRotation()
    mapRef.current = map
    loadedRef.current = {}
    map.addControl(new maplibregl.AttributionControl({ compact: true }), window.matchMedia(DESKTOP_QUERY).matches ? 'bottom-right' : 'bottom-left')
    if (import.meta.env.DEV) (window as unknown as { __arkStory?: unknown }).__arkStory = { map, active: () => activeRef.current, state: () => stateRef.current, padding: framePadding, frame: () => resolveFrame(stateRef.current.def, loadedRef.current) }

    // Safety net: if anything ever leaves the camera tilted or rotated, flatten it.
    const flatten = () => { if (map.getPitch() !== 0 || map.getBearing() !== 0) map.jumpTo({ pitch: 0, bearing: 0 }) }
    map.on('moveend', flatten)
    map.on('moveend', orientLabels)
    map.on('pitchend', flatten)
    map.on('rotateend', flatten)

    const markMoved = (event: { originalEvent?: unknown }) => {
      if (!event.originalEvent || userMovedRef.current) return
      userMovedRef.current = true
      setUserMoved(true)
    }
    map.on('dragstart', markMoved)
    map.on('zoomstart', markMoved)

    map.on('error', event => {
      // Tile failures are tolerated (the vector story layers still render).
      if ((event as { sourceId?: string }).sourceId?.startsWith('story-source-')) setLayerError(true)
    })

    map.on('load', () => {
      if (mapRef.current !== map) return
      addStoryLayers(map)
      // Keep the attribution collapsed to its (i) button so it never covers map labels.
      map.getContainer().querySelector('.maplibregl-ctrl-attrib.maplibregl-compact-show')?.classList.remove('maplibregl-compact-show')
      for (const [key, place] of Object.entries(PLACES) as Array<[PlaceKey, typeof PLACES[PlaceKey]]>) {
        // The marker element is the dot itself; the label is positioned east or west of it.
        const element = document.createElement('div')
        element.className = 'ark-place'
        const label = document.createElement('span')
        label.className = 'ark-place-label'
        label.textContent = place.name
        element.append(label)
        placeMarkers.current.set(key, new maplibregl.Marker({ element, anchor: 'center' }).setLngLat(place.at).addTo(map))
      }

      fetch(ELEVATION_MANIFEST)
        .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json() })
        .then(manifest => {
          const bounds = manifest?.raster?.bounds
          if (mapRef.current !== map || !Array.isArray(bounds) || bounds.length !== 4 || !bounds.every(Number.isFinite)) return
          const [west, south, east, north] = bounds as number[]
          map.addSource('story-elevation', { type: 'image', url: ELEVATION_IMAGE, coordinates: [[west, north], [east, north], [east, south], [west, south]] })
          map.addLayer({ id: 'story-elevation', type: 'raster', source: 'story-elevation', layout: { visibility: stateRef.current.elevation ? 'visible' : 'none' }, paint: { 'raster-opacity': 0.6, 'raster-resampling': 'linear' } }, 'story-sheds-active')
        })
        .catch(() => { /* Elevation context is optional; the rest of the story map is unaffected. */ })

      const clickable = ['story-evidence-point', 'story-drains-point', 'story-industrial-point', 'story-industrial-fill', 'story-water-active', 'story-water-context']
      const visibleTargets = () => clickable.filter(id => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none')
      map.on('click', event => {
        const targets = visibleTargets()
        if (!targets.length) return
        const hit = map.queryRenderedFeatures(event.point, { layers: targets })[0]
        if (!hit) return
        const content = featurePopup(hit.layer.id, (hit.properties ?? {}) as Props)
        if (content) openPopup(map, hit.geometry.type === 'Point' ? (hit.geometry.coordinates as [number, number]) : event.lngLat, content)
      })
      map.on('mousemove', event => {
        const targets = visibleTargets()
        map.getCanvas().style.cursor = targets.length && map.queryRenderedFeatures(event.point, { layers: targets }).length ? 'pointer' : ''
      })

      setMapState('ready')
      applyStop(map, activeRef.current, false)
    })

    let resizeTimer: number | null = null
    const resizeObserver = new ResizeObserver(() => {
      map.resize()
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null
        if (!userMovedRef.current && map.getLayer('story-rivers-line')) {
          const def = stateRef.current.def
          frameCamera(map, resolveFrame(def, loadedRef.current), def.maxZoom ?? 12.5, false)
        }
      }, 180)
    })
    resizeObserver.observe(mapNode.current)

    return () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer)
      if (cameraTimer.current !== null) { window.clearTimeout(cameraTimer.current); cameraTimer.current = null }
      resizeObserver.disconnect()
      popupRef.current?.remove()
      popupRef.current = null
      placeMarkers.current.clear()
      extraMarkers.current = []
      loadedRef.current = {}
      mapRef.current = null
      map.remove()
    }
  }, [mapStarted, applyStop, frameCamera, framePadding, openPopup, orientLabels])

  // ---- Story 1 reveal when the reader first arrives at the map ---------------------
  useEffect(() => {
    const node = sectionRef.current
    if (!node || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(entries => {
      const entry = entries[0]
      if (!entry?.isIntersecting || revealed.current) return
      const map = mapRef.current
      if (!map?.getLayer('story-rivers-line') || activeRef.current.chapter !== 0) return
      revealed.current = true
      if (!reducedRef.current) revealBasin(map)
    }, { threshold: 0.35 })
    observer.observe(node)
    return () => observer.disconnect()
  }, [mapState])

  // ---- Scroll-driven chapter and stop detection -----------------------------------
  useEffect(() => {
    let frame: number | null = null
    let lockTimer: number | null = null

    const update = () => {
      frame = null
      // While a chapter button scroll is in flight, the clicked chapter stays authoritative.
      if (performance.now() < navLock.current) {
        if (lockTimer === null) lockTimer = window.setTimeout(() => { lockTimer = null; schedule() }, Math.max(60, navLock.current - performance.now()))
        return
      }
      const line = triggerLine(stageRef.current)
      let next: Active = { chapter: 0, stop: 0 }
      CHAPTERS.forEach((chapter, chapterIndex) => {
        chapter.stops.forEach((_stop, stopIndex) => {
          const element = stepRefs.current.get(`${chapterIndex}:${stopIndex}`)
          if (element && element.getBoundingClientRect().top <= line) next = { chapter: chapterIndex, stop: stopIndex }
        })
      })
      activate(next, false)
    }

    const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(update) }
    const release = () => { if (navLock.current) { navLock.current = 0; schedule() } }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('scrollend', release)
    window.addEventListener('resize', schedule)
    update()
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('scrollend', release)
      window.removeEventListener('resize', schedule)
      if (frame !== null) window.cancelAnimationFrame(frame)
      if (lockTimer !== null) window.clearTimeout(lockTimer)
    }
  }, [activate])

  // ---- Lightbox ------------------------------------------------------------------
  useEffect(() => {
    if (!gallery) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setGallery(null)
      if (event.key === 'ArrowRight') setGallery(current => current && { ...current, index: (current.index + 1) % galleries[current.chapter].length })
      if (event.key === 'ArrowLeft') setGallery(current => current && { ...current, index: (current.index - 1 + galleries[current.chapter].length) % galleries[current.chapter].length })
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [gallery !== null, galleries])

  useEffect(() => {
    if (!gallery && lastFocus.current) { lastFocus.current.focus({ preventScroll: true }); lastFocus.current = null }
  }, [gallery])

  const openGallery = (chapter: number, item?: Photo) => {
    lastFocus.current = document.activeElement as HTMLElement | null
    const index = item ? Math.max(0, galleries[chapter].findIndex(p => p.src === item.src)) : 0
    setGallery({ chapter, index })
  }

  // ---- Map actions -----------------------------------------------------------------
  const takeManualControl = () => {
    userMovedRef.current = true
    setUserMoved(true)
  }

  const recentre = () => {
    const map = mapRef.current
    if (!map) return
    userMovedRef.current = false
    setUserMoved(false)
    applyStop(map, activeRef.current, true)
  }

  const zoomBy = (delta: number) => {
    const map = mapRef.current
    if (!map) return
    takeManualControl()
    map.easeTo({ zoom: map.getZoom() + delta, bearing: 0, pitch: 0, duration: reducedRef.current ? 0 : 320 })
  }

  const showStop = (chapter: number, stop: number) => {
    const map = mapRef.current
    if (!map) return
    applyStop(map, { chapter, stop }, true)
    if (chapter !== activeRef.current.chapter || stop !== activeRef.current.stop) takeManualControl()
  }

  const focusEvidence = (ids: number[], openFirst: boolean) => {
    const map = mapRef.current
    const data = loadedRef.current.evidence
    if (!map || !data) return
    const features = data.features.filter(feature => ids.includes(Number(feature.id)))
    const box = featuresBox(features)
    if (!box) return
    takeManualControl()
    // Show the selected records alongside whatever the current stop already shows.
    map.setLayoutProperty('story-evidence-point', 'visibility', 'visible')
    map.setFilter('story-evidence-point', ['any', evidenceFilter(stateRef.current.evidence), ['in', ['id'], ['literal', ids]]] as Filter)
    map.setFilter('story-evidence-selected', ['in', ['id'], ['literal', ids]])
    // A single selected site sits low in the open map so its popup has room above it.
    const single = features.length === 1
    frameCamera(map, single ? pointBox([box[0], box[1]], 2.5) : box, 13, true, single && openFirst ? Math.round(map.getCanvas().clientHeight * 0.2) : 0)
    const first = features[0]
    if (openFirst && first?.geometry.type === 'Point') {
      const content = featurePopup('story-evidence-point', first.properties ?? {})
      if (content) openPopup(map, first.geometry.coordinates as [number, number], content)
    }
  }

  const focusDrains = () => {
    const map = mapRef.current
    const data = loadedRef.current.drains
    if (!map) return
    takeManualControl()
    map.setLayoutProperty('story-drains-point', 'visibility', 'visible')
    frameCamera(map, (data && featuresBox(data.features)) || [77.276883, 12.544858, 77.428, 12.731908], 12.5, true)
  }

  /** Chapter navigation: activates the chapter immediately and scrolls to the same reading position scrolling would use. */
  const goToChapter = (index: number) => {
    const card = document.getElementById(`ark-chapter-${index + 1}`)
    if (!card) return
    const stage = stageRef.current
    const line = triggerLine(stage)
    const desktop = window.matchMedia(DESKTOP_QUERY).matches
    const minTop = desktop ? window.innerHeight * 0.12 : (stage?.getBoundingClientRect().height ?? 0) + 10
    const cardBox = card.getBoundingClientRect()
    const firstStop = stepRefs.current.get(`${index}:1`)
    const offset = firstStop ? firstStop.getBoundingClientRect().top - cardBox.top : Infinity
    // As high as possible, while the card is past the reading line and its next stop is not.
    const top = Math.min(line - 8, Math.max(minTop, line - offset + 24))
    navLock.current = performance.now() + (reducedRef.current ? 200 : 1800)
    activate({ chapter: index, stop: 0 }, true)
    window.scrollTo({ top: window.scrollY + cardBox.top - top, behavior: reducedRef.current ? 'auto' : 'smooth' })
    card.focus({ preventScroll: true })
  }

  // ---- Render ----------------------------------------------------------------------
  const chapter = CHAPTERS[active.chapter]
  const currentStop = chapter.stops[active.stop]
  const progress = (active.chapter + (active.stop + 1) / chapter.stops.length) / CHAPTERS.length
  const legend = legendFor(storyMapState(active))
  const galleryPhotos = gallery ? galleries[gallery.chapter] : []
  const galleryPhoto = gallery ? galleryPhotos[gallery.index] : null

  const registerStep = (key: string) => (element: HTMLElement | null) => {
    if (element) stepRefs.current.set(key, element)
    else stepRefs.current.delete(key)
  }

  const stopFigure = (chapterIndex: number, stopIndex: number, stop: Stop) => {
    if (!stop.photos) return null
    const [primary, inset] = stop.photos
    const isActive = active.chapter === chapterIndex && active.stop === stopIndex
    return (
      <figure className={`ark-stop-figure${isActive ? ' is-active' : ''}${inset ? ' has-inset' : ''}`}>
        <div className="ark-stop-media">
          <button type="button" className="ark-stop-photo" onClick={() => openGallery(chapterIndex, primary)} aria-label={`Enlarge photograph: ${primary.caption}`}>
            <img src={primary.src} alt={primary.alt} loading="lazy" decoding="async" onLoad={fadeIn} onError={fadeIn} />
            <span className="ark-photo-zoom" aria-hidden="true"><Maximize2 size={14} /></span>
          </button>
          {inset && (
            <button type="button" className="ark-stop-inset" onClick={() => openGallery(chapterIndex, inset)} aria-label={`Enlarge photograph: ${inset.caption}`}>
              <img src={inset.src} alt={inset.alt} loading="lazy" decoding="async" onLoad={fadeIn} onError={fadeIn} />
            </button>
          )}
        </div>
        <figcaption>
          <button type="button" className="ark-stop-locate" onClick={() => showStop(chapterIndex, stopIndex)} aria-label={`Show ${stop.title} on the map`}>
            <MapPin size={13} aria-hidden="true" />
            {isActive ? 'On the map now' : 'Show on map'} · {stop.title}
          </button>
          <span>{primary.caption}{inset ? ` Inset: ${inset.caption}` : ''}</span>
        </figcaption>
      </figure>
    )
  }

  return (
    <>
      <section ref={introRef} id="ark-river" tabIndex={-1} className="ark-story-intro" aria-labelledby="ark-story-title">
        <div className="ark-container ark-story-intro-inner">
          <div className="ark-section-marker ark-story-intro-marker">
            <span>01</span>
            <p className="ark-eyebrow">THE RIVER, IN CONTEXT</p>
            <span className="ark-marker-line" />
          </div>
          <div className="ark-story-intro-grid">
            <h2 id="ark-story-title" className="ark-story-intro-title">The Story of <em>Arkavathi</em></h2>
            <div className="ark-story-intro-copy">
              <p className="ark-story-intro-lead">
                From the hills of Nandi to the waters of the Cauvery — a journey through landscapes,
                tributaries, reservoirs and generations of human connection.
              </p>
              <p className="ark-story-intro-sub">
                Eight chapters follow the river on a live map of the basin, built from the project’s own GIS layers.
              </p>
            </div>
          </div>
          <dl className="ark-story-intro-facts">
            {INTRO_FACTS.map(fact => <div key={fact.value}><dt>{fact.value}</dt><dd>{fact.label}</dd></div>)}
          </dl>
          <a className="ark-story-intro-scroll" href="#ark-chapter-1" onClick={event => { event.preventDefault(); goToChapter(0) }}>
            <span className="ark-story-intro-scroll-line" aria-hidden="true" />
            <span>Scroll to follow the river</span>
            <ArrowDown size={16} aria-hidden="true" />
          </a>
          <p className="ark-story-intro-hint">The map moves with each chapter. Drag, zoom or recentre it at any time.</p>
        </div>
      </section>

      <section ref={sectionRef} className="ark-immersive" aria-labelledby="ark-chapters-title" data-map-state={mapState}>
        <h2 id="ark-chapters-title" className="ark-sr-only">The Story of Arkavathi in eight chapters</h2>

        <div ref={stageRef} className="ark-immersive-stage">
          <div ref={mapNode} className="ark-immersive-map" role="region" aria-label="Interactive top-down map of the Arkavathi basin" />

          {mapState !== 'ready' && (
            <div className="ark-map-status" role="status">
              {mapState === 'error' ? (
                <>
                  <img src="/project/arkavathi-study-area-map.png" alt="Arkavathi river system study-area map" loading="lazy" />
                  <span>The interactive map is not available in this browser. Showing the project study-area map instead.</span>
                </>
              ) : <span>Loading the river map…</span>}
            </div>
          )}

          <div ref={hudRef} className="ark-hud" aria-live="polite">
            <span className="ark-hud-kicker">Chapter {pad2(active.chapter + 1)} / {pad2(CHAPTERS.length)} · {chapter.eyebrow}</span>
            <strong>{currentStop.title}</strong>
            <span className="ark-hud-note">{currentStop.note}</span>
            {layerError && <span className="ark-hud-warn">Some map layers could not be loaded.</span>}
          </div>

          <ul ref={legendRef} className="ark-legend" aria-label="Map legend">
            {legend.map(item => (
              <li key={`${item.kind}-${item.label}`}>
                <i className={`ark-swatch ark-swatch-${item.kind}`} style={{ ['--sw' as string]: item.color }} aria-hidden="true" />
                {item.label}
              </li>
            ))}
          </ul>

          <nav ref={progressRef} className="ark-progress" aria-label="Story chapters">
            <span className="ark-progress-track" aria-hidden="true"><span style={{ height: `${progress * 100}%` }} /></span>
            {CHAPTERS.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                data-label={item.eyebrow}
                className={index === active.chapter ? 'is-active' : index < active.chapter ? 'is-done' : ''}
                aria-label={`Chapter ${index + 1}: ${item.eyebrow}`}
                aria-current={index === active.chapter ? 'step' : undefined}
                onClick={() => goToChapter(index)}
              >
                {pad2(index + 1)}
              </button>
            ))}
          </nav>
          <div className="ark-progress-bar" aria-hidden="true"><span style={{ width: `${progress * 100}%` }} /></div>

          <div ref={toolsRef} className="ark-tools" role="group" aria-label="Map controls">
            <button type="button" onClick={() => zoomBy(0.8)} aria-label="Zoom in"><Plus size={17} aria-hidden="true" /></button>
            <button type="button" onClick={() => zoomBy(-0.8)} aria-label="Zoom out"><Minus size={17} aria-hidden="true" /></button>
            <button type="button" className={userMoved ? 'is-attention' : ''} onClick={recentre} aria-label="Return to the story view for this chapter" title="Return to the story view">
              <LocateFixed size={17} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="ark-immersive-flow">
          <div className="ark-immersive-rail" ref={railRef}>
            {CHAPTERS.map((item, chapterIndex) => {
              const stopAt = new Map(item.stops.map((stop, stopIndex) => [stop.at, stopIndex]))
              const photos = galleries[chapterIndex]
              const isActive = chapterIndex === active.chapter
              return (
                <article
                  key={item.eyebrow}
                  id={`ark-chapter-${chapterIndex + 1}`}
                  tabIndex={-1}
                  ref={registerStep(`${chapterIndex}:0`)}
                  className={`ark-card${isActive ? ' is-active' : ''}`}
                  aria-labelledby={`ark-chapter-title-${chapterIndex + 1}`}
                >
                  <span className="ark-card-index" aria-hidden="true">{pad2(chapterIndex + 1)}</span>
                  <header className="ark-card-head">
                    <p className="ark-card-eyebrow">
                      <span className="ark-card-num">Chapter {pad2(chapterIndex + 1)}</span>
                      <span className="ark-card-rule" aria-hidden="true" />
                      {item.eyebrow}
                    </p>
                    <h3 id={`ark-chapter-title-${chapterIndex + 1}`}>{item.lead} <em>{item.accent}</em></h3>
                    {item.subline && <p className="ark-card-subline">{item.subline}</p>}
                    {item.quote && <blockquote className="ark-card-quote"><p>“{item.quote}”</p></blockquote>}
                  </header>

                  {stopFigure(chapterIndex, 0, item.stops[0])}

                  <div className="ark-card-body">
                    {item.paragraphs.map((paragraph, paragraphIndex) => {
                      const stopIndex = paragraphIndex > 0 ? stopAt.get(paragraphIndex) : undefined
                      return (
                        <Fragment key={paragraphIndex}>
                          <p
                            ref={stopIndex !== undefined ? registerStep(`${chapterIndex}:${stopIndex}`) : undefined}
                            className={stopIndex !== undefined ? `ark-stop-marker${isActive && active.stop === stopIndex ? ' is-current' : ''}` : undefined}
                          >
                            <Rich value={paragraph} uid={`${chapterIndex}-${paragraphIndex}`} />
                          </p>
                          {stopIndex !== undefined && stopFigure(chapterIndex, stopIndex, item.stops[stopIndex])}
                        </Fragment>
                      )
                    })}
                  </div>

                  {item.closingQuote && <blockquote className="ark-card-quote is-closing"><p>“{item.closingQuote}”</p></blockquote>}

                  <aside className="ark-why" aria-label="Why this matters">
                    <span className="ark-why-label">Why this matters</span>
                    <p>{item.why}</p>
                  </aside>

                  {item.findings === 'drains' && <DrainsPanel drains={drains} failed={findingsError} onShow={focusDrains} />}
                  {item.findings === 'evidence' && <EvidencePanel evidence={evidence} failed={findingsError} onFocus={focusEvidence} />}

                  {photos.length > 0 && (
                    <footer className="ark-card-foot">
                      <div className="ark-card-thumbs">
                        {photos.slice(0, 5).map(photoItem => (
                          <button key={photoItem.src} type="button" onClick={() => openGallery(chapterIndex, photoItem)} aria-label={`Open photograph: ${photoItem.caption}`}>
                            <img src={photoItem.src} alt="" loading="lazy" decoding="async" />
                          </button>
                        ))}
                      </div>
                      <button type="button" className="ark-card-gallery" onClick={() => openGallery(chapterIndex)}>
                        <Images size={15} aria-hidden="true" />
                        Chapter gallery
                        <span>{photos.length}</span>
                      </button>
                    </footer>
                  )}
                </article>
              )
            })}

            <p className="ark-immersive-note">
              Map: project GIS datasets on OpenStreetMap and Esri imagery. Photographs are supplied project references;
              captions follow the supplied image labels, and locations and dates have not been independently verified.
            </p>
          </div>
        </div>
      </section>

      {gallery && galleryPhoto && createPortal(
        <div className="ark-lightbox" role="dialog" aria-modal="true" aria-label="Chapter photograph gallery">
          <button type="button" className="ark-lightbox-backdrop" onClick={() => setGallery(null)} aria-label="Close gallery" tabIndex={-1} />
          <div className="ark-lightbox-panel">
            <div className="ark-lightbox-head">
              <div>
                <span>Chapter {pad2(gallery.chapter + 1)} · {CHAPTERS[gallery.chapter].eyebrow}</span>
                <strong>{gallery.index + 1} / {galleryPhotos.length}</strong>
              </div>
              <button ref={closeButton} type="button" className="ark-lightbox-close" onClick={() => setGallery(null)} aria-label="Close gallery">
                <X size={19} aria-hidden="true" />
              </button>
            </div>
            <figure className="ark-lightbox-figure">
              <img key={galleryPhoto.src} src={galleryPhoto.src} alt={galleryPhoto.alt} decoding="async" onLoad={fadeIn} onError={fadeIn} />
              <figcaption>{galleryPhoto.caption}</figcaption>
            </figure>
            <div className="ark-lightbox-controls">
              <button type="button" onClick={() => setGallery(current => current && { ...current, index: (current.index - 1 + galleryPhotos.length) % galleryPhotos.length })}>
                <ArrowLeft size={17} aria-hidden="true" /> Previous
              </button>
              <button type="button" onClick={() => setGallery(current => current && { ...current, index: (current.index + 1) % galleryPhotos.length })}>
                Next <ArrowRight size={17} aria-hidden="true" />
              </button>
            </div>
            <div className="ark-lightbox-thumbs" aria-label="Photographs in this chapter">
              {galleryPhotos.map((item, index) => (
                <button
                  key={item.src}
                  type="button"
                  className={index === gallery.index ? 'is-active' : ''}
                  onClick={() => setGallery(current => current && { ...current, index })}
                  aria-label={`Show photograph ${index + 1}: ${item.caption}`}
                  aria-current={index === gallery.index ? 'true' : undefined}
                >
                  <img src={item.src} alt="" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
            <p className="ark-lightbox-note">
              Supplied project reference photographs. Captions follow the supplied image labels; locations and dates are not independently verified.
            </p>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Documented findings panels (dataset records, kept visually distinct from narrative)
// ---------------------------------------------------------------------------

function contributorGroup(properties: Props): string {
  const contributor = text(properties.contributor)
  if (contributor.startsWith('Arkavathi Horata Samithi')) return 'Arkavathi Horata Samithi'
  if (contributor.startsWith('RTI Application')) return 'RTI applications · Madhuri Mandava'
  return contributor
}

function EvidencePanel({ evidence, failed, onFocus }: { evidence: Feature[] | null; failed: boolean; onFocus: (ids: number[], openFirst: boolean) => void }) {
  const sites = useMemo(() => (evidence ?? []).filter(f => f.properties?._group === 'paani').sort((a, b) => String(a.properties?._site).localeCompare(String(b.properties?._site))), [evidence])
  const groups = useMemo(() => {
    const map = new Map<string, Feature[]>()
    for (const feature of evidence ?? []) {
      if (feature.properties?._group === 'paani') continue
      const key = contributorGroup(feature.properties ?? {})
      map.set(key, [...(map.get(key) ?? []), feature])
    }
    return [...map.entries()]
  }, [evidence])
  const [siteId, setSiteId] = useState<number | null>(null)
  const selected = sites.find(f => Number(f.id) === siteId) ?? sites[0]

  return (
    <section className="ark-findings" aria-labelledby="ark-findings-evidence">
      <p className="ark-findings-kicker"><FileText size={14} aria-hidden="true" /> Documented findings · project evidence dataset</p>
      <h4 id="ark-findings-evidence">Paani.Earth × ICCW (IIT Madras) sampling, February–March 2024</h4>
      {failed && <p className="ark-findings-note">The documented findings could not be loaded.</p>}
      {!failed && !evidence && <p className="ark-findings-note">Loading documented findings…</p>}
      {selected && (
        <>
          <div className="ark-findings-sites" role="group" aria-label="Paani.Earth sampling sites">
            {sites.map(feature => (
              <button
                key={String(feature.id)}
                type="button"
                className={feature === selected ? 'is-active' : ''}
                aria-pressed={feature === selected}
                onClick={() => { setSiteId(Number(feature.id)); onFocus([Number(feature.id)], true) }}
              >
                {String(feature.properties?._site)}
              </button>
            ))}
          </div>
          <div className="ark-findings-record">
            <strong>{text(selected.properties?.locationName)}</strong>
            <p><Rich value={withTerms(text(selected.properties?.findings))} uid={`site-${String(selected.id)}`} /></p>
            <dl>
              <div><dt>Period</dt><dd>{text(selected.properties?.period)}</dd></div>
              <div><dt>Analysis</dt><dd>{text(selected.properties?.evidenceType)}</dd></div>
            </dl>
            <div className="ark-findings-actions">
              <button type="button" onClick={() => onFocus([Number(selected.id)], true)}><MapPin size={13} aria-hidden="true" /> Show on map</button>
              {safeUrl(selected.properties?.evidenceUrl) && (
                <a href={safeUrl(selected.properties?.evidenceUrl) as string} target="_blank" rel="noopener noreferrer">Site report <ArrowUpRight size={13} aria-hidden="true" /></a>
              )}
            </div>
          </div>
          <h4 className="ark-findings-subhead">Other documented studies on the map</h4>
          <ul className="ark-findings-groups">
            {groups.map(([name, features]) => {
              const periods = [...new Set(features.map(f => text(f.properties?.period)))]
              return (
                <li key={name}>
                  <button type="button" onClick={() => onFocus(features.map(f => Number(f.id)), features.length === 1)}>
                    <span>{name}</span>
                    <small>{features.length} location{features.length === 1 ? '' : 's'} · {periods.length === 1 ? periods[0] : 'several study periods'}</small>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="ark-findings-note">Findings are reproduced from the project evidence dataset, with each source document linked on the map. They have not been independently re-verified here.</p>
        </>
      )}
    </section>
  )
}

function DrainsPanel({ drains, failed, onShow }: { drains: Feature[] | null; failed: boolean; onShow: () => void }) {
  const values = (drains ?? []).map(f => Number(f.properties?.bodDec2020)).filter(Number.isFinite)
  const towns = ['Ramanagara', 'Kanakapura'].map(town => {
    const items = (drains ?? []).filter(f => f.properties?._town === town)
    const bod = items.map(f => Number(f.properties?.bodDec2020)).filter(Number.isFinite)
    return { town, count: items.length, min: Math.min(...bod), max: Math.max(...bod) }
  })
  const stretch = text(drains?.[0]?.properties?.stretch)
  return (
    <section className="ark-findings" aria-labelledby="ark-findings-drains">
      <p className="ark-findings-kicker"><FileText size={14} aria-hidden="true" /> Documented findings · polluting-drain records</p>
      <h4 id="ark-findings-drains">Polluting drains recorded along the Arkavathi, December 2020</h4>
      {failed && <p className="ark-findings-note">The drain records could not be loaded.</p>}
      {!failed && !drains && <p className="ark-findings-note">Loading drain records…</p>}
      {drains && values.length > 0 && (
        <>
          <dl className="ark-findings-stats">
            <div><dt>Drains recorded</dt><dd>{drains.length}</dd></div>
            <div><dt><Rich value="{{bod:BOD}} range" uid="drains-bod" /></dt><dd>{Math.min(...values)}–{Math.max(...values)} mg/L</dd></div>
            {stretch && <div className="is-wide"><dt>Listed stretch</dt><dd>{stretch}</dd></div>}
          </dl>
          <ul className="ark-findings-groups">
            {towns.filter(item => item.count > 0).map(item => (
              <li key={item.town}><span className="ark-findings-static"><span>{item.town}</span><small>{item.count} drains · BOD {item.min}–{item.max} mg/L</small></span></li>
            ))}
          </ul>
          <details className="ark-findings-table">
            <summary>List all {drains.length} drains</summary>
            <table>
              <thead><tr><th scope="col">Drain</th><th scope="col">Location</th><th scope="col">BOD (mg/L)</th></tr></thead>
              <tbody>
                {drains.map(f => (
                  <tr key={String(f.id)}><td>{text(f.properties?.name)}</td><td>{text(f.properties?.description)}</td><td>{text(f.properties?.bodDec2020)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
          <div className="ark-findings-actions">
            <button type="button" onClick={onShow}><MapPin size={13} aria-hidden="true" /> Show the drains on the map</button>
          </div>
          <p className="ark-findings-note">Values as recorded in the project polluting-drain dataset (BOD, December 2020).</p>
        </>
      )}
    </section>
  )
}
