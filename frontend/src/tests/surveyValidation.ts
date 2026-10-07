/**
 * Deterministic validation suite for the Verified Survey KML/KMZ parser and playback model.
 * Runs in the browser (DOMParser + DecompressionStream are browser APIs) via
 * frontend/survey-tests.html -> src/tests/surveyValidationEntry.ts.
 * No test framework is used (none exists in this repo); every check throws on failure.
 */
import { parseKmlText, parseSurveyFile, SurveyParseError, type SurveyRoutePoint } from '../lib/surveyRouteParser'
import { buildSurveyTimeline } from '../lib/surveyPlayback'

export type ValidationResult = { name: string; pass: boolean; detail: string }

const kml = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">\n${body}\n</kml>`

// Embedded KMZ fixtures (byte-identical to patch_backups/.../fixtures, see make-fixtures.cjs).
const KMZ_STORED_B64 = 'UEsDBBQAAAAAAAAAAADRwVh3NwEAADcBAAAHAAAAZG9jLmttbDw/eG1sIHZlcnNpb249IjEuMCIgZW5jb2Rpbmc9IlVURi04Ij8+CjxrbWwgeG1sbnM9Imh0dHA6Ly93d3cub3Blbmdpcy5uZXQva21sLzIuMiIgeG1sbnM6Z3g9Imh0dHA6Ly93d3cuZ29vZ2xlLmNvbS9rbWwvZXh0LzIuMiI+CjxEb2N1bWVudD48bmFtZT5LTVogUm91dGU8L25hbWU+PFBsYWNlbWFyaz48bmFtZT5LTVogTGluZTwvbmFtZT48TGluZVN0cmluZz48Y29vcmRpbmF0ZXM+NzcuMDUsMTMuMDUgNzcuMDYsMTMuMDYgNzcuMDcsMTMuMDc8L2Nvb3JkaW5hdGVzPjwvTGluZVN0cmluZz48L1BsYWNlbWFyaz48L0RvY3VtZW50Pgo8L2ttbD4KUEsDBBQAAAAAAAAAAACkCQd6CAAAAAgAAAAPAAAAaW1hZ2VzL2ljb24ucG5niVBORw0KGgpQSwMEFAAAAAAAAAAAAJ8ux4oUAQAAFAEAAAkAAABvdGhlci5rbWw8P3htbCB2ZXJzaW9uPSIxLjAiIGVuY29kaW5nPSJVVEYtOCI/Pgo8a21sIHhtbG5zPSJodHRwOi8vd3d3Lm9wZW5naXMubmV0L2ttbC8yLjIiIHhtbG5zOmd4PSJodHRwOi8vd3d3Lmdvb2dsZS5jb20va21sL2V4dC8yLjIiPgo8RG9jdW1lbnQ+PG5hbWU+RGVjb3k8L25hbWU+PFBsYWNlbWFyaz48bmFtZT5EZWNveTwvbmFtZT48TGluZVN0cmluZz48Y29vcmRpbmF0ZXM+MCwwIDEsMTwvY29vcmRpbmF0ZXM+PC9MaW5lU3RyaW5nPjwvUGxhY2VtYXJrPjwvRG9jdW1lbnQ+Cjwva21sPgpQSwECFAAUAAAAAAAAAAAA0cFYdzcBAAA3AQAABwAAAAAAAAAAAAAAAAAAAAAAZG9jLmttbFBLAQIUABQAAAAAAAAAAACkCQd6CAAAAAgAAAAPAAAAAAAAAAAAAAAAAFwBAABpbWFnZXMvaWNvbi5wbmdQSwECFAAUAAAAAAAAAAAAny7HihQBAAAUAQAACQAAAAAAAAAAAAAAAACRAQAAb3RoZXIua21sUEsFBgAAAAADAAMAqQAAAMwCAAAAAA=='
const KMZ_DEFLATED_B64 = 'UEsDBBQAAAAIAAAAAADRwVh3yQAAADcBAAAHAAAAZG9jLmttbFWOTU/DMAyG7/0VUc4Qd0Nb0eRmF8QFkBAfF25VZoWoiT21Ge3PRw3SVG6P5ee1XzzOKaofGsYg3OqNqbUidnIK7Fv9+fF4e6+PtsI+RTWnyGOrv3M+HwCmaTJyJvZhNEwZ+hRha7b6Tzv4+Z/pRXwk4yQVkeZcZFvhg7hLIs4WuUtkn16+1JtcMiGUGV9j5yh1Q78SngNf9wu/5yGwt+hEhlPgLtNom8bUu5vNnal3auF94X3hpnCDsA4grE/B6i9cO1a41LfVL1BLAQIUABQAAAAIAAAAAADRwVh3yQAAADcBAAAHAAAAAAAAAAAAAAAAAAAAAABkb2Mua21sUEsFBgAAAAABAAEANQAAAO4AAAAAAA=='
const KMZ_NO_KML_B64 = 'UEsDBBQAAAAAAAAAAACGphA2BQAAAAUAAAAKAAAAcmVhZG1lLnR4dGhlbGxvUEsBAhQAFAAAAAAAAAAAAIamEDYFAAAABQAAAAoAAAAAAAAAAAAAAAAAAAAAAHJlYWRtZS50eHRQSwUGAAAAAAEAAQA4AAAALQAAAAAA'

function b64ToBuffer(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function expectEq<T>(actual: T, expected: T, label: string): void {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`${label}: expected ${e}, got ${a}`)
}

function expectClose(actual: number, expected: number, epsilon: number, label: string): void {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > epsilon) {
    throw new Error(`${label}: expected ${expected} ±${epsilon}, got ${actual}`)
  }
}

function first(points: SurveyRoutePoint[]): SurveyRoutePoint { return points[0] }
function middle(points: SurveyRoutePoint[]): SurveyRoutePoint { return points[Math.floor((points.length - 1) / 2)] }
function last(points: SurveyRoutePoint[]): SurveyRoutePoint { return points[points.length - 1] }

/** Same deterministic spiral as make-fixtures.cjs (generated-10500.kml). */
function generatedSpiral(count: number): string {
  let coords = ''
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1)
    const angle = t * Math.PI * 8
    const radius = 0.0005 + t * 0.05
    coords += `${(77.5 + radius * Math.cos(angle)).toFixed(6)},${(13.5 + radius * Math.sin(angle)).toFixed(6)},${100 + (i % 900)}\n`
  }
  return coords
}

/** Same deterministic generator as make-fixtures.cjs (route-8426.kml): 8,426 valid + 2 malformed. */
function verified8426(): string {
  let coords = ''
  for (let i = 0; i < 8426; i += 1) {
    const t = i / 8425
    const lon = 77.3 + t * 0.2 + Math.sin(t * Math.PI * 6) * 0.004
    const lat = 13.2 + t * 0.15 + Math.cos(t * Math.PI * 6) * 0.004
    coords += `${lon.toFixed(6)},${lat.toFixed(6)},${200 + (i % 700)}\n`
    if (i === 100) coords += 'malformed-token\n'
    if (i === 5000) coords += '999,999\n'
  }
  return coords
}

/* ------------------------------------------------------------------ cases -- */

const cases: { name: string; run: () => void | Promise<void> }[] = [
  {
    name: '1. LineString with 5 points keeps order and altitudes',
    run: () => {
      const text = kml(`<Document><Placemark><name>Five</name><LineString><coordinates>
77.0000,13.0000,100 77.0100,13.0100,110 77.0200,13.0200,120 77.0300,13.0300,130 77.0400,13.0400,140
</coordinates></LineString></Placemark></Document>`)
      const dataset = parseKmlText(text, 'linestring-5.kml')
      expectEq(dataset.tracks.length, 1, 'track count')
      expectEq(dataset.totalPoints, 5, 'total points')
      expectEq(dataset.skippedPoints, 0, 'skipped')
      const p = dataset.tracks[0].points
      expectEq(p.map(x => x.lon), [77, 77.01, 77.02, 77.03, 77.04], 'lon order')
      expectEq(p[0].altitude, 100, 'first altitude')
      expectEq(p[4].altitude, 140, 'last altitude')
      expectEq(p[0].sourceIndex, 0, 'sourceIndex starts at 0')
      expectEq(p[4].sourceIndex, 4, 'sourceIndex ends at 4')
    },
  },
  {
    name: '2. malformed coordinates are skipped without breaking valid neighbours',
    run: () => {
      const text = kml(`<Document><Placemark><name>Mixed</name><LineString><coordinates>
77.00,13.00 not-a-coordinate 77.01,13.01 999,999 77.02,13.02 77.03, ,13.03 77.04,13.04
</coordinates></LineString></Placemark></Document>`)
      const dataset = parseKmlText(text, 'malformed-mix.kml')
      expectEq(dataset.totalPoints, 4, 'valid points')
      expectEq(dataset.skippedPoints, 4, 'skipped points')
      const p = dataset.tracks[0].points
      // Source indices prove original positions were preserved (gaps where tokens were skipped).
      expectEq(p.map(x => x.sourceIndex), [0, 2, 4, 7], 'sourceIndex gaps preserved')
      expectEq(p.map(x => [x.lon, x.lat]), [[77, 13], [77.01, 13.01], [77.02, 13.02], [77.04, 13.04]], 'valid coords in order')
    },
  },
  {
    name: '3. gx:Track with ALL <when> first pairs T_i to coord_i',
    run: () => {
      const text = kml(`<Document><Placemark><name>Grouped</name><gx:Track>
<when>2025-01-01T00:00:00Z</when><when>2025-01-01T00:00:10Z</when><when>2025-01-01T00:00:20Z</when>
<gx:coord>77.50 13.50 500</gx:coord><gx:coord>77.51 13.51 510</gx:coord><gx:coord>77.52 13.52 520</gx:coord>
</gx:Track></Placemark></Document>`)
      const dataset = parseKmlText(text, 'track-grouped-whens.kml')
      expectEq(dataset.tracks.length, 1, 'track count')
      const p = dataset.tracks[0].points
      expectEq(p.length, 3, 'point count')
      expectEq(p.map(x => x.lon), [77.5, 77.51, 77.52], 'coord order preserved')
      // Critical pairing assertion: timestamps follow coordinate order, not "last <when> wins".
      expectEq(p[0].timestamp, Date.parse('2025-01-01T00:00:00Z'), 'T1 with coord 1')
      expectEq(p[1].timestamp, Date.parse('2025-01-01T00:00:10Z'), 'T2 with coord 2')
      expectEq(p[2].timestamp, Date.parse('2025-01-01T00:00:20Z'), 'T3 with coord 3')
      expectEq(p.map(x => x.altitude), [500, 510, 520], 'altitudes')
      expectEq(dataset.timedPoints, 3, 'all timed')
    },
  },
  {
    name: '4. gx:Track without timestamps stays untimed but complete',
    run: () => {
      const text = kml(`<Document><Placemark><name>Untimed</name><gx:Track>
<gx:coord>77.60 13.60 10</gx:coord><gx:coord>77.61 13.61 20</gx:coord>
<gx:coord>77.62 13.62 30</gx:coord><gx:coord>77.63 13.63 40</gx:coord>
</gx:Track></Placemark></Document>`)
      const dataset = parseKmlText(text, 'track-untimed.kml')
      const p = dataset.tracks[0].points
      expectEq(p.length, 4, 'point count')
      expect(p.every(x => x.timestamp === null), 'no timestamps expected')
      expectEq(dataset.timedPoints, 0, 'timed count')
      expectEq(p.map(x => x.lon), [77.6, 77.61, 77.62, 77.63], 'coord order')
      const timeline = buildSurveyTimeline(dataset.tracks[0])!
      expectEq(timeline.timed, false, 'timeline untimed')
      expectEq(timeline.totalPoints, 4, 'timeline retains all points')
    },
  },
  {
    name: '5. MultiGeometry yields line + track + point tracks',
    run: () => {
      const text = kml(`<Document><Placemark><name>Mixed Geometry</name><MultiGeometry>
<LineString><coordinates>77.10,13.10 77.11,13.11 77.12,13.12</coordinates></LineString>
<gx:Track><gx:coord>77.20 13.20 5</gx:coord><gx:coord>77.21 13.21 6</gx:coord></gx:Track>
<Point><coordinates>77.30,13.30,9</coordinates></Point>
</MultiGeometry></Placemark></Document>`)
      const dataset = parseKmlText(text, 'multigeometry.kml')
      expectEq(dataset.tracks.length, 3, 'three geometry tracks')
      expectEq(dataset.tracks[0].points.length, 3, 'linestring points')
      expectEq(dataset.tracks[1].points.length, 2, 'track points')
      expectEq(dataset.tracks[1].points[0].lon, 77.2, 'track first lon')
      expectEq(dataset.tracks[2].points.length, 1, 'point geometry kept')
      expectEq(dataset.tracks[2].points[0].lon, 77.3, 'point lon')
      expectEq(dataset.tracks[2].points[0].altitude, 9, 'point altitude')
      expectEq(dataset.totalPoints, 6, 'total points')
    },
  },
  {
    name: '6. gx:MultiTrack with two nested tracks plus another placemark',
    run: () => {
      const text = kml(`<Document>
<Placemark><name>Pair</name><gx:MultiTrack>
<gx:Track><gx:coord>77.70 13.70 1</gx:coord><gx:coord>77.71 13.71 2</gx:coord><gx:coord>77.72 13.72 3</gx:coord></gx:Track>
<gx:Track><gx:coord>77.80 13.80 4</gx:coord><gx:coord>77.81 13.81 5</gx:coord></gx:Track>
</gx:MultiTrack></Placemark>
<Placemark><name>Second Line</name><LineString><coordinates>77.90,13.90 77.91,13.91</coordinates></LineString></Placemark>
</Document>`)
      const dataset = parseKmlText(text, 'multitrack.kml')
      expectEq(dataset.tracks.length, 3, 'three tracks')
      expectEq(dataset.tracks.map(t => t.points.length), [3, 2, 2], 'per-track counts')
      expectEq(dataset.totalPoints, 7, 'total points')
      expectEq(dataset.tracks[0].name, 'Pair', 'first track name')
      expectEq(dataset.tracks[1].name, 'Pair (2)', 'second track name suffixed')
      expectEq(dataset.tracks[2].name, 'Second Line', 'second placemark name')
      expectEq(dataset.tracks[2].points[0].lon, 77.9, 'second placemark first lon')
    },
  },
  {
    name: '7. one-point route parses and builds a safe timeline',
    run: () => {
      const text = kml(`<Document><Placemark><name>Solo</name><Point><coordinates>77.40,13.40,42</coordinates></Point></Placemark></Document>`)
      const dataset = parseKmlText(text, 'one-point.kml')
      expectEq(dataset.totalPoints, 1, 'one point')
      const timeline = buildSurveyTimeline(dataset.tracks[0])!
      expectEq(timeline.totalPoints, 1, 'timeline point count')
      expectEq(timeline.duration, 0, 'duration zero')
      const sample = timeline.sampleAt(0)
      expectEq(sample.index, 0, 'sample index')
      expectClose(sample.lon, 77.4, 1e-12, 'sample lon')
      expectEq(timeline.sampleAt(9999).index, 0, 'over-range clamps to single point')
    },
  },
  {
    name: '8. two-point route interpolates between endpoints only',
    run: () => {
      const text = kml(`<Document><Placemark><name>Pair</name><LineString><coordinates>77.45,13.45 77.46,13.46</coordinates></LineString></Placemark></Document>`)
      const dataset = parseKmlText(text, 'two-point.kml')
      const timeline = buildSurveyTimeline(dataset.tracks[0])!
      expectEq(timeline.totalPoints, 2, 'two points retained')
      const mid = timeline.sampleAt(timeline.duration / 2)
      expectClose(mid.lon, 77.455, 1e-9, 'midpoint lon')
      expectClose(mid.lat, 13.455, 1e-9, 'midpoint lat')
      expectClose(timeline.sampleAt(0).lon, 77.45, 1e-12, 'start lon')
      expectClose(timeline.sampleAt(timeline.duration).lon, 77.46, 1e-12, 'end lon')
    },
  },
  {
    name: '9. 10,500-point generated route parsed fully (no downsampling)',
    run: () => {
      const text = kml(`<Document><Placemark><name>Generated</name><LineString><coordinates>${generatedSpiral(10500)}</coordinates></LineString></Placemark></Document>`)
      const started = performance.now()
      const dataset = parseKmlText(text, 'generated-10500.kml')
      const elapsed = performance.now() - started
      expectEq(dataset.totalPoints, 10500, 'all 10,500 points parsed')
      expectEq(dataset.skippedPoints, 0, 'no skips')
      const points = dataset.tracks[0].points
      const timeline = buildSurveyTimeline(dataset.tracks[0])!
      expectEq(timeline.totalPoints, 10500, 'timeline retains all 10,500 points')
      // First / middle / last source coordinates must equal the playback samples.
      expectClose(timeline.sampleAt(0).lon, points[0].lon, 1e-12, 'first lon')
      expectClose(timeline.sampleAt(0).lat, points[0].lat, 1e-12, 'first lat')
      const midIndex = Math.floor((10500 - 1) / 2)
      const midSample = timeline.sampleAt(timeline.duration * (midIndex / (10500 - 1)))
      // Float progress can land within an ulp of the integer boundary; index may be off by one
      // at ratio≈0 or ratio≈1, but the sampled coordinate must equal the source middle point.
      expect(Math.abs(midSample.index - midIndex) <= 1, `middle index near ${midIndex}, got ${midSample.index}`)
      expectClose(midSample.lon, points[midIndex].lon, 1e-9, 'middle lon')
      expectClose(midSample.lat, points[midIndex].lat, 1e-9, 'middle lat')
      expectClose(timeline.sampleAt(timeline.duration).lon, points[10499].lon, 1e-12, 'last lon')
      expectClose(timeline.sampleAt(timeline.duration).lat, points[10499].lat, 1e-12, 'last lat')
      if (elapsed > 4000) throw new Error(`parse took ${Math.round(elapsed)}ms (>4s)`)
    },
  },
  {
    name: '10. gx:Track first/middle/last coordinates preserved end-to-end',
    run: () => {
      // Interleaved (spec-canonical) layout: <when> and <gx:coord> alternate.
      const n = 101
      const baseTime = Date.UTC(2025, 1, 1, 0, 0, 0)
      let body = ''
      for (let i = 0; i < n; i += 1) {
        const lon = (77 + i * 0.001).toFixed(4)
        const lat = (13 + i * 0.001).toFixed(4)
        body += `<when>${new Date(baseTime + i * 1000).toISOString()}</when><gx:coord>${lon} ${lat} ${100 + i}</gx:coord>\n`
      }
      const text = kml(`<Document><Placemark><name>Interleaved</name><gx:Track>${body}</gx:Track></Placemark></Document>`)
      const dataset = parseKmlText(text, 'track-interleaved-101.kml')
      const points = dataset.tracks[0].points
      expectEq(points.length, n, '101 points')
      expectEq(dataset.timedPoints, n, 'all timed')
      expectClose(points[0].lon, 77, 1e-9, 'source first lon')
      expectClose(points[50].lon, 77.05, 1e-9, 'source middle lon')
      expectClose(points[100].lon, 77.1, 1e-9, 'source last lon')
      expectEq(points[0].timestamp, baseTime, 'first timestamp')
      expectEq(points[100].timestamp, baseTime + 100000, 'last timestamp')
      const timeline = buildSurveyTimeline(dataset.tracks[0])!
      expectEq(timeline.totalPoints, points.length, 'playback count = parsed count')
      // Playback equality: source first/middle/last must equal playback samples.
      expectClose(timeline.sampleAt(0).lon, points[0].lon, 1e-12, 'playback first lon')
      const mid = timeline.sampleAt(timeline.duration / 2)
      expectClose(mid.lon, points[50].lon, 1e-9, 'playback middle lon')
      expectClose(mid.lat, points[50].lat, 1e-9, 'playback middle lat')
      expectClose(timeline.sampleAt(timeline.duration).lon, points[100].lon, 1e-12, 'playback last lon')
    },
  },
  {
    name: '11. 8,426-coordinate route: playback retains every valid point',
    run: () => {
      const text = kml(`<Document><Placemark><name>Verified 8426</name><LineString><coordinates>${verified8426()}</coordinates></LineString></Placemark></Document>`)
      const dataset = parseKmlText(text, 'route-8426.kml')
      expectEq(dataset.totalPoints, 8426, 'parsed valid count = 8426')
      expectEq(dataset.skippedPoints, 2, 'two malformed tokens skipped')
      const points = dataset.tracks[0].points
      const timeline = buildSurveyTimeline(dataset.tracks[0])!
      expectEq(timeline.totalPoints, 8426, 'playback totalPoints = parsed count')
      // Required equality: source first/middle/last = playback first/middle/last.
      expectClose(timeline.sampleAt(0).lon, points[0].lon, 1e-12, 'source first = playback first (lon)')
      expectClose(timeline.sampleAt(0).lat, points[0].lat, 1e-12, 'source first = playback first (lat)')
      const midIndex = Math.floor((8426 - 1) / 2)
      const mid = timeline.sampleAt(timeline.duration * (midIndex / (8426 - 1)))
      expect(Math.abs(mid.index - midIndex) <= 1, `middle index near ${midIndex}, got ${mid.index}`)
      expectClose(mid.lon, points[midIndex].lon, 1e-9, 'source middle = playback middle (lon)')
      expectClose(mid.lat, points[midIndex].lat, 1e-9, 'source middle = playback middle (lat)')
      expectClose(timeline.sampleAt(timeline.duration).lon, points[8425].lon, 1e-12, 'source last = playback last (lon)')
      expectClose(timeline.sampleAt(timeline.duration).lat, points[8425].lat, 1e-12, 'source last = playback last (lat)')
      // Spot check that no downsampling happened anywhere in the middle of the sequence.
      for (const i of [1, 101, 4000, 5001, 8424]) {
        const sample = timeline.sampleAt(timeline.duration * (i / (8426 - 1)))
        expectClose(sample.lon, points[i].lon, 1e-6, `point ${i} retained (lon)`)
      }
    },
  },
  {
    name: '12. KMZ (stored) selects doc.kml and ignores non-KML entries',
    run: async () => {
      const dataset = await parseSurveyFile('route-stored.kmz', b64ToBuffer(KMZ_STORED_B64), 'ds-kmz')
      expectEq(dataset.totalPoints, 3, 'doc.kml points')
      expectEq(dataset.tracks[0].points.map(p => p.lon), [77.05, 77.06, 77.07], 'doc.kml content used, not other.kml')
      expect(dataset.name === 'route-stored', 'dataset named from file')
    },
  },
  {
    name: '13. KMZ (deflated method 8) inflates and parses',
    run: async () => {
      const dataset = await parseSurveyFile('route-deflated.kmz', b64ToBuffer(KMZ_DEFLATED_B64), 'ds-defl')
      expectEq(dataset.totalPoints, 3, 'deflated points')
      expectEq(dataset.tracks[0].points[0].lon, 77.05, 'deflated first lon')
    },
  },
  {
    name: '14. malformed KMZ and KMZ without KML throw SurveyParseError',
    run: async () => {
      let failed = false
      try { await parseSurveyFile('malformed.kmz', new TextEncoder().encode('this is definitely not a zip archive, just text padding...').buffer, 'ds-bad') }
      catch (error) { failed = error instanceof SurveyParseError }
      expect(failed, 'non-ZIP bytes must raise SurveyParseError')
      let failed2 = false
      try { await parseSurveyFile('no-kml.kmz', b64ToBuffer(KMZ_NO_KML_B64), 'ds-nokml') }
      catch (error) { failed2 = error instanceof SurveyParseError }
      expect(failed2, 'KMZ without KML must raise SurveyParseError')
    },
  },
  {
    name: '15. ordered Point placemarks keep document order per folder',
    run: () => {
      const text = kml(`<Document><name>Survey Points</name>
<Placemark><name>P1</name><Point><coordinates>77.01,13.01</coordinates></Point></Placemark>
<Placemark><name>P2</name><Point><coordinates>77.02,13.02</coordinates></Point></Placemark>
<Placemark><name>P3</name><Point><coordinates>77.03,13.03</coordinates></Point></Placemark>
</Document>`)
      const dataset = parseKmlText(text, 'points.kml')
      expectEq(dataset.tracks.length, 1, 'one bucket track')
      expectEq(dataset.tracks[0].name, 'Survey Points', 'bucket named by folder')
      expectEq(dataset.tracks[0].points.map(p => p.lon), [77.01, 77.02, 77.03], 'document order kept')
    },
  },
]

/** Runs every case and returns a structured report (never throws). */
export async function runSurveyValidation(): Promise<{ results: ValidationResult[]; passed: number; failed: number }> {
  const results: ValidationResult[] = []
  for (const testCase of cases) {
    try {
      await testCase.run()
      results.push({ name: testCase.name, pass: true, detail: 'ok' })
    } catch (error) {
      results.push({ name: testCase.name, pass: false, detail: error instanceof Error ? error.message : String(error) })
    }
  }
  const failed = results.filter(result => !result.pass).length
  return { results, passed: results.length - failed, failed }
}




