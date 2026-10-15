/**
 * KML / KMZ survey route parsing for the Arkavathi GIS Atlas "Verified Survey" layer.
 *
 * Guarantees:
 *  - Source document order is preserved exactly (never sorted, never spatially reordered).
 *  - Every valid coordinate of the selected route is retained for playback, including
 *    routes with tens of thousands of points.
 *  - A single malformed coordinate is skipped without breaking the remaining file.
 */

export type SurveyRoutePoint = {
  lon: number
  lat: number
  altitude: number | null
  timestamp: number | null
  sourceIndex: number
}

export type SurveyTrack = {
  id: string
  name: string
  points: SurveyRoutePoint[]
  sourceFile: string
}

export type SurveyDataset = {
  id: string
  name: string
  fileName: string
  tracks: SurveyTrack[]
  totalPoints: number
  skippedPoints: number
  timedPoints: number
}

export class SurveyParseError extends Error {}

const MAX_UNCOMPRESSED_BYTES = 160 * 1024 * 1024

type ParseCounter = { skipped: number }

function localName(element: Element): string {
  const name = element.localName || element.tagName || ''
  return name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
}

function tagOf(element: Element): string {
  return localName(element).toLowerCase()
}

function isTag(element: Element, name: string): boolean {
  return tagOf(element) === name.toLowerCase()
}

function childrenByName(parent: Element, name: string): Element[] {
  return Array.from(parent.children).filter(child => isTag(child, name))
}

function descendantsByName(root: Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName('*')).filter(element => isTag(element, name))
}

function firstText(element: Element | null | undefined): string {
  return element?.textContent?.trim() ?? ''
}

function validLon(lon: number): boolean {
  return Number.isFinite(lon) && lon >= -180 && lon <= 180
}

function validLat(lat: number): boolean {
  return Number.isFinite(lat) && lat >= -90 && lat <= 90
}

/** Builds a validated route point, or returns null when the record must be skipped. */
export function buildRoutePoint(
  lon: number,
  lat: number,
  altitude: number | null,
  timestamp: number | null,
  sourceIndex: number,
): SurveyRoutePoint | null {
  if (!validLon(lon) || !validLat(lat)) return null
  return {
    lon,
    lat,
    altitude: altitude !== null && Number.isFinite(altitude) ? altitude : null,
    timestamp: timestamp !== null && Number.isFinite(timestamp) ? timestamp : null,
    sourceIndex,
  }
}

function parseAltitude(raw: string | undefined): number | null {
  if (raw === undefined || raw === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function parseWhen(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Parses a KML `<coordinates>` block.
 * Format: whitespace separated `lon,lat[,alt]` tuples, kept in source order.
 */
export function parseKmlCoordinates(raw: string, counter: ParseCounter = { skipped: 0 }): SurveyRoutePoint[] {
  const points: SurveyRoutePoint[] = []
  const tokens = raw.trim().split(/\s+/)
  let sourceIndex = 0
  for (const token of tokens) {
    if (!token) continue
    const current = sourceIndex
    sourceIndex += 1
    const parts = token.split(',')
    if (parts.length < 2 || parts[0] === '' || parts[1] === '') { counter.skipped += 1; continue }
    const point = buildRoutePoint(Number(parts[0]), Number(parts[1]), parseAltitude(parts[2]), null, current)
    if (point) points.push(point)
    else counter.skipped += 1
  }
  return points
}

/**
 * Parses a `gx:Track` element.
 * KML allows `<when>` and `<gx:coord>` in either interleaved order or grouped order
 * (all `<when>` first, then all `<gx:coord>`). The spec pairs the two lists by position:
 * the i-th `<when>` belongs to the i-th `<gx:coord>`. Both lists are therefore collected
 * independently and paired by index, preserving source coordinate order exactly.
 * Coordinates without a matching `<when>` (or with an unparseable one) stay untimed.
 */
export function parseGxTrack(element: Element, counter: ParseCounter = { skipped: 0 }): SurveyRoutePoint[] {
  const whens: (number | null)[] = []
  const coords: string[] = []
  for (const child of Array.from(element.children)) {
    const tag = tagOf(child)
    if (tag === 'when') whens.push(parseWhen(child.textContent ?? ''))
    else if (tag === 'coord') coords.push(firstText(child))
  }
  const points: SurveyRoutePoint[] = []
  for (let index = 0; index < coords.length; index += 1) {
    const parts = coords[index].split(/\s+/)
    if (parts.length < 2 || parts[0] === '' || parts[1] === '') { counter.skipped += 1; continue }
    const point = buildRoutePoint(Number(parts[0]), Number(parts[1]), parseAltitude(parts[2]), whens[index] ?? null, index)
    if (point) points.push(point)
    else counter.skipped += 1
  }
  return points
}

/**
 * Reads every `<Point>` geometry inside a Placemark (single Point or MultiGeometry of Points)
 * in document order. Optional `<TimeStamp>/<when>` values are paired with the points by index,
 * mirroring the gx:Track rule; on any count mismatch all timestamps are dropped rather than
 * risking a wrong pairing.
 */
function parsePointPlacemarks(placemark: Element, counter: ParseCounter): SurveyRoutePoint[] {
  const pointElements = descendantsByName(placemark, 'Point')
  if (!pointElements.length) return []
  const whens = descendantsByName(placemark, 'when').map(element => parseWhen(element.textContent ?? ''))
  const paired = whens.length === pointElements.length
  const points: SurveyRoutePoint[] = []
  for (let index = 0; index < pointElements.length; index += 1) {
    const coordinates = childrenByName(pointElements[index], 'coordinates')[0]
    if (!coordinates) continue
    const parsed = parseKmlCoordinates(coordinates.textContent ?? '', counter)
    if (!parsed.length) continue
    points.push({ ...parsed[0], timestamp: paired ? whens[index] : null })
  }
  return points
}

/**
 * Collects route geometries inside a Placemark in document order.
 * Handles MultiGeometry / gx:MultiTrack nesting without descending into nested Placemarks.
 */
function collectRouteGeometries(node: Element, out: Element[]): void {
  for (const child of Array.from(node.children)) {
    const tag = tagOf(child)
    if (tag === 'placemark') continue
    if (tag === 'linestring' || tag === 'track') {
      out.push(child)
      continue
    }
    if (tag === 'multigeometry' || tag === 'multitrack' || tag === 'container') {
      collectRouteGeometries(child, out)
      continue
    }
    if (child.children.length) collectRouteGeometries(child, out)
  }
}

function containerName(element: Element): string {
  for (let node: Element | null = element; node; node = node.parentElement) {
    const tag = tagOf(node)
    if (tag === 'folder' || tag === 'document') {
      const name = firstText(childrenByName(node, 'name')[0])
      if (name) return name
    }
  }
  return ''
}

function uniqueId(prefix: string, taken: Set<string>): string {
  let index = taken.size + 1
  let candidate = `${prefix}-${index}`
  while (taken.has(candidate)) {
    index += 1
    candidate = `${prefix}-${index}`
  }
  taken.add(candidate)
  return candidate
}

/**
 * Parses KML text into survey tracks.
 *
 * Supported geometry:
 *  1. `<LineString><coordinates>`                 -> one track
 *  2. `<gx:Track><when> / <gx:coord>`             -> one track, timed when <when> exists
 *  3. `<gx:MultiTrack>` with nested `<gx:Track>`   -> one track per nested track
 *  4. `<MultiGeometry>` nesting any of the above   -> one track per nested geometry
 *  5. Ordered `<Point>` Placemarks                -> one track per parent Folder/Document,
 *                                                     kept in document order
 */
export function parseKmlText(text: string, fileName: string): SurveyDataset {
  if (!text.trim()) throw new SurveyParseError('The selected KML file is empty.')
  const documentNode = new DOMParser().parseFromString(text, 'application/xml')
  if (documentNode.querySelector('parsererror') || !documentNode.documentElement) {
    throw new SurveyParseError('This KML file could not be parsed as valid XML.')
  }

  const placemarks = descendantsByName(documentNode.documentElement, 'placemark')
  if (!placemarks.length) throw new SurveyParseError('No KML Placemark features were found in this file.')

  const counter: ParseCounter = { skipped: 0 }
  const taken = new Set<string>()
  const tracks: SurveyTrack[] = []
  const pointBuckets = new Map<string, SurveyRoutePoint[]>()

  const addTrack = (name: string, points: SurveyRoutePoint[]) => {
    if (!points.length) return
    tracks.push({ id: uniqueId('track', taken), name, points, sourceFile: fileName })
  }

  for (const placemark of placemarks) {
    const placemarkName = firstText(childrenByName(placemark, 'name')[0])
    const geometries: Element[] = []
    collectRouteGeometries(placemark, geometries)
    let shaped = 0

    for (const geometry of geometries) {
      const points = tagOf(geometry) === 'track'
        ? parseGxTrack(geometry, counter)
        : parseKmlCoordinates(firstText(childrenByName(geometry, 'coordinates')[0]), counter)
      if (!points.length) continue
      shaped += 1
      const suffix = shaped > 1 ? ` (${shaped})` : ''
      addTrack(`${placemarkName || `Track ${tracks.length + 1}`}${suffix}`, points)
    }

    // Points are collected regardless of line/track presence so MultiGeometry documents that
    // mix geometry kinds keep every coordinate. Placemarks without Points return [] cheaply.
    const pointOnly = parsePointPlacemarks(placemark, counter)
    if (pointOnly.length) {
      const key = containerName(placemark) || 'Survey Points'
      const bucket = pointBuckets.get(key)
      if (bucket) bucket.push(...pointOnly)
      else pointBuckets.set(key, [...pointOnly])
    }
  }

  for (const [name, points] of pointBuckets) addTrack(name, points)

  if (!tracks.length) {
    throw new SurveyParseError('This KML file contains no supported route geometry (LineString, gx:Track or ordered survey points).')
  }

  let totalPoints = 0
  let timedPoints = 0
  for (const track of tracks) {
    totalPoints += track.points.length
    for (const point of track.points) if (point.timestamp !== null) timedPoints += 1
  }

  return {
    id: 'dataset-1',
    name: fileName.replace(/\.(kml|kmz)$/i, ''),
    fileName,
    tracks,
    totalPoints,
    skippedPoints: counter.skipped,
    timedPoints,
  }
}

/* ------------------------------------------------------------------ KMZ ---- */

type ZipEntry = { name: string; offset: number; compressedSize: number; method: number }

function findEndOfCentralDirectory(view: DataView): number {
  const min = Math.max(0, view.byteLength - 66 * 1024)
  for (let offset = view.byteLength - 22; offset >= min; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset
  }
  return -1
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const Ctor = (globalThis as { DecompressionStream?: typeof DecompressionStream }).DecompressionStream
  if (!Ctor) throw new SurveyParseError('This browser cannot decompress KMZ archives. Please unzip the file and load the .kml instead.')
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new Ctor('deflate-raw'))
  const buffer = await new Response(stream).arrayBuffer()
  if (buffer.byteLength > MAX_UNCOMPRESSED_BYTES) throw new SurveyParseError('The KMZ archive expands beyond the supported size limit.')
  return new Uint8Array(buffer)
}

/** Reads the ZIP central directory of a KMZ archive and returns its primary KML document. */
export async function readKmzDocument(buffer: ArrayBuffer, fileName: string): Promise<string> {
  const view = new DataView(buffer)
  const eocd = findEndOfCentralDirectory(view)
  if (eocd < 0) throw new SurveyParseError('This KMZ file is not a readable ZIP archive.')
  const count = view.getUint16(eocd + 10, true)
  const directoryOffset = view.getUint32(eocd + 16, true)
  if (directoryOffset === 0xffffffff) throw new SurveyParseError('ZIP64 KMZ archives are not supported.')

  const entries: ZipEntry[] = []
  let pointer = directoryOffset
  for (let index = 0; index < count; index += 1) {
    if (pointer + 46 > view.byteLength || view.getUint32(pointer, true) !== 0x02014b50) break
    const method = view.getUint16(pointer + 10, true)
    const compressedSize = view.getUint32(pointer + 20, true)
    const nameLength = view.getUint16(pointer + 28, true)
    const extraLength = view.getUint16(pointer + 30, true)
    const commentLength = view.getUint16(pointer + 32, true)
    const offset = view.getUint32(pointer + 42, true)
    const name = new TextDecoder().decode(new Uint8Array(buffer, pointer + 46, nameLength))
    const base = name.split('/').pop() ?? ''
    if (/\.kml$/i.test(name) && !base.startsWith('.')) entries.push({ name, offset, compressedSize, method })
    pointer += 46 + nameLength + extraLength + commentLength
  }
  if (!entries.length) throw new SurveyParseError('No KML document was found inside this KMZ archive.')

  const preferred = entries.find(entry => /^doc\.kml$/i.test(entry.name.split('/').pop() ?? '')) ?? entries[0]
  if (view.getUint32(preferred.offset, true) !== 0x04034b50) throw new SurveyParseError('The KMZ archive contains a damaged KML entry.')
  const start = preferred.offset + 30 + view.getUint16(preferred.offset + 26, true) + view.getUint16(preferred.offset + 28, true)
  const raw = new Uint8Array(buffer, start, preferred.compressedSize)

  let text: string
  if (preferred.method === 0) text = new TextDecoder().decode(raw)
  else if (preferred.method === 8) text = new TextDecoder().decode(await inflateRaw(raw))
  else throw new SurveyParseError(`The KMZ archive uses an unsupported compression method (${preferred.method}).`)
  if (!text.trim()) throw new SurveyParseError(`${fileName} does not contain readable KML content.`)
  return text
}

/** Entry point used by the GIS Atlas: parses a local .kml or .kmz file in the browser. */
export async function parseSurveyFile(fileName: string, buffer: ArrayBuffer, datasetId = 'dataset-1'): Promise<SurveyDataset> {
  const text = /\.kmz$/i.test(fileName)
    ? await readKmzDocument(buffer, fileName)
    : new TextDecoder().decode(new Uint8Array(buffer))
  const dataset = parseKmlText(text, fileName)
  return { ...dataset, id: datasetId, name: fileName.replace(/\.(kml|kmz)$/i, '') }
}