import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import maplibregl, { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { ChevronDown, ChevronRight, Database, Layers3, LocateFixed, Pause, PersonStanding, Play, RotateCcw, Search, Upload, X } from 'lucide-react'
import { api, type NakshaSurveyDataset, type NakshaSurveyGeoJson } from '../lib/api'
import { parseSurveyFile, type SurveyDataset, type SurveyTrack } from '../lib/surveyRouteParser'
import { PLAYBACK_SPEEDS, formatClock, useSurveyPlaybackEngine, type PlaybackSample, type SurveyPlaybackEngine } from '../lib/surveyPlayback'
import { StreetViewPanel, type PanoramaView } from './StreetViewPanel'
import './arkavathi-gis-atlas.css'

type Geometry = { type: string; coordinates: unknown }
type AtlasFeature = { type: 'Feature'; id?: string | number; properties?: Record<string, unknown> | null; geometry: Geometry | null }
type Collection = { type: 'FeatureCollection'; features: AtlasFeature[] }
type Kind = 'fill' | 'line' | 'point' | 'mixed' | 'raster'
type Group = 'Basin' | 'River System' | 'Pollution & Evidence' | 'Environmental Pressure' | 'Planning & Administration' | 'Verified Survey'
type AtlasLayer = { key: string; name: string; group: Group; file?: string; kind: Kind; color: string; defaultOn?: boolean; description?: string }
type Selection = { layer: AtlasLayer; feature: AtlasFeature }
type NakshaSelection = { dataset: NakshaSurveyDataset; feature: AtlasFeature }
type ElevationClass = { index: number; label: string; min: number; max: number; color: string }
type ElevationManifest = {
  dataset_id: string
  title: string
  source: { file_name: string; sha256?: string }
  raster: { crs: string; bounds: number[]; vertical_units: string; statistics: Record<string, number>; vertical_units_note?: string }
  classification: { method: string; units: string; range: number[]; class_width: number; classes: ElevationClass[]; coverage_note?: string }
}
type StreetStage = 'off' | 'selecting' | 'viewing'
type StreetPoint = { lat: number; lng: number }
type StreetSnapshot = {
  center: [number, number]
  zoom: number
  basemap: 'street' | 'satellite'
  visible: Record<string, boolean>
  nakshaVisible: Record<string, boolean>
  routeVisible: boolean
  surveyPointsVisible: boolean
  panelOpen: boolean
  nakshaOpen: boolean
}

// Street View provider preference follows the same env key the panel itself uses.
const HAS_GOOGLE_MAPS_KEY = ((import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '') as string).trim().length > 0

const NAKSHA_GROUPS: NakshaSurveyDataset['group'][] = ['Hydrology', 'Project & Infrastructure', 'Land & Context']
const NAKSHA_COLORS: Record<string, string> = {
  'arkavathi-boundary': '#0d615d', 'arkavathi-chainage': '#cb7b37', cauvery: '#316b9c',
  'kumudavthi-boundary': '#408a75', 'kumudavthi-chainage': '#d49454',
  'suvarnamuthi-boundary': '#5d977a', 'suvarnamuthi-chainage': '#bd9251',
  'vrishabavathi-boundary': '#367b7c', 'vrishabavathi-chainage': '#c68f5a',
  'river-stream': '#1e87a6', reservoirs: '#328aa9', road: '#9b7451',
  industrial: '#8d665a', 'hydro-power-plant': '#8662a8', temple: '#ba8052',
  forest: '#43805c', 'tamil-nadu': '#a18c70',
}
const nakshaSourceId = (id: string) => `naksha-source-${id}`
const nakshaLayerId = (id: string, kind: string) => `naksha-${id}-${kind}`

const DATA_PATH = '/gis/arkavathi/'
const EMPTY: Collection = { type: 'FeatureCollection', features: [] }

// ---------------------------------------------------------------------------
// "Arkavathi River Data" panel - display order and labels only.
// Every row keeps its real dataset id (NakshaTech catalogue) or atlas layer
// key; nothing is renamed server side and no id is invented.
// ---------------------------------------------------------------------------
type PanelLeaf = { kind: 'leaf'; id: string; label: string; atlasKey?: string; swatch?: string }
type PanelGroup = { kind: 'group'; id: string; label: string; children: PanelLeaf[] }
type PanelSection = { kind: 'section'; label: string; children: PanelLeaf[] }
type PanelRow = PanelLeaf | PanelGroup | PanelSection

const PANEL_ROWS: PanelRow[] = [
  { kind: 'leaf', id: 'arkavathi-boundary', label: 'Arkavathi Boundary' },
  {
    kind: 'group', id: 'sub-catchments', label: 'Sub-Catchments',
    children: [
      { kind: 'leaf', id: 'suvarnamuthi-boundary', label: 'Suvarnamuthi Catchment' },
      { kind: 'leaf', id: 'vrishabavathi-boundary', label: 'Vrishabavathi Catchment' },
      { kind: 'leaf', id: 'kumudavthi-boundary', label: 'Kumudavthi Catchment' },
    ],
  },
  {
    kind: 'group', id: 'arkavathi-chainages', label: 'Arkavathi Chainages',
    children: [
      { kind: 'leaf', id: 'arkavathi-chainage', label: 'Arkavathi Chainage' },
      { kind: 'leaf', id: 'suvarnamuthi-chainage', label: 'Suvarnamuthi Chainage' },
      { kind: 'leaf', id: 'kumudavthi-chainage', label: 'Kumudavthi Chainage' },
      { kind: 'leaf', id: 'vrishabavathi-chainage', label: 'Vrishabavathi Chainage' },
    ],
  },
  { kind: 'leaf', id: 'river-stream', label: 'River System' },
  { kind: 'leaf', id: 'reservoirs', label: 'Reservoirs' },
  { kind: 'leaf', id: 'drainage', label: 'Drainage Network', atlasKey: 'drainage', swatch: '#0e7f96' },
  { kind: 'leaf', id: 'elevation', label: 'Elevation Bands', atlasKey: 'elevation', swatch: '#b8a378' },
  { kind: 'leaf', id: 'road', label: 'Roads' },
  { kind: 'leaf', id: 'industrial', label: 'Industrial Areas' },
  { kind: 'leaf', id: 'hydro-power-plant', label: 'Hydro Power Plant' },
  { kind: 'leaf', id: 'temple', label: 'Temple' },
  { kind: 'leaf', id: 'forest', label: 'Forest' },
  { kind: 'section', label: 'Land & Context', children: [{ kind: 'leaf', id: 'tamil-nadu', label: 'Tamil Nadu' }] },
  // Cauvery is a real catalogue dataset whose placement was not part of the
  // requested order. Its id, geometry and access are untouched; it stays in a
  // clearly separated trailing group instead of being deleted or merged.
  { kind: 'section', label: 'Basin Context', children: [{ kind: 'leaf', id: 'cauvery', label: 'Cauvery' }] },
]
// Atlas layers owned exclusively by the data panel (never listed in the
// River Layer Explorer while the data panel is available to the user).
const DATA_PANEL_ATLAS_KEYS = PANEL_ROWS.flatMap(row =>
  row.kind === 'leaf' ? (row.atlasKey ? [row.atlasKey] : [])
    : row.children.filter(child => child.atlasKey).map(child => child.atlasKey as string))

const GROUPS: Group[] = ['Basin', 'River System', 'Pollution & Evidence', 'Environmental Pressure', 'Planning & Administration', 'Verified Survey']
// Thematic layers: every entry starts HIDDEN. The map loads with the normal
// basemap only and a thematic overlay appears exclusively when its checkbox is
// selected, so renderer visibility and checkbox state can never disagree.
const LAYERS: AtlasLayer[] = [
  { key: 'boundary', name: 'Basin Boundary', group: 'Basin', file: 'boundary.geojson', kind: 'fill', color: '#234e3d' },
  { key: 'sheds', name: 'Sub-Hydrosheds', group: 'Basin', file: 'sub-hydrosheds.geojson', kind: 'fill', color: '#6e9b79' },
  // Elevation Bands is now a georeferenced raster overlay generated from the
  // supplied Arkavathi_Dem1.tif (see scripts/prepare_arkavathi_gis_data.py).
  { key: 'elevation', name: 'Elevation Bands', group: 'Basin', kind: 'raster', color: '#b8a378' },
  { key: 'rivers', name: 'Rivers', group: 'River System', file: 'rivers.geojson', kind: 'line', color: '#147b91' },
  // Drainage Network is re-pointed at the supplied Drainage_Network.shp export.
  // The previous renderer (drainage.geojson) is preserved on disk but unused.
  { key: 'drainage', name: 'Drainage Network', group: 'River System', file: 'drainage-network.geojson', kind: 'line', color: '#0e7f96' },
  { key: 'major-water', name: 'Major Waterbodies', group: 'River System', file: 'waterbodies-major.geojson', kind: 'fill', color: '#6db2bd' },
  { key: 'minor-water', name: 'Minor Waterbodies', group: 'River System', file: 'waterbodies-minor.geojson', kind: 'fill', color: '#a0cbd0' },
  { key: 'prs-drains', name: 'Polluting Drains', group: 'Pollution & Evidence', file: 'prs-drains.geojson', kind: 'point', color: '#ad5d43' },
  { key: 'evidence', name: 'Evidence Points', group: 'Pollution & Evidence', file: 'evidence-points.geojson', kind: 'point', color: '#a17438' },
  { key: 'industrial', name: 'Industrial Areas', group: 'Environmental Pressure', file: 'pressure-industrial.geojson', kind: 'mixed', color: '#8b6852' },
  { key: 'quarries', name: 'Quarries', group: 'Environmental Pressure', file: 'pressure-quarries.geojson', kind: 'fill', color: '#927d6f' },
  { key: 'waste', name: 'Waste Facilities', group: 'Environmental Pressure', file: 'pressure-waste.geojson', kind: 'point', color: '#a54945' },
  { key: 'districts', name: 'Administrative Districts', group: 'Planning & Administration', file: 'admin-district.geojson', kind: 'fill', color: '#9b9278' },
  { key: 'command', name: 'Command Areas', group: 'Planning & Administration', file: 'command-areas.geojson', kind: 'fill', color: '#a09061' },
  { key: 'gaps', name: 'Gap Areas', group: 'Planning & Administration', file: 'gaps.geojson', kind: 'fill', color: '#b17b53' },
  { key: 'flight-tracks', name: 'Verified Flight Tracks', group: 'Verified Survey', kind: 'line', color: '#926ead' },
  { key: 'flight-points', name: 'Telemetry Points', group: 'Verified Survey', kind: 'point', color: '#926ead' },
]
const BY_KEY = Object.fromEntries(LAYERS.map(layer => [layer.key, layer])) as Record<string, AtlasLayer>
const ELEVATION_MANIFEST_PATH = `${DATA_PATH}elevation-dem1.manifest.json`
const ELEVATION_IMAGE_PATH = `${DATA_PATH}elevation-dem1.png`
const INITIAL_VISIBLE = Object.fromEntries(LAYERS.map(layer => [layer.key, Boolean(layer.defaultOn)])) as Record<string, boolean>
const FIELDS: Record<string, string[]> = {
  rivers: ['name', 'riverId'], sheds: ['name', 'shedId'], 'prs-drains': ['name', 'kind', 'description', 'bodDec2020', 'stretch'],
  evidence: ['locationName', 'period', 'contributor', 'evidenceType', 'findings', 'shedId'],
  'major-water': ['name', 'custodian', 'district', 'tankId', 'shedId'], 'minor-water': ['shedId'],
  command: ['name', 'areaHa', 'type', 'shedId'], elevation: ['band', 'min_m', 'max_m'],
  gaps: ['name', 'gapUnit', 'severity'], industrial: ['agency', 'kind', 'cetp', 'cetpNote'],
  quarries: ['kind', 'shedId'], waste: ['name', 'details', 'kind', 'shedId'], districts: ['name', 'level'],
  'flight-tracks': ['id', 'day', 'flight_id', 'clip'], 'flight-points': ['flight_id', 'day', 'clip', 'time', 'rel_alt_m', 'abs_alt_m'],
}

const BASE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors', maxzoom: 19 },
    satellite: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Tiles © Esri', maxzoom: 18 },
  },
  layers: [
    { id: 'atlas-base-street', type: 'raster', source: 'osm' },
    { id: 'atlas-base-satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
  ],
}

function sourceId(key: string) { return `atlas-source-${key}` }
function layerIds(layer: AtlasLayer) {
  if (layer.kind === 'raster') return []
  return layer.kind === 'fill' ? [`atlas-${layer.key}-fill`, `atlas-${layer.key}-outline`]
    : layer.kind === 'mixed' ? [`atlas-${layer.key}-fill`, `atlas-${layer.key}-outline`, `atlas-${layer.key}-point`]
    : [`atlas-${layer.key}-${layer.kind}`]
}
function validPair(value: unknown): value is number[] {
  return Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1])
}
function validGeometry(geometry: Geometry | null): boolean {
  if (!geometry) return false
  const c = geometry.coordinates
  if (geometry.type === 'Point') return validPair(c)
  if (geometry.type === 'LineString') return Array.isArray(c) && c.filter(validPair).length >= 2
  if (geometry.type === 'MultiPoint') return Array.isArray(c) && c.some(validPair)
  if (geometry.type === 'Polygon') return Array.isArray(c) && c.some(ring => Array.isArray(ring) && ring.filter(validPair).length >= 4)
  if (geometry.type === 'MultiLineString') return Array.isArray(c) && c.some(line => Array.isArray(line) && line.filter(validPair).length >= 2)
  if (geometry.type === 'MultiPolygon') return Array.isArray(c) && c.some(poly => Array.isArray(poly) && poly.some(ring => Array.isArray(ring) && ring.filter(validPair).length >= 4))
  return false
}
function cleanedCollection(value: unknown): Collection {
  const input = value as Partial<Collection> | null
  if (input?.type !== 'FeatureCollection' || !Array.isArray(input.features)) throw new Error('The supplied GIS file is not a GeoJSON FeatureCollection')
  return { type: 'FeatureCollection', features: input.features.filter(feature => feature?.type === 'Feature' && validGeometry(feature.geometry)) }
}
function boundsFor(geometry: Geometry | null): maplibregl.LngLatBounds | null {
  if (!geometry) return null
  const bounds = new maplibregl.LngLatBounds()
  const visit = (value: unknown) => { if (validPair(value)) bounds.extend([value[0], value[1]]); else if (Array.isArray(value)) value.forEach(visit) }
  visit(geometry.coordinates)
  return bounds.isEmpty() ? null : bounds
}
function layerColor(layer: AtlasLayer): unknown {
  if (layer.key === 'gaps') return ['match', ['get', 'severity'], 'high', '#a54945', 'medium', '#b78a43', 'low', '#719672', layer.color]
  if (layer.key.startsWith('flight-')) return ['match', ['get', 'day'], 3, '#22d3ee', 4, '#3b82f6', 5, '#22c55e', 6, '#f59e0b', 7, '#ef4444', 8, '#a855f7', layer.color]
  return layer.color
}
function addAtlasLayers(map: MapLibreMap, layer: AtlasLayer) {
  // Raster overlays carry no GeoJSON source; loadElevationOverlay() wires them.
  if (layer.kind === 'raster') return
  const source = sourceId(layer.key)
  if (!map.getSource(source)) map.addSource(source, { type: 'geojson', data: EMPTY as any })
  const visibility = layer.defaultOn ? 'visible' : 'none'
  if (layer.kind === 'fill' || layer.kind === 'mixed') {
    const opacity = layer.key === 'boundary' || layer.key === 'districts' ? .08 : layer.key === 'sheds' ? .17 : layer.key === 'elevation' ? .32 : layer.key === 'major-water' ? .57 : layer.key === 'minor-water' ? .4 : .23
    map.addLayer({ id: `atlas-${layer.key}-fill`, type: 'fill', source, filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility }, paint: { 'fill-color': layerColor(layer) as any, 'fill-opacity': opacity } })
    map.addLayer({ id: `atlas-${layer.key}-outline`, type: 'line', source, filter: ['==', ['geometry-type'], 'Polygon'], layout: { visibility }, paint: { 'line-color': layerColor(layer) as any, 'line-width': layer.key === 'boundary' ? 2.5 : 1.1, 'line-opacity': layer.key === 'boundary' ? .95 : .78 } })
  }
  if (layer.kind === 'line') map.addLayer({ id: `atlas-${layer.key}-line`, type: 'line', source, layout: { visibility }, paint: { 'line-color': layerColor(layer) as any, 'line-width': layer.key === 'rivers' ? 3.2 : layer.key === 'drainage' ? 1.15 : 2.4, 'line-opacity': layer.key === 'drainage' ? .78 : .96 } })
  if (layer.kind === 'point' || layer.kind === 'mixed') map.addLayer({ id: `atlas-${layer.key}-point`, type: 'circle', source, filter: ['==', ['geometry-type'], 'Point'], layout: { visibility }, paint: { 'circle-color': layerColor(layer) as any, 'circle-radius': layer.key === 'flight-points' ? 3.5 : 6, 'circle-stroke-color': '#fffefa', 'circle-stroke-width': 1.7, 'circle-opacity': .94 } })
}
function addNakshaLayers(map: MapLibreMap, dataset: NakshaSurveyDataset, data: Collection, visible: boolean): string[] {
  const source = nakshaSourceId(dataset.id)
  if (map.getSource(source)) {
    ;(map.getSource(source) as maplibregl.GeoJSONSource).setData(data as any)
    return []
  }
  map.addSource(source, { type: 'geojson', data: data as any })
  const color = NAKSHA_COLORS[dataset.id] || '#416d69'
  const layout = { visibility: visible ? 'visible' as const : 'none' as const }
  const ids: string[] = []
  const before = 'atlas-selection-fill'
  if (dataset.geometry_type === 'Polygon') {
    const fillId = nakshaLayerId(dataset.id, 'fill')
    const outlineId = nakshaLayerId(dataset.id, 'outline')
    const boundary = dataset.id.endsWith('boundary')
    const opacity = boundary ? .055 : dataset.id === 'forest' ? .22 : dataset.id === 'reservoirs' ? .36 : .18
    map.addLayer({ id: fillId, type: 'fill', source, layout, paint: { 'fill-color': color, 'fill-opacity': opacity } }, before)
    map.addLayer({ id: outlineId, type: 'line', source, layout, paint: { 'line-color': color, 'line-width': boundary ? 2.7 : 1.5, 'line-opacity': .94 } }, before)
    ids.push(fillId, outlineId)
  } else if (dataset.geometry_type === 'LineString') {
    const id = nakshaLayerId(dataset.id, 'line')
    map.addLayer({ id, type: 'line', source, layout, paint: { 'line-color': color, 'line-width': dataset.id === 'cauvery' ? 3.2 : 2.4, 'line-opacity': .94 } }, before)
    ids.push(id)
  } else {
    const id = nakshaLayerId(dataset.id, 'point')
    map.addLayer({ id, type: 'circle', source, layout, paint: { 'circle-color': color, 'circle-radius': dataset.id.includes('chainage') ? 5.2 : 6.5, 'circle-stroke-color': '#fffefa', 'circle-stroke-width': 1.8 } }, before)
    ids.push(id)
  }
  return ids
}
function fieldLabel(value: string): string {
  const labels: Record<string, string> = { riverId: 'River ID', shedId: 'Sub-hydroshed ID', bodDec2020: 'BOD Dec 2020', stretch: 'Polluted Stretch', findings: 'Finding', gapUnit: 'Gap Unit', areaHa: 'Area (ha)', min_m: 'Minimum (m)', max_m: 'Maximum (m)', cetp: 'CETP', cetpNote: 'CETP Note', rel_alt_m: 'Relative Altitude (m)', abs_alt_m: 'Absolute Altitude (m)' }
  return labels[value] || value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, letter => letter.toUpperCase())
}
function useful(value: unknown): boolean { return value !== null && value !== undefined && value !== '' && value !== 'null' && value !== 'undefined' }
function displayValue(value: unknown): string { return typeof value === 'object' ? JSON.stringify(value) : String(value) }
function featureName(selection: Selection): string {
  const p = selection.feature.properties || {}
  return String(p.name || p.locationName || p.band || p.label || p.flight_id || (selection.layer.key === 'boundary' ? 'Arkavathi Basin' : selection.layer.name))
}
function safeEvidenceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null }
}
function nakshaFeatureName(selection: NakshaSelection): string {
  const properties = selection.feature.properties || {}
  for (const key of ['Name', 'name', 'rivname', 'Hydro Powe', 'district_n', 'MED_DESCRI']) {
    if (useful(properties[key])) return selection.dataset.id.endsWith('chainage') ? `${selection.dataset.name} ${String(properties[key])}` : String(properties[key])
  }
  return `${selection.dataset.name} feature${selection.feature.id === undefined ? '' : ` ${Number(selection.feature.id) + 1}`}`
}
function nakshaDetailFields(properties: Record<string, unknown> | null | undefined): [string, unknown][] {
  const technical = /^(objectid(?:_.*)?|fid|id|gridcode|hsg_num|unique_id|fcode|shape_.*|tessellate|extrude|visibility|draworder|altitudemo|icon)$/i
  return Object.entries(properties || {}).filter(([key, value]) => !technical.test(key) && useful(value))
}

export function ArkavathiGISAtlas({ tracks, points, nakshaSurveyAccess }: { tracks: unknown; points: unknown; nakshaSurveyAccess: boolean }) {
  const mapNode = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const dataCache = useRef(new Map<string, Collection>())
  const pending = useRef(new Map<string, Promise<void>>())
  const visibilityRef = useRef(INITIAL_VISIBLE)
  const [visible, setVisible] = useState<Record<string, boolean>>(INITIAL_VISIBLE)
  const [ready, setReady] = useState(false)
  const [basemap, setBasemap] = useState<'street' | 'satellite'>('street')
  const [expanded, setExpanded] = useState<Record<string, boolean>>(Object.fromEntries(GROUPS.map(group => [group, true])))
  const [search, setSearch] = useState('')
  const [selection, setSelection] = useState<Selection | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const fitted = useRef(false)
  visibilityRef.current = visible

  // ---- Arkavathi River Data panel ------------------------------------------
  // `nakshaOpen` / `nakshaVisible` keep their original names because they also
  // drive the map snapshot logic and the catalogue loader; they now describe
  // the renamed "Arkavathi River Data" panel.
  const [dataGroupOpen, setDataGroupOpen] = useState<Record<string, boolean>>({ 'sub-catchments': true, 'arkavathi-chainages': true })
  const [elevationManifest, setElevationManifest] = useState<ElevationManifest | null>(null)
  const [elevationFailed, setElevationFailed] = useState('')
  const [atlasReloadNonce, setAtlasReloadNonce] = useState(0)
  const [nakshaReloadNonce, setNakshaReloadNonce] = useState(0)
  const elevationBoundsRef = useRef<[number, number, number, number] | null>(null)
  const elevationPendingRef = useRef<Promise<void> | null>(null)

  // ---- Street View selection workflow ----------------------------------------
  const [streetStage, setStreetStage] = useState<StreetStage>('off')
  const [streetLocation, setStreetLocation] = useState<StreetPoint | null>(null)
  const streetStageRef = useRef<StreetStage>('off')
  const streetSnapshot = useRef<StreetSnapshot | null>(null)
  const streetMarkerRef = useRef<maplibregl.Marker | null>(null)
  const streetLocationRef = useRef<StreetPoint | null>(null)
  const streetHeadingRef = useRef<number | null>(null)
  const applyStreetHeadingRef = useRef<() => void>(() => {})
  streetStageRef.current = streetStage
  streetLocationRef.current = streetLocation

  const [nakshaCatalogue, setNakshaCatalogue] = useState<NakshaSurveyDataset[]>([])
  const [nakshaOpen, setNakshaOpen] = useState(false)
  const [nakshaVisible, setNakshaVisible] = useState<Record<string, boolean>>({})
  const [nakshaLoading, setNakshaLoading] = useState<Record<string, boolean>>({})
  const [nakshaErrors, setNakshaErrors] = useState<Record<string, string>>({})
  const [nakshaCatalogueError, setNakshaCatalogueError] = useState('')
  const [nakshaSelection, setNakshaSelection] = useState<NakshaSelection | null>(null)
  const nakshaCache = useRef(new Map<string, { collection: Collection; metadata: NakshaSurveyGeoJson['metadata'] }>())
  const nakshaPending = useRef(new Map<string, Promise<void>>())
  const nakshaLayerKeys = useRef(new Map<string, string>())
  const nakshaVisibleRef = useRef(nakshaVisible)
  const nakshaCatalogueRef = useRef(nakshaCatalogue)
  nakshaVisibleRef.current = nakshaVisible
  nakshaCatalogueRef.current = nakshaCatalogue

  // ---- Verified Survey (KML/KMZ) playback -----------------------------------
  const [datasets, setDatasets] = useState<SurveyDataset[]>([])
  const [datasetId, setDatasetId] = useState('')
  const [trackId, setTrackId] = useState('')
  const [routeVisible, setRouteVisible] = useState(true)
  const [surveyPointsVisible, setSurveyPointsVisible] = useState(true)
  const [followPoint, setFollowPoint] = useState(false)
  const [surveyBusy, setSurveyBusy] = useState(false)
  const [surveyError, setSurveyError] = useState('')
  const datasetSeq = useRef(0)
  const followRef = useRef(false)
  followRef.current = followPoint

  const dataset = datasets.find(item => item.id === datasetId) ?? null
  const track = dataset?.tracks.find(item => item.id === trackId) ?? null

  // Per-frame callback: updates ONLY the single moving-point source (plus optional
  // camera follow). No React state is touched during animation.
  const handleSurveyFrame = (sample: PlaybackSample | null) => {
    const map = mapRef.current
    if (!map) return
    const source = map.getSource('atlas-survey-position') as maplibregl.GeoJSONSource | undefined
    if (!source) return
    if (!sample) { source.setData(EMPTY as any); return }
    source.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [sample.lon, sample.lat] }, properties: {} } as any)
    if (followRef.current) map.setCenter([sample.lon, sample.lat])
  }
  const engine = useSurveyPlaybackEngine(track, handleSurveyFrame)

  const loadSurveyFiles = async (files: File[]) => {
    if (!files.length) return
    setSurveyBusy(true)
    setSurveyError('')
    try {
      const loaded: SurveyDataset[] = []
      for (const file of files) {
        datasetSeq.current += 1
        const buffer = await file.arrayBuffer()
        loaded.push(await parseSurveyFile(file.name, buffer, `dataset-${datasetSeq.current}`))
      }
      setDatasets(previous => [...previous, ...loaded])
      setDatasetId(loaded[0].id)
      setTrackId(loaded[0].tracks[0]?.id ?? '')
    } catch (error) {
      setSurveyError(error instanceof Error ? error.message : 'Unable to load the selected survey file.')
    } finally {
      setSurveyBusy(false)
    }
  }

  const selectSurveyDataset = (id: string) => {
    setDatasetId(id)
    const next = datasets.find(item => item.id === id) ?? null
    setTrackId(next?.tracks[0]?.id ?? '')
  }

  const fitRouteTo = (target: SurveyTrack | null) => {
    const map = mapRef.current
    if (!map || !target || !target.points.length) return
    const bounds = new maplibregl.LngLatBounds()
    for (const point of target.points) bounds.extend([point.lon, point.lat])
    if (bounds.isEmpty()) return
    const single = bounds.getSouthWest().lng === bounds.getNorthEast().lng && bounds.getSouthWest().lat === bounds.getNorthEast().lat
    map.fitBounds(bounds, { padding: single ? 90 : 60, maxZoom: single ? 14 : 15, duration: 500 })
  }

  useEffect(() => {
    if (!nakshaSurveyAccess) return
    let cancelled = false
    api.nakshaSurveyCatalogue()
      .then(result => { if (!cancelled) setNakshaCatalogue(result.datasets) })
      .catch(error => { if (!cancelled) setNakshaCatalogueError(error instanceof Error ? error.message : 'Unable to load survey catalogue') })
    return () => { cancelled = true }
  }, [nakshaSurveyAccess])

  useEffect(() => {
    if (!mapNode.current) return
    let disposed = false
    const map = new maplibregl.Map({ container: mapNode.current, style: BASE_STYLE, center: [77.4388, 13.1672], zoom: 9.3 })
    mapRef.current = map
    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right')
    const onLoad = () => {
      if (disposed) return
      LAYERS.forEach(layer => addAtlasLayers(map, layer))
      map.addSource('atlas-selection', { type: 'geojson', data: EMPTY as any })
      map.addLayer({ id: 'atlas-selection-fill', type: 'fill', source: 'atlas-selection', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#e6b852', 'fill-opacity': .26 } })
      map.addLayer({ id: 'atlas-selection-line', type: 'line', source: 'atlas-selection', paint: { 'line-color': '#e4a629', 'line-width': 4 } })
      map.addLayer({ id: 'atlas-selection-point', type: 'circle', source: 'atlas-selection', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-color': '#e4a629', 'circle-radius': 10, 'circle-stroke-color': '#16352f', 'circle-stroke-width': 2 } })
      // Verified Survey: route line + survey points + ONE moving position marker, all as
      // GeoJSON sources so playback only ever updates the position source per frame.
      map.addSource('atlas-survey-route', { type: 'geojson', data: EMPTY as any })
      map.addSource('atlas-survey-points', { type: 'geojson', data: EMPTY as any })
      map.addSource('atlas-survey-position', { type: 'geojson', data: EMPTY as any })
      map.addLayer({ id: 'atlas-survey-route', type: 'line', source: 'atlas-survey-route', layout: { visibility: 'visible', 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#7c4dff', 'line-width': 4, 'line-opacity': .9 } })
      map.addLayer({ id: 'atlas-survey-points', type: 'circle', source: 'atlas-survey-points', layout: { visibility: 'visible' }, paint: { 'circle-color': '#9e86ff', 'circle-radius': 3.5, 'circle-stroke-color': '#fffefa', 'circle-stroke-width': 1, 'circle-opacity': .9 } })
      map.addLayer({ id: 'atlas-survey-position-halo', type: 'circle', source: 'atlas-survey-position', layout: { visibility: 'visible' }, paint: { 'circle-color': '#7c4dff', 'circle-radius': 12, 'circle-opacity': .22 } })
      map.addLayer({ id: 'atlas-survey-position', type: 'circle', source: 'atlas-survey-position', layout: { visibility: 'visible' }, paint: { 'circle-color': '#7c4dff', 'circle-radius': 7, 'circle-stroke-color': '#fffefa', 'circle-stroke-width': 2.5 } })
      setReady(true)
      // DEM-derived Elevation Bands overlay (Arkavathi_Dem1.tif).
      loadElevationOverlay()
    }
    const queryLayers = (hover: boolean) => [
      ...LAYERS.filter(layer => visibilityRef.current[layer.key] && (!hover || !['drainage', 'minor-water'].includes(layer.key))).flatMap(layer => layerIds(layer)),
      ...Array.from(nakshaLayerKeys.current).filter(([, datasetId]) => nakshaVisibleRef.current[datasetId]).map(([id]) => id),
    ].filter(id => Boolean(map.getLayer(id)))
    map.on('load', onLoad)
    // Keep the Street View direction arrow correct when the map is rotated,
    // even without a new panorama event.
    map.on('rotate', () => applyStreetHeadingRef.current())
    map.on('click', event => {
      // Street View selection owns clicks while its workflow is active.
      if (streetStageRef.current !== 'off') return
      const layers = queryLayers(false)
      if (!layers.length) return
      const hit = map.queryRenderedFeatures(event.point, { layers })[0]
      if (!hit) return
      const nakshaId = nakshaLayerKeys.current.get(hit.layer.id)
      if (nakshaId) {
        const dataset = nakshaCatalogueRef.current.find(item => item.id === nakshaId)
        if (!dataset || !hit.geometry) return
        const feature: AtlasFeature = { type: 'Feature', id: hit.id, properties: hit.properties as Record<string, unknown>, geometry: hit.geometry as Geometry }
        setSelection(null)
        setNakshaSelection({ dataset, feature })
        ;(map.getSource('atlas-selection') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [feature] } as any)
        return
      }
      const key = hit.layer.id.replace(/^atlas-/, '').replace(/-(fill|outline|line|point)$/, '')
      const layer = BY_KEY[key]
      if (!layer || !hit.geometry) return
      const feature: AtlasFeature = { type: 'Feature', properties: hit.properties as Record<string, unknown>, geometry: hit.geometry as Geometry }
      setNakshaSelection(null)
      setSelection({ layer, feature })
      ;(map.getSource('atlas-selection') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [feature] } as any)
    })
    map.on('mousemove', event => {
      const stage = streetStageRef.current
      if (stage === 'selecting' || stage === 'viewing') { map.getCanvas().style.cursor = 'crosshair'; return }
      const layers = queryLayers(true)
      map.getCanvas().style.cursor = layers.length && map.queryRenderedFeatures(event.point, { layers }).length ? 'pointer' : ''
    })
    const observer = new ResizeObserver(() => map.resize())
    observer.observe(mapNode.current)
      return () => { disposed = true; observer.disconnect(); try { streetMarkerRef.current?.remove(); } catch {}; streetMarkerRef.current = null; map.remove(); mapRef.current = null; setReady(false) }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const layer of LAYERS) for (const id of layerIds(layer)) map.setLayoutProperty(id, 'visibility', visible[layer.key] ? 'visible' : 'none')
    if (map.getLayer('atlas-elevation-raster')) map.setLayoutProperty('atlas-elevation-raster', 'visibility', visible.elevation ? 'visible' : 'none')
    for (const layer of LAYERS.filter(item => item.file && (visible[item.key] || item.key === 'boundary'))) {
      if (dataCache.current.has(layer.key) || pending.current.has(layer.key)) continue
      setLoading(old => ({ ...old, [layer.key]: true }))
      const request = fetch(DATA_PATH + layer.file)
        .then(async response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return cleanedCollection(await response.json()) })
        .then(collection => {
          dataCache.current.set(layer.key, collection)
          if (mapRef.current !== map) return
          ;(map.getSource(sourceId(layer.key)) as maplibregl.GeoJSONSource).setData(collection as any)
          if (layer.key === 'boundary' && !fitted.current) {
            const bounds = boundsFor(collection.features[0]?.geometry || null)
            if (bounds) { map.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 0 }); fitted.current = true }
          }
        })
        .catch(error => setErrors(old => ({ ...old, [layer.key]: error instanceof Error ? error.message : 'Unable to load layer' })))
        .finally(() => { pending.current.delete(layer.key); setLoading(old => ({ ...old, [layer.key]: false })) })
      pending.current.set(layer.key, request)
    }
  }, [visible, ready, atlasReloadNonce])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    ;(map.getSource(sourceId('flight-tracks')) as maplibregl.GeoJSONSource).setData((tracks || EMPTY) as any)
    ;(map.getSource(sourceId('flight-points')) as maplibregl.GeoJSONSource).setData((points || EMPTY) as any)
  }, [tracks, points, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    map.setLayoutProperty('atlas-base-street', 'visibility', basemap === 'street' ? 'visible' : 'none')
    map.setLayoutProperty('atlas-base-satellite', 'visibility', basemap === 'satellite' ? 'visible' : 'none')
  }, [basemap, ready])

  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || !nakshaSurveyAccess) return
    for (const dataset of nakshaCatalogue) {
      const enabled = Boolean(nakshaVisible[dataset.id])
      for (const [id, datasetId] of nakshaLayerKeys.current) {
        if (datasetId === dataset.id && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', enabled ? 'visible' : 'none')
      }
      if (!enabled || !dataset.available || nakshaPending.current.has(dataset.id)) continue
      const cached = nakshaCache.current.get(dataset.id)
      if (cached) {
        if (!map.getSource(nakshaSourceId(dataset.id))) {
          for (const id of addNakshaLayers(map, dataset, cached.collection, true)) nakshaLayerKeys.current.set(id, dataset.id)
        }
        continue
      }
      setNakshaLoading(old => ({ ...old, [dataset.id]: true }))
      const request = api.nakshaSurveyDataset(dataset.id)
        .then(result => {
          if (result.metadata.dataset_id !== dataset.id) throw new Error('Survey dataset response did not match the selection')
          const collection = cleanedCollection(result)
          nakshaCache.current.set(dataset.id, { collection, metadata: result.metadata })
          if (mapRef.current !== map) return
          const ids = addNakshaLayers(map, dataset, collection, Boolean(nakshaVisibleRef.current[dataset.id]))
          for (const id of ids) nakshaLayerKeys.current.set(id, dataset.id)
          setNakshaErrors(old => { const next = { ...old }; delete next[dataset.id]; return next })
        })
        .catch(error => setNakshaErrors(old => ({ ...old, [dataset.id]: error instanceof Error ? error.message : 'Unable to load survey dataset' })))
        .finally(() => { nakshaPending.current.delete(dataset.id); setNakshaLoading(old => ({ ...old, [dataset.id]: false })) })
      nakshaPending.current.set(dataset.id, request)
    }
  }, [nakshaCatalogue, nakshaVisible, ready, nakshaSurveyAccess, nakshaReloadNonce])

  // Push the selected track into the route/points sources (whole sequence, no downsampling).
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const routeSource = map.getSource('atlas-survey-route') as maplibregl.GeoJSONSource | undefined
    const pointsSource = map.getSource('atlas-survey-points') as maplibregl.GeoJSONSource | undefined
    if (!routeSource || !pointsSource) return
    if (!track || !track.points.length) {
      routeSource.setData(EMPTY as any)
      pointsSource.setData(EMPTY as any)
      return
    }
    const coords = track.points.map(point => [point.lon, point.lat])
    // Single-point routes cannot form a LineString; render only the point markers.
    routeSource.setData(coords.length >= 2
      ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } as any
      : EMPTY as any)
    pointsSource.setData({ type: 'FeatureCollection', features: track.points.map(point => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [point.lon, point.lat] }, properties: {} })) } as any)
    engine.emitCurrent()
  }, [track, ready, engine])

  // Route + survey-point layer visibility follow the survey toggles (not the layer explorer).
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    for (const id of ['atlas-survey-route']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', routeVisible ? 'visible' : 'none')
    for (const id of ['atlas-survey-points']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', surveyPointsVisible ? 'visible' : 'none')
  }, [routeVisible, surveyPointsVisible, ready])

  // Snapshot published by the engine (~80ms while playing) lives in SurveySurveyCard,
  // so playback updates re-render only the card, never the whole atlas.

  // Layers listed in the River Layer Explorer. Drainage Network and Elevation
  // Bands are owned by the Arkavathi River Data panel whenever that panel is
  // available, so they are never listed (or silently toggled) in both places.
  const explorerLayers = useMemo(
    () => (nakshaSurveyAccess ? LAYERS.filter(layer => !DATA_PANEL_ATLAS_KEYS.includes(layer.key)) : LAYERS),
    [nakshaSurveyAccess],
  )
  const activeLayers = useMemo(() => explorerLayers.filter(layer => visible[layer.key]), [explorerLayers, visible])

  const clearRiverLayers = () => {
    clearSelection()
    setVisible(old => {
      const next = { ...old }
      for (const layer of explorerLayers) next[layer.key] = false
      return next
    })
  }

  // ---- Arkavathi River Data panel: one control path per row ----------------
  // Each row either toggles a NakshaTech catalogue dataset or an atlas layer
  // key, so the checkbox, the map overlay and the summary can never disagree.
  const isPanelRowOn = (leaf: PanelLeaf) => Boolean(leaf.atlasKey ? visible[leaf.atlasKey] : nakshaVisible[leaf.id])
  const setPanelRowOn = (leaf: PanelLeaf, value: boolean) => {
    if (leaf.atlasKey) { setVisible(old => ({ ...old, [leaf.atlasKey as string]: value })); return }
    if (value && nakshaSelection?.dataset.id === leaf.id) clearNakshaSelection()
    setNakshaVisible(old => ({ ...old, [leaf.id]: value }))
  }
  const groupState = (group: PanelGroup) => {
    const on = group.children.filter(isPanelRowOn).length
    return { on, total: group.children.length, checked: on === group.children.length, indeterminate: on > 0 && on < group.children.length }
  }
  const allPanelLeaves: PanelLeaf[] = PANEL_ROWS.flatMap(row => (row.kind === 'leaf' ? [row] : row.children))
  const activePanelLeaves = allPanelLeaves.filter(isPanelRowOn)
  // Leaf datasets actually drawn on the map: explorer layers plus this panel's
  // rows. Parent headings and internal MapLibre layers are never counted.
  const visibleLeafCount = activeLayers.length + (nakshaSurveyAccess ? activePanelLeaves.length : 0)

  // Exit removes every Street View resource and restores normal GIS click
  // handling. Nothing else is reverted: basemap, layer selections and open
  // panels deliberately stay as the user left them, so entering or leaving
  // Street View never resets layer state or map context.
  const removeStreetMarker = () => {
    streetHeadingRef.current = null
    try { streetMarkerRef.current?.remove() } catch {}
    streetMarkerRef.current = null
  }

  // MapLibre owns the marker's own translate, so only the inner arrow is
  // rotated - and always relative to the current map bearing, so a rotated map
  // still points the arrow the right way. With no known heading the arrow is
  // hidden rather than falsely pointing north.
  const applyStreetHeading = () => {
    const marker = streetMarkerRef.current
    if (!marker) return
    const arrow = marker.getElement().querySelector('[data-sv-arrow]') as HTMLElement | null
    if (!arrow) return
    const heading = streetHeadingRef.current
    if (heading === null || !Number.isFinite(heading)) { arrow.style.setProperty('--sv-arrow-hidden', '1'); return }
    arrow.style.setProperty('--sv-arrow-hidden', '0')
    const rotated = ((heading - mapRef.current!.getBearing()) % 360 + 360) % 360
    arrow.style.setProperty('--sv-heading', `${rotated}deg`)
  }
  applyStreetHeadingRef.current = applyStreetHeading

  // A single reused marker with three explicit states. 'pending' is the point
  // the user requested, 'confirmed' is the resolved panorama position and
  // 'missing' means the requested point has no imagery.
  const showStreetMarker = (point: StreetPoint, state: 'pending' | 'confirmed' | 'missing', heading: number | null) => {
    const map = mapRef.current
    if (!map || streetStageRef.current === 'off') return
    let marker = streetMarkerRef.current
    if (!marker) {
      const el = document.createElement('div')
      el.className = 'ark-atlas-street-marker'
      el.innerHTML = '<div class="ark-atlas-street-marker--halo"></div><div class="ark-atlas-street-marker--arrow" data-sv-arrow></div><div class="ark-atlas-street-marker--dot"></div>'
      marker = new maplibregl.Marker({ element: el, anchor: 'center', offset: [0, 0] }).addTo(map)
      streetMarkerRef.current = marker
    }
    marker.setLngLat([point.lng, point.lat])
    marker.getElement().dataset.svState = state
    streetHeadingRef.current = state === 'confirmed' ? heading : null
    applyStreetHeading()
  }

  const exitStreetView = () => {
    streetSnapshot.current = null
    removeStreetMarker()
    setStreetStage('off')
  }

  const toggleStreetView = () => {
    if (streetStageRef.current !== 'off') { exitStreetView(); return }
    setStreetStage('selecting')
  }

  // Escape cancels the selection step and exits Street View (unless the browser
  // itself is in fullscreen, in which case Escape only leaves fullscreen).
  useEffect(() => {
    if (streetStage === 'off') return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) exitStreetView()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [streetStage])

  // Selection mode: the next clean map click picks the Street View location.
  useEffect(() => {
    const map = mapRef.current
      if (!ready || !map || streetStage === 'off') return
    const canvas = map.getCanvas()
    const previousCursor = canvas.style.cursor
    canvas.style.cursor = 'crosshair'
    const onSelectLocation = (event: MapMouseEvent) => {
      const lat = Number(event.lngLat.lat)
      const lng = Number(event.lngLat.lng)
      // Requested point: shown immediately as a pending marker, before any
      // imagery request has resolved. It is never labelled as a panorama.
      showStreetMarker({ lat, lng }, 'pending', null)
      setStreetLocation({ lat, lng })
      setStreetStage('viewing')
    }
    map.on('click', onSelectLocation)
    return () => { map.off('click', onSelectLocation); canvas.style.cursor = previousCursor }
  }, [ready, streetStage])

  const clearSelection = () => { setSelection(null); (mapRef.current?.getSource('atlas-selection') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY as any) }
  const clearNakshaSelection = () => { setNakshaSelection(null); (mapRef.current?.getSource('atlas-selection') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY as any) }
  // Clears only this panel's thematic selections and their map overlays. The
  // basemap, the session, Street View and the River Layer Explorer are all
  // left untouched.
  const clearDataPanelLayers = () => {
    clearNakshaSelection()
    setNakshaVisible({})
    setVisible(old => {
      const next = { ...old }
      for (const key of DATA_PANEL_ATLAS_KEYS) next[key] = false
      return next
    })
  }
  // Fit Selected uses the combined extent of every selected, available leaf
  // dataset, including grouped children and the raster-derived elevation layer.
  // Layers that are still streaming in are awaited first, so a freshly checked
  // row always contributes to the fit instead of being skipped silently.
  const fitSelectedDataPanel = async () => {
    const map = mapRef.current
    if (!map || !activePanelLeaves.length) return
    const inFlight: Promise<unknown>[] = []
    for (const leaf of activePanelLeaves) {
      if (leaf.atlasKey) {
        if (leaf.atlasKey === 'elevation') {
          if (!elevationBoundsRef.current) inFlight.push(loadElevationOverlay())
          continue
        }
        if (!dataCache.current.has(leaf.atlasKey)) {
          const request = pending.current.get(leaf.atlasKey)
          if (request) inFlight.push(request)
        }
        continue
      }
      const dataset = nakshaCatalogueRef.current.find(item => item.id === leaf.id)
      if (!dataset?.available || nakshaCache.current.has(dataset.id)) continue
      const request = nakshaPending.current.get(dataset.id)
      if (request) inFlight.push(request)
    }
    if (inFlight.length) await Promise.allSettled(inFlight)
    if (mapRef.current !== map || streetStageRef.current !== 'off') return
    const bounds = new maplibregl.LngLatBounds()
    let used = 0
    for (const leaf of activePanelLeaves) {
      if (leaf.atlasKey) {
        if (leaf.atlasKey === 'elevation') {
          const box = elevationBoundsRef.current
          if (box) { bounds.extend([box[0], box[1]]); bounds.extend([box[2], box[3]]); used += 1 }
          continue
        }
        for (const feature of dataCache.current.get(leaf.atlasKey)?.features || []) {
          const featureBounds = boundsFor(feature.geometry || null)
          if (featureBounds) { bounds.extend(featureBounds.getSouthWest()); bounds.extend(featureBounds.getNorthEast()); used += 1; break }
        }
        continue
      }
      const dataset = nakshaCatalogueRef.current.find(item => item.id === leaf.id)
      if (!dataset?.available) continue
      const box = nakshaCache.current.get(dataset.id)?.metadata.bounds
      if (box) { bounds.extend([box[0], box[1]]); bounds.extend([box[2], box[3]]); used += 1 }
    }
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 65, maxZoom: 13, duration: 500 })
    else if (!used) return
  }
  const focusBasin = () => {
    const boundary = dataCache.current.get('boundary')?.features[0]
    const bounds = boundsFor(boundary?.geometry || null)
    if (bounds) mapRef.current?.fitBounds(bounds, { padding: 48, maxZoom: 12, duration: 450 })
  }
  const handlePanoramaChange = (view: PanoramaView | null) => {
    const map = mapRef.current
    if (!map) return
    // A report that arrives after exit must never resurrect the marker.
    if (streetStageRef.current === 'off') { removeStreetMarker(); return }
    if (!view) { removeStreetMarker(); return }
    const requested = streetLocationRef.current
    if (view.status === 'ready') {
      const pos = view.position
      const heading = typeof view.heading === 'number' && isFinite(view.heading) ? view.heading : null
      showStreetMarker({ lat: pos.lat, lng: pos.lng }, 'confirmed', heading)
      return
    }
    if (!requested) return
    showStreetMarker(requested, view.status === 'loading' ? 'pending' : 'missing', null)
  }

  const zoomSelection = () => {
    const bounds = boundsFor(selection?.feature.geometry || null)
    if (!bounds) return
    if (bounds.getNorthEast().lng === bounds.getSouthWest().lng && bounds.getNorthEast().lat === bounds.getSouthWest().lat) mapRef.current?.flyTo({ center: bounds.getCenter(), zoom: 13 })
    else mapRef.current?.fitBounds(bounds, { padding: 90, maxZoom: 13, duration: 450 })
  }

  // Loads (or reloads) the DEM-derived elevation overlay. The raster sits
  // directly below the rivers line layer so every line and point layer, the
  // selection highlight and the Street View marker stay readable on top.
  // The PNG is preloaded first so a missing/broken asset surfaces as an
  // explicit panel error with Retry instead of a silently blank overlay.
  const loadElevationOverlay = (): Promise<void> => {
    if (elevationPendingRef.current) return elevationPendingRef.current
    const map = mapRef.current
    if (!map) return Promise.resolve()
    const task = fetch(ELEVATION_MANIFEST_PATH)
      .then(response => { if (!response.ok) throw new Error(`Elevation overlay manifest unavailable (HTTP ${response.status})`); return response.json() })
      .then((manifest: ElevationManifest) => new Promise<void>((resolve, reject) => {
        const bounds = manifest?.raster?.bounds
        if (!Array.isArray(bounds) || bounds.length !== 4 || bounds.some(value => !Number.isFinite(value))) {
          reject(new Error('Elevation overlay manifest has no usable bounds'))
          return
        }
        const [west, south, east, north] = bounds as number[]
        const image = new Image()
        image.onload = () => {
          resolve()
          if (mapRef.current !== map) return
          elevationBoundsRef.current = [west, south, east, north]
          setElevationManifest(manifest)
          setElevationFailed('')
          if (!map.getSource('atlas-source-elevation-raster')) {
            map.addSource('atlas-source-elevation-raster', {
              type: 'image',
              url: ELEVATION_IMAGE_PATH,
              coordinates: [[west, south], [west, north], [east, north], [east, south]],
            })
          }
          if (!map.getLayer('atlas-elevation-raster')) {
            const before = map.getLayer('atlas-rivers-line') ? 'atlas-rivers-line' : undefined
            map.addLayer({
              id: 'atlas-elevation-raster',
              type: 'raster',
              source: 'atlas-source-elevation-raster',
              layout: { visibility: visibilityRef.current.elevation ? 'visible' : 'none' },
              paint: { 'raster-opacity': 0.62, 'raster-resampling': 'nearest' },
            }, before)
          } else {
            map.setLayoutProperty('atlas-elevation-raster', 'visibility', visibilityRef.current.elevation ? 'visible' : 'none')
          }
        }
        image.onerror = () => reject(new Error('Elevation overlay image could not be loaded'))
        image.src = ELEVATION_IMAGE_PATH
      }))
      .catch(error => {
        setElevationFailed(error instanceof Error ? error.message : 'Elevation overlay could not be loaded')
      })
      .finally(() => { elevationPendingRef.current = null })
    elevationPendingRef.current = task
    return task
  }

  // Targeted retry for one row only; the rest of the group keeps working.
  const retryPanelLeaf = (leaf: PanelLeaf) => {
    if (leaf.atlasKey === 'elevation') { setElevationFailed(''); loadElevationOverlay(); return }
    if (leaf.atlasKey) {
      const key = leaf.atlasKey
      dataCache.current.delete(key)
      pending.current.delete(key)
      setErrors(old => { const next = { ...old }; delete next[key]; return next })
      setVisible(old => ({ ...old, [key]: true }))
      setAtlasReloadNonce(nonce => nonce + 1)
      return
    }
    nakshaCache.current.delete(leaf.id)
    nakshaPending.current.delete(leaf.id)
    setNakshaErrors(old => { const next = { ...old }; delete next[leaf.id]; return next })
    if (!nakshaVisible[leaf.id]) setNakshaVisible(old => ({ ...old, [leaf.id]: true }))
    setNakshaReloadNonce(nonce => nonce + 1)
  }

  // ---- Arkavathi River Data panel: row helpers ----------------------------
  const panelDataset = (leaf: PanelLeaf) => (leaf.atlasKey ? null : nakshaCatalogue.find(item => item.id === leaf.id) ?? null)
  const panelLeafError = (leaf: PanelLeaf) =>
    leaf.atlasKey === 'elevation' ? elevationFailed
      : leaf.atlasKey ? (errors[leaf.atlasKey] || '')
        : (nakshaErrors[leaf.id] || '')
  const panelLeafBusy = (leaf: PanelLeaf) =>
    leaf.atlasKey ? Boolean(loading[leaf.atlasKey]) : Boolean(nakshaLoading[leaf.id])
  const panelLeafSwatch = (leaf: PanelLeaf) =>
    leaf.swatch || (leaf.atlasKey ? BY_KEY[leaf.atlasKey]?.color : NAKSHA_COLORS[leaf.id]) || '#416d69'
  const panelLeafShape = (leaf: PanelLeaf) => {
    const dataset = panelDataset(leaf)
    if (dataset?.geometry_type) return dataset.geometry_type
    const kind = leaf.atlasKey ? BY_KEY[leaf.atlasKey]?.kind : undefined
    return kind === 'line' ? 'LineString' : kind === 'fill' ? 'Polygon' : 'Point'
  }
  const panelLeafAvailable = (leaf: PanelLeaf) => {
    const dataset = panelDataset(leaf)
    return dataset ? Boolean(dataset.available) : true
  }
  const setGroupOn = (group: PanelGroup, value: boolean) => {
    for (const child of group.children) {
      if (!panelLeafAvailable(child)) continue
      setPanelRowOn(child, value)
    }
  }

  const renderPanelLeaf = (leaf: PanelLeaf) => {
    const on = isPanelRowOn(leaf)
    const error = panelLeafError(leaf)
    const busy = panelLeafBusy(leaf)
    const dataset = panelDataset(leaf)
    const status = busy ? 'Loading'
      : error ? 'Error'
        : dataset ? (dataset.available ? String(dataset.feature_count) : 'Unavailable')
          : ''
    return (
      <label className={`ark-atlas-naksha-row ${on ? 'is-active' : ''}`} key={leaf.id}>
        <input
          type="checkbox"
          checked={on}
          disabled={busy || !panelLeafAvailable(leaf)}
          onChange={event => setPanelRowOn(leaf, event.target.checked)}
          aria-label={leaf.label}
        />
        <i className={`ark-atlas-naksha-symbol ${panelLeafShape(leaf)}`} style={{ backgroundColor: panelLeafSwatch(leaf) }} />
        <span>{leaf.label}</span>
        {status && <small>{status}</small>}
        {error && (
          <em className="ark-atlas-naksha-row-error">
            {error}{' '}
            <button
              type="button"
              aria-label={`Retry loading ${leaf.label}`}
              onClick={event => { event.preventDefault(); event.stopPropagation(); retryPanelLeaf(leaf) }}
            >
              Retry
            </button>
          </em>
        )}
      </label>
    )
  }

  const renderPanelGroup = (group: PanelGroup) => {
    const state = groupState(group)
    const open = Boolean(dataGroupOpen[group.id])
    return (
      <div className={`ark-atlas-naksha-group is-expandable ${open ? 'is-open' : ''}`} key={group.id}>
        <div className="ark-atlas-naksha-group-head">
          <input
            type="checkbox"
            checked={state.checked}
            ref={node => { if (node) node.indeterminate = state.indeterminate }}
            onChange={event => setGroupOn(group, event.target.checked)}
            aria-label={`${group.label} — select all`}
          />
          <button
            type="button"
            className="ark-atlas-naksha-group-toggle"
            aria-expanded={open}
            aria-label={open ? `Collapse ${group.label}` : `Expand ${group.label}`}
            onClick={() => setDataGroupOpen(old => ({ ...old, [group.id]: !old[group.id] }))}
          >
            {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
            <span>{group.label}</span>
          </button>
          <small className="ark-atlas-naksha-count" title={`${state.on} of ${state.total} selected`}>{state.on}/{state.total}</small>
        </div>
        {open && <div className="ark-atlas-naksha-children">{group.children.map(renderPanelLeaf)}</div>}
      </div>
    )
  }

  const renderPanelSection = (section: PanelSection) => (
    <div className="ark-atlas-naksha-group" key={`section-${section.label}`}>
      <h3>{section.label}</h3>
      {section.children.map(renderPanelLeaf)}
    </div>
  )

  return <div className="ark-atlas" aria-label="Arkavathi GIS Atlas">
    <aside className={`ark-atlas-explorer ${panelOpen ? 'is-open' : ''}`} aria-label="GIS layer explorer">
      <div className="ark-atlas-panel-head"><div className="ark-atlas-eyebrow"><Layers3 size={15}/> River layer explorer</div><h1>Arkavathi GIS Atlas</h1><p>Explore the basin, water system and project evidence.</p><button className="ark-atlas-panel-close" onClick={() => setPanelOpen(false)} aria-label="Close layer explorer"><X size={18}/></button></div>
      <label className="ark-atlas-search"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search layers..." aria-label="Search layers"/></label>
      <div className="ark-atlas-group-scroll">
        {GROUPS.map(group => {
          const all = explorerLayers.filter(layer => layer.group === group)
          const matches = all.filter(layer => layer.name.toLowerCase().includes(search.trim().toLowerCase()) || group.toLowerCase().includes(search.trim().toLowerCase()))
          if (!matches.length) return null
          const isOpen = search.trim() ? true : expanded[group]
          return <section className="ark-atlas-group" key={group}>
            <button className="ark-atlas-group-toggle" onClick={() => setExpanded(old => ({ ...old, [group]: !old[group] }))} aria-expanded={isOpen}><span>{isOpen ? <ChevronDown size={15}/> : <ChevronRight size={15}/>} {group}</span><small>{all.filter(layer => visible[layer.key]).length}/{all.length}</small></button>
            {isOpen && <div className="ark-atlas-layer-list">{matches.map(layer => <label className={`ark-atlas-layer ${visible[layer.key] ? 'is-active' : ''}`} key={layer.key}>
              <input type="checkbox" checked={Boolean(visible[layer.key])} onChange={() => { if (visible[layer.key] && selection?.layer.key === layer.key) clearSelection(); setVisible(old => ({ ...old, [layer.key]: !old[layer.key] })) }} aria-label={layer.name}/>
              <span className="ark-atlas-swatch" style={{ background: layer.color }}/><span className="ark-atlas-layer-name">{layer.name}</span>
              {loading[layer.key] && <small className="ark-atlas-loading">Loading</small>}{errors[layer.key] && <small className="ark-atlas-layer-error" title={errors[layer.key]}>Error</small>}
            </label>)}</div>}
          </section>
        })}
        {search.trim() && !explorerLayers.some(layer => layer.name.toLowerCase().includes(search.trim().toLowerCase()) || layer.group.toLowerCase().includes(search.trim().toLowerCase())) && <p className="ark-atlas-no-results">No matching layers.</p>}
      </div>
      <SurveySurveyCard
        engine={engine}
        datasets={datasets}
        dataset={dataset}
        track={track}
        datasetId={datasetId}
        trackId={trackId}
        onSelectDataset={selectSurveyDataset}
        onSelectTrack={setTrackId}
        routeVisible={routeVisible}
        onRouteVisibleChange={setRouteVisible}
        surveyPointsVisible={surveyPointsVisible}
        onSurveyPointsVisibleChange={setSurveyPointsVisible}
        followPoint={followPoint}
        onFollowPointChange={setFollowPoint}
        busy={surveyBusy}
        error={surveyError}
        onFiles={loadSurveyFiles}
        onFitRoute={() => fitRouteTo(track)}
      />
      <div className="ark-atlas-river-actions">
        <button
          type="button"
          onClick={clearRiverLayers}
          disabled={!activeLayers.length}
          aria-label="Clear all River Layer Explorer layers"
        >
          Clear Layers
        </button>
      </div>

      <div className="ark-atlas-legend"><h2>Legend <span>{visibleLeafCount} active</span></h2>{visibleLeafCount ? <div className="ark-atlas-legend-list">
        {activeLayers.map(layer => <div key={layer.key}><i className={`ark-atlas-legend-symbol ${layer.kind}`} style={{ backgroundColor: layer.color }}/><span>{layer.name}</span></div>)}
        {nakshaSurveyAccess && activePanelLeaves.map(leaf => <div key={`panel-${leaf.id}`}><i className={`ark-atlas-legend-symbol ${panelLeafShape(leaf) === 'LineString' ? 'line' : panelLeafShape(leaf) === 'Point' ? 'point' : 'fill'}`} style={{ backgroundColor: panelLeafSwatch(leaf) }}/><span>{leaf.label}</span></div>)}
        {visible.gaps && [['High', '#a54945'], ['Medium', '#b78a43'], ['Low', '#719672']].map(([label, color]) => <div className="ark-atlas-legend-sub" key={label}><i className="ark-atlas-legend-symbol fill" style={{ backgroundColor: color }}/><span>{label} severity</span></div>)}
        {visible.elevation && elevationManifest && elevationManifest.classification.classes.map(item => <div className="ark-atlas-legend-sub" key={item.index}><i className="ark-atlas-legend-symbol fill" style={{ backgroundColor: item.color }}/><span>{item.label}</span></div>)}
      </div> : <p>Enable a layer to see its legend.</p>}
        {visible.elevation && elevationManifest && <p className="ark-atlas-legend-note">Elevation band values are interpreted as metres (m); the source GeoTIFF does not declare vertical units.</p>}
      </div>
    </aside>

    <div className="ark-atlas-map-area">
      <div ref={mapNode} className="ark-atlas-map" aria-label="Interactive Arkavathi basin map"/>
      <div className="ark-atlas-floating-toolbar" aria-label="GIS layer tools">
        {nakshaSurveyAccess && <button className="ark-atlas-naksha-toggle" aria-label="Arkavathi River Data" aria-expanded={nakshaOpen} onClick={() => { setPanelOpen(false); setNakshaOpen(old => !old) }}><Database size={16}/> Arkavathi River Data {activePanelLeaves.length > 0 && <span>{activePanelLeaves.length}</span>}</button>}
      </div>
      <div className="ark-atlas-map-controls" aria-label="Basemap controls"><div className="ark-atlas-basemap"><button className={basemap === 'street' ? 'is-selected' : ''} aria-pressed={basemap === 'street'} onClick={() => setBasemap('street')}>Street map</button><button className={basemap === 'satellite' ? 'is-selected' : ''} aria-pressed={basemap === 'satellite'} onClick={() => setBasemap('satellite')}>Satellite</button><button className={`ark-atlas-streetview-toggle${streetStage !== 'off' ? ' is-selected' : ''}`} aria-pressed={streetStage !== 'off'} aria-label="Street View" data-atlas-street="toggle" title={streetStage === 'off' ? 'Select a location for Street View' : 'Exit Street View'} onClick={toggleStreetView}><PersonStanding size={14}/> Street View</button></div><button className="ark-atlas-fit" onClick={focusBasin} aria-label="Fit basin boundary" title="Fit basin boundary"><LocateFixed size={17}/></button></div>
      {nakshaSurveyAccess && <>

        {nakshaOpen && <section className="ark-atlas-naksha-panel" aria-label="Arkavathi River Data panel">
          <div className="ark-atlas-naksha-head"><div><small>River project layers</small><h2>Arkavathi River Data</h2><p>Arkavathi River Project</p></div><button aria-label="Close Arkavathi River Data" onClick={() => setNakshaOpen(false)}><X size={17}/></button></div>
          {nakshaCatalogueError && <p className="ark-atlas-naksha-error" role="alert">{nakshaCatalogueError}</p>}
          <div className="ark-atlas-naksha-list">
            {!nakshaCatalogue.length && !nakshaCatalogueError && <p className="ark-atlas-naksha-empty">Loading survey datasets…</p>}
            {PANEL_ROWS.map(row =>
              row.kind === 'group' ? renderPanelGroup(row)
                : row.kind === 'section' ? renderPanelSection(row)
                  : renderPanelLeaf(row))}
          </div>
          <div className="ark-atlas-naksha-actions">
            <button onClick={fitSelectedDataPanel} disabled={!activePanelLeaves.length}><LocateFixed size={14}/> Fit Selected</button>
            <button onClick={clearDataPanelLayers} disabled={!activePanelLeaves.length}>Clear Layers</button>
          </div>
        </section>}
      </>}
      <div className="ark-atlas-map-caption">ARKAVATHI BASIN <span>•</span> {activeLayers.length} layers visible</div>
      {streetStage === 'selecting' && <div className="ark-atlas-street-banner" role="status" data-atlas-street="selection-banner"><span><PersonStanding size={15}/> Click a road on the map to select a Street View location · Press Esc to cancel</span><button type="button" onClick={exitStreetView} data-atlas-street="cancel">Cancel</button></div>}
      {streetStage === 'viewing' && streetLocation && <div className="ark-atlas-streetview" data-atlas-street="panel">
        <div className="ark-atlas-streetview-bar"><strong>Street View</strong><small>{streetLocation.lat.toFixed(6)}, {streetLocation.lng.toFixed(6)}</small><button type="button" onClick={exitStreetView} data-atlas-street="exit" aria-label="Exit Street View" title="Exit Street View"><X size={14}/> Exit Street View</button></div>
        <StreetViewPanel location={streetLocation} onLocationChange={setStreetLocation} active providers={['google', 'kartaview']} defaultProvider={HAS_GOOGLE_MAPS_KEY ? 'google' : 'kartaview'} onPanoramaChange={handlePanoramaChange}/>
      </div>}
      {selection && <section className="ark-atlas-detail" aria-label="Selected GIS feature"><div className="ark-atlas-detail-head"><div><small>{selection.layer.name}</small><h2>{featureName(selection)}</h2></div><button onClick={clearSelection} aria-label="Close feature details"><X size={18}/></button></div><div className="ark-atlas-detail-fields">{(FIELDS[selection.layer.key] || Object.keys(selection.feature.properties || {})).filter(key => useful(selection.feature.properties?.[key])).map(key => <div key={key}><span>{fieldLabel(key)}</span><strong>{displayValue(selection.feature.properties?.[key])}</strong></div>)}</div><div className="ark-atlas-detail-actions"><button onClick={zoomSelection}>Zoom to feature</button>{selection.layer.key === 'evidence' && safeEvidenceUrl(selection.feature.properties?.evidenceUrl) && <a href={safeEvidenceUrl(selection.feature.properties?.evidenceUrl)!} target="_blank" rel="noopener noreferrer">View evidence →</a>}</div></section>}
      {nakshaSelection && <section className="ark-atlas-detail ark-atlas-naksha-detail" aria-label="Selected NakshaTech feature"><div className="ark-atlas-detail-head"><div><small>NakshaTech survey · {nakshaSelection.dataset.name}</small><h2>{nakshaFeatureName(nakshaSelection)}</h2></div><button onClick={clearNakshaSelection} aria-label="Close NakshaTech feature details"><X size={18}/></button></div><div className="ark-atlas-detail-fields">{nakshaDetailFields(nakshaSelection.feature.properties).map(([key, value]) => <div key={key}><span>{fieldLabel(key)}</span><strong>{displayValue(value)}</strong></div>)}</div><p className="ark-atlas-naksha-crs">Source CRS: {nakshaSelection.dataset.source_crs || 'Unknown'} · Display: EPSG:4326</p></section>}
    </div>
  </div>
}

type SurveySurveyCardProps = {
  engine: SurveyPlaybackEngine
  datasets: SurveyDataset[]
  dataset: SurveyDataset | null
  track: SurveyTrack | null
  datasetId: string
  trackId: string
  onSelectDataset: (id: string) => void
  onSelectTrack: (id: string) => void
  routeVisible: boolean
  onRouteVisibleChange: (value: boolean) => void
  surveyPointsVisible: boolean
  onSurveyPointsVisibleChange: (value: boolean) => void
  followPoint: boolean
  onFollowPointChange: (value: boolean) => void
  busy: boolean
  error: string
  onFiles: (files: File[]) => void
  onFitRoute: () => void
}

/**
 * Verified Survey card. Subscribes to the playback engine itself so the ~80ms
 * publish cadence while playing re-renders only this card, never the whole atlas.
 */
function SurveySurveyCard({
  engine, datasets, dataset, track, datasetId, trackId, onSelectDataset, onSelectTrack,
  routeVisible, onRouteVisibleChange, surveyPointsVisible, onSurveyPointsVisibleChange,
  followPoint, onFollowPointChange, busy, error, onFiles, onFitRoute,
}: SurveySurveyCardProps) {
  const playback = useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot)
  return (
    <section className="ark-atlas-survey" aria-label="Verified Survey playback">
      <div className="ark-atlas-survey-head">
        <h2>Verified Survey</h2>
        <label className={`ark-atlas-survey-load ${busy ? 'is-busy' : ''}`}>
          <Upload size={13}/>{busy ? 'Loading…' : 'Load KML/KMZ'}
          <input type="file" accept=".kml,.kmz" multiple aria-label="Load KML or KMZ" disabled={busy}
            onChange={event => { const files = Array.from(event.target.files || []); event.target.value = ''; onFiles(files) }}/>
        </label>
      </div>
      {error && <p className="ark-atlas-survey-error" role="alert">{error}</p>}
      {datasets.length > 0 && <select className="ark-atlas-survey-select" aria-label="Survey dataset" value={datasetId} onChange={event => onSelectDataset(event.target.value)}>
        {datasets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.totalPoints} pts</option>)}
      </select>}
      {dataset && <select className="ark-atlas-survey-select" aria-label="Survey track" value={trackId} onChange={event => onSelectTrack(event.target.value)}>
        {dataset.tracks.map(item => <option key={item.id} value={item.id}>{item.name} · {item.points.length} pts</option>)}
      </select>}
      <div className="ark-atlas-survey-toggles">
        <label><input type="checkbox" checked={routeVisible} onChange={event => onRouteVisibleChange(event.target.checked)} aria-label="Survey route visibility"/> Route</label>
        <label><input type="checkbox" checked={surveyPointsVisible} onChange={event => onSurveyPointsVisibleChange(event.target.checked)} aria-label="Survey points visibility"/> Points</label>
        <label><input type="checkbox" checked={followPoint} onChange={event => onFollowPointChange(event.target.checked)} aria-label="Follow current point"/> Follow</label>
      </div>
      {track ? <div className="ark-atlas-survey-playback">
        <div className="ark-atlas-survey-controls">
          <button type="button" className="ark-atlas-survey-play" disabled={playback.totalPoints < 2}
            aria-label={playback.status === 'playing' ? 'Pause survey playback' : 'Play survey playback'}
            onClick={() => engine.toggle()}>
            {playback.status === 'playing' ? <Pause size={14}/> : <Play size={14}/>}
          </button>
          <button type="button" aria-label="Restart survey playback" title="Restart" onClick={() => { engine.restart(); engine.play() }}>
            <RotateCcw size={13}/>
          </button>
          <button type="button" className="ark-atlas-survey-fit" aria-label="Fit survey route" onClick={onFitRoute}>
            <LocateFixed size={13}/>Fit
          </button>
          <div className="ark-atlas-survey-speeds" role="group" aria-label="Playback speed">
            {PLAYBACK_SPEEDS.map(speed => (
              <button key={speed} type="button" className={playback.speed === speed ? 'is-active' : ''}
                aria-label={`Playback speed ${speed}x`} aria-pressed={playback.speed === speed}
                onClick={() => engine.setSpeed(speed)}>{speed}×</button>
            ))}
          </div>
        </div>
        <input className="ark-atlas-survey-slider" type="range" min={0} max={1000} step={1}
          aria-label="Route progress" disabled={playback.totalPoints < 2}
          value={Math.round(playback.progress * 1000)}
          onChange={event => engine.seekFraction(Number(event.target.value) / 1000)}/>
        <div className="ark-atlas-survey-readout">
          <strong>Point {playback.position} / {playback.totalPoints}</strong>
          <span>{formatClock(playback.elapsed)} / {formatClock(playback.duration)}</span>
          {playback.timed && playback.timestamp !== null && <span title="Current timestamp (UTC)">{new Date(playback.timestamp).toISOString().slice(11, 19)}Z</span>}
          {playback.altitude !== null && <span title="Current altitude">{Math.round(playback.altitude)} m</span>}
        </div>
      </div> : <p className="ark-atlas-survey-hint">{datasets.length ? 'Select a track to begin playback.' : 'Load a KML or KMZ file to explore a verified survey route.'}</p>}
    </section>
  )
}

