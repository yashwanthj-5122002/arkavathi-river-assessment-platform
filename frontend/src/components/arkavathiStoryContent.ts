// Story content for the public "Story of Arkavathi" landing section.
// Narrative text follows "Content of the story.docx" verbatim. Inline markup only
// adds emphasis and never changes the words:
//   **text**        -> highlighted name, date or fact
//   {{key:text}}    -> glossary term (definition in GLOSSARY[key])
// Every coordinate and bounding box below is taken from the public project
// datasets in /public/gis/arkavathi (rivers, waterbodies-major, sub-hydrosheds,
// evidence-points, prs-drains); none are hand-placed.

export type RiverId = 'arkavathi' | 'kumudavathi' | 'suvarnamukhi' | 'vrishabhavathi'
export type ReachId = 'source' | 'downstream' | 'stretch'
export type EvidenceGroup = 'paani' | 'research' | 'citizen'
export type PlaceKey =
  | 'source' | 'sangama' | 'kumConf' | 'vrishConf' | 'suvConf'
  | 'hesar' | 'tgh' | 'harobele' | 'peenya' | 'ramanagara' | 'kanakapura'
export type Bbox = [number, number, number, number]

/** Selects evidence points; every listed condition must match. `{}` selects all. */
export type EvidenceFilter = { groups?: EvidenceGroup[]; sheds?: string[]; sites?: string[]; contributors?: string[] }

export type FrameRef =
  | { kind: 'boundary' }
  | { kind: 'river'; ids: RiverId[] }
  | { kind: 'reach'; id: ReachId }
  | { kind: 'water'; names: string[] }
  | { kind: 'shed'; names: string[] }
  | ({ kind: 'evidence' } & EvidenceFilter)
  | { kind: 'drains' }
  | { kind: 'place'; key: PlaceKey; km: number }

export type Photo = { src: string; alt: string; caption: string }

/**
 * Everything one story stop shows on the map. Anything not listed is OFF:
 * no highlight, filter or marker carries over from another stop.
 */
export type Stop = {
  /** Paragraph index at which this stop takes over the map (0 = chapter start). */
  at: number
  title: string
  note: string
  basemap?: 'street' | 'satellite'
  /** 'full' draws the basin boundary at full weight; otherwise it is quiet context. */
  boundary?: 'full' | 'context'
  /** Rivers drawn at full weight in their permanent colours. */
  rivers?: RiverId[]
  /** Rivers drawn thin and faint, only for connection context. */
  riverContext?: RiverId[]
  /** A highlighted slice of the Arkavathi line. */
  reach?: ReachId
  /** Highlighted reservoirs (dataset names); `reservoirFocus` gets extra emphasis. */
  reservoirs?: string[]
  reservoirFocus?: string
  /** Other mapped lakes and tanks as faint context. */
  waterContext?: boolean
  /** true = all sub-hydroshed outlines; names = those catchments highlighted. */
  sheds?: true | string[]
  drainage?: boolean
  elevation?: boolean
  industrial?: boolean
  evidence?: EvidenceFilter
  drains?: boolean
  places?: PlaceKey[]
  /** One place marked with a quiet spotlight ring. */
  spotlight?: PlaceKey
  frame: FrameRef[]
  /** Bounds from the same datasets, used until the GeoJSON has loaded. */
  fallback: Bbox
  maxZoom?: number
  /** Primary photograph, plus an optional supporting inset of the same place. */
  photos?: [Photo] | [Photo, Photo]
}

export type Chapter = {
  eyebrow: string
  lead: string
  accent: string
  subline?: string
  quote?: string
  closingQuote?: string
  paragraphs: string[]
  /** A short interpretive note, kept separate from the original narrative. */
  why: string
  extraPhotos: Photo[]
  stops: Stop[]
  findings?: 'drains' | 'evidence'
}

const photo = (file: string, alt: string, caption: string): Photo => ({ src: `/photos/arkavathi/${file}`, alt, caption })

const ORIGIN = photo('arkavathi-origin-point.jpg', 'Stone marker and spring at the Arkavathi origin point', 'Arkavathi origin point. Supplied project reference photograph.')
const CONFLUENCE = photo('arkavathi-confluence-point.jpg', 'River at the Arkavathi–Cauvery confluence near Sangama, with a Kannada sign reading Cauvery Arkavathi river confluence', 'Arkavathi–Cauvery confluence near Sangama. The site sign is visible in the supplied photograph.')
const HESAR = photo('hesaraghatta-reservoir.jpg', 'Sunset over Hesaraghatta Reservoir', 'Hesaraghatta Reservoir. Supplied project reference photograph.')
const KUM_CONFLUENCE = photo('kumudavathi-confluence-point.jpg', 'Aerial view of the Kumudavathi and Arkavathi confluence near Thippagondanahalli Reservoir', 'Kumudavathi–Arkavathi confluence near Thippagondanahalli. Annotated aerial reference supplied with the project.')
const KUM_ORIGIN = photo('kumudavathi-origin-point.jpg', 'Spring and shrine structure at the Kumudhavathi origin', 'Kumudhavathi origin point. Supplied project reference photograph.')
const SUV_ORIGIN = photo('suvarnamukhi-origin-point.jpg', 'Temple tank at Suvarnamukhi, Kalyani', 'Suvarnamukhi Temple, Kalyani. Site label supplied with the image.')
const SUV_CONFLUENCE = photo('suvarnamukhi-confluence-point.jpg', 'Aerial view of the Suvarnamukhi and Vrishabhavathi confluence', 'Suvarnamukhi–Vrishabhavathi confluence. Annotated aerial reference supplied with the project.')
const THIPPA = photo('thippagondanahalli-reservoir.jpg', 'Aerial view of Thippagondanahalli Reservoir', 'Thippagondanahalli Reservoir. Annotated aerial reference supplied with the project.')
const VRISH_ORIGIN = photo('vrishabhavathi-origin-point.jpg', 'Aerial view of Sankey Tank and the Vrishabhavathi origin', 'Vrishabhavathi origin at Sankey Tank. Annotated aerial reference supplied with the project.')
const VRISH_CONFLUENCE = photo('vrishabhavathi-confluence-point.jpg', 'Aerial view of the Vrishabhavathi and Arkavathi confluence', 'Vrishabhavathi–Arkavathi confluence. Annotated aerial reference supplied with the project.')
const HESAR_1890 = photo('hesaraghatta-1890.jpg', 'Historical photograph of Hesaraghatta dam works, labelled 1890', 'Hesaraghatta dam works. Historical image carrying an 1890 label; the date is not independently verified.')
const HESAR_HISTORY = photo('hesaraghatta-history.jpg', 'Comparison view of Hesaraghatta in 1890 and 2013', 'Hesaraghatta then and now. Comparison labels are supplied with the image; dates are not independently verified.')
const TG_HISTORY = photo('tg-halli-history.jpg', 'Historical photograph of Thippagondanahalli dam under construction', 'Thippagondanahalli Dam under construction. Historical image; caption supplied with the image.')
const DOWNSTREAM = photo('arkavathi-downstream.jpg', 'Arkavathi river flowing between vegetated banks downstream', 'Arkavathi downstream reach. Supplied project reference photograph.')
const V200 = photo('v200-drain-peenya.jpg', 'Drain near Peenya Industrial Area with sewage and industrial effluent labels', 'Drain near Peenya Industrial Area. The sewage and industrial effluent labels are part of the supplied image.')
const VB_RIVER = photo('vrishabhavathi-river.jpg', 'Vrishabhavathi river in an urban reach', 'Vrishabhavathi River, urban reach. Supplied project reference photograph.')
const VB_RIVER_1 = photo('vrishabhavathi-river-1.jpg', 'Vrishabhavathi river beside a large stormwater outfall', 'Vrishabhavathi River and a stormwater outfall. Supplied project reference photograph.')
const VB_RIVER_2 = photo('vrishabhavathi-river-2.jpg', 'Vrishabhavathi river flowing beneath trees', 'Vrishabhavathi River. Supplied project reference photograph.')
const BIDADI = photo('vrishabhavathi-bidadi-industries.jpg', 'Rocky stretch of the Vrishabhavathi near Bidadi industries', 'Vrishabhavathi near the Bidadi industrial area. Supplied project reference photograph.')
const BYRAMANGALA = photo('vrishabhavathi-byramangala-foam.jpg', 'Aerial view of foaming water at Byramangala', 'Foaming water at Byramangala. Supplied project reference photograph.')
const DYE = photo('vrishabhavathi-dye-waste.jpg', 'Pink dye waste and solid waste beside a drain', 'Dye waste and solid waste entering a drain. Supplied project reference photograph.')
const FOAM = photo('vrishabhavathi-foam.jpg', 'Foaming water in the Vrishabhavathi river seen from a bridge', 'Foaming water in the Vrishabhavathi. Supplied project reference photograph.')
const OILY = photo('vrishabhavathi-oily-water.jpg', 'Oily water and accumulated waste along a channel', 'Oily water and accumulated waste. Supplied project reference photograph.')
const BOMMANAHALLI = photo('vrishabhavathi-bommanahalli.jpg', 'Polluted channel with solid waste in the Bommanahalli zone', 'Polluted channel, Bommanahalli Zone. The location name is supplied with the image.')
const INDUSTRIAL = photo('vrishabhavathi-industrial-effluent.jpg', 'Industrial effluent entering a river reach', 'Industrial effluent entering the Vrishabhavathi. Supplied project reference photograph.')
const SEWAGE = photo('vrishabhavathi-sewage.jpg', 'Sewage and waste at an outfall beneath a bridge', 'Sewage outfall beneath a bridge. Supplied project reference photograph.')
const POLLUTED = photo('vrishabhavathi-polluted-water.jpg', 'Polluted water and waste in a channel', 'Polluted water and accumulated waste. Supplied project reference photograph.')
const SOLID_WASTE = photo('vrishabhavathi-solid-waste.jpg', 'Solid waste dumped along a polluted channel', 'Solid waste along a polluted channel. Supplied project reference photograph.')

export const GLOSSARY: Record<string, { term: string; definition: string }> = {
  tributary: { term: 'Tributary', definition: 'A stream or river that flows into a larger river rather than directly into a lake or the sea.' },
  catchment: { term: 'Catchment', definition: 'The land area from which rainfall drains into a particular river, stream or reservoir.' },
  groundwater: { term: 'Groundwater extraction', definition: 'Pumping water from aquifers beneath the ground, usually through borewells, for drinking, farming or industry.' },
  drainage: { term: 'Drainage network', definition: 'The connected system of streams, channels and drains that carries water across a landscape toward a river.' },
  wastewater: { term: 'Wastewater', definition: 'Used water from homes, businesses and industries, including sewage, that carries contaminants.' },
  effluent: { term: 'Effluent', definition: 'Liquid waste discharged from an industrial process or a treatment facility.' },
  runoff: { term: 'Runoff', definition: 'Rainwater that flows over the land surface into drains and streams instead of soaking into the soil.' },
  sediment: { term: 'Sediment', definition: 'Soil, sand and other particles carried by water that settle on the bed of a river, lake or reservoir.' },
  rti: { term: 'RTI', definition: 'Right to Information: under the RTI Act, 2005, citizens in India can request information held by public authorities.' },
  bod: { term: 'BOD', definition: 'Biochemical Oxygen Demand: the oxygen that micro-organisms use while breaking down organic matter in water, reported in mg/L. Higher values mean more organic pollution.' },
  cod: { term: 'COD', definition: 'Chemical Oxygen Demand: the oxygen needed to chemically oxidise pollutants in water, reported in mg/L. It indicates the total load of oxidisable pollutants.' },
  do: { term: 'DO', definition: 'Dissolved Oxygen: the oxygen dissolved in water, reported in mg/L. Fish and other aquatic life need adequate DO; very low values signal severe pollution.' },
  subhydroshed: { term: 'Sub-hydroshed', definition: 'A smaller drainage unit within a river basin, delineated from terrain so that each unit drains to a common point.' },
}

export const RIVER_NAMES: Record<RiverId, string> = {
  arkavathi: 'Arkavathi', kumudavathi: 'Kumudavathi', suvarnamukhi: 'Suvarnamukhi', vrishabhavathi: 'Vrishabhavathi',
}
/** Permanent river identity colours; never changed between chapters. */
export const RIVER_COLORS: Record<RiverId, string> = {
  arkavathi: '#1677D2', kumudavathi: '#008F83', suvarnamukhi: '#BF8425', vrishabhavathi: '#8557A5',
}
export const EVIDENCE_COLORS: Record<EvidenceGroup, string> = { paani: '#1E3A5F', research: '#4A5560', citizen: '#B03A2E' }
export const EVIDENCE_LABELS: Record<EvidenceGroup, string> = {
  paani: 'Paani.Earth × ICCW sites (A–G)', research: 'Research study locations', citizen: 'Citizen & RTI discharge evidence',
}
/** Thematic map colours. The basemap itself keeps its natural provider colours. */
export const MAP_COLORS = {
  boundary: '#171C1A',
  reservoir: '#1CA3C9',
  reservoirLine: '#0A5C7A',
  waterContext: '#8FCFE0',
  drains: '#A93226',
  stretch: '#C0392B',
  drainage: '#3C8DBC',
  industrial: '#7A5C4A',
  shedLine: '#3D4542',
} as const

// Start and end vertices of the mapped Arkavathi line, confluence vertices shared
// by the river lines, reservoir bounding-box centres and drain-cluster centres.
export const PLACES: Record<PlaceKey, { name: string; at: [number, number]; side: 'left' | 'right' }> = {
  source: { name: 'Source · Nandi Hills region', at: [77.68013, 13.36363], side: 'right' },
  sangama: { name: 'Sangama · Cauvery confluence', at: [77.43237, 12.28698], side: 'left' },
  kumConf: { name: 'Kumudavathi joins Arkavathi', at: [77.33888, 12.97161], side: 'right' },
  vrishConf: { name: 'Vrishabhavathi joins Arkavathi', at: [77.40476, 12.59867], side: 'right' },
  suvConf: { name: 'Suvarnamukhi joins Vrishabhavathi', at: [77.41417, 12.66357], side: 'left' },
  hesar: { name: 'Hesaraghatta Reservoir · 1896', at: [77.4915, 13.1668], side: 'left' },
  tgh: { name: 'Thippagondanahalli Reservoir · 1933', at: [77.34215, 12.97705], side: 'right' },
  harobele: { name: 'Harobele Dam · Arkavathi Reservoir', at: [77.4546, 12.44705], side: 'left' },
  peenya: { name: 'Peenya Industrial Area', at: [77.53509, 13.02658], side: 'left' },
  ramanagara: { name: 'Ramanagara drains', at: [77.2795, 12.7232], side: 'right' },
  kanakapura: { name: 'Kanakapura drains', at: [77.427, 12.5494], side: 'left' },
}

// Reach anchors: the polluted stretch is listed in prs-drains.geojson as
// "Tippagondanahalli reservoir to Kanakapura Town (55km)". It is drawn on the
// mapped river between the Paani.Earth site downstream of TG Halli Reservoir and
// drain E-173 in Kanakapura, so it is an approximation of that listed extent.
export const STRETCH_FROM: [number, number] = [77.334566, 12.95379]
export const STRETCH_TO: [number, number] = [77.426847, 12.544858]
export const SOURCE_REACH_KM = 15

const BASIN: Bbox = [77.204, 12.2683, 77.6921, 13.388]
const ARKAVATHI: Bbox = [77.2768, 12.287, 77.6801, 13.3683]
const ALL_RIVERS: Bbox = [77.2292, 12.287, 77.6801, 13.3683]
const ALL_EVIDENCE: Bbox = [77.334566, 12.358112, 77.54965, 13.26351]
const DRAINS: Bbox = [77.276883, 12.544858, 77.428, 12.731908]
const VRISHABHAVATHI: Bbox = [77.4006, 12.5987, 77.575, 13.0076]
const BOTH_RESERVOIRS: Bbox = [77.3176, 12.948, 77.5064, 13.1927]
const ALL_FOUR: RiverId[] = ['arkavathi', 'kumudavathi', 'suvarnamukhi', 'vrishabhavathi']
const HESARAGHATTA = 'Hessarghatta Reservoir' // dataset spelling
const TG_HALLI = 'Thippagondanahalli Reservoir'

export const CHAPTERS: Chapter[] = [
  {
    eyebrow: 'The Opening',
    lead: 'The River Has a Story.',
    accent: 'Its Water Tells Another.',
    paragraphs: [
      "From the hills of **Nandi** to the waters of the **Cauvery**, Arkavathi's journey spans landscapes, {{tributary:tributaries}}, reservoirs, and generations of human connection.",
      'Once an important lifeline for **Bengaluru**, the river now carries the visible impact of changing landscapes and pollution.',
      'This is the story of Arkavathi — from its beginnings to the environmental challenges shaping its present and future.',
    ],
    why: 'A river is shaped by its whole basin. Seeing the basin boundary and all four rivers together explains why what happens on land, in tributaries and at reservoirs reaches the Arkavathi.',
    extraPhotos: [],
    stops: [
      {
        at: 0, title: 'The Arkavathi basin', note: 'The mapped basin boundary with the Arkavathi and its three tributaries.',
        boundary: 'full', rivers: ALL_FOUR, places: ['source', 'sangama'],
        frame: [{ kind: 'boundary' }], fallback: BASIN, photos: [DOWNSTREAM],
      },
    ],
  },
  {
    eyebrow: 'The Birthplace',
    lead: 'Where the Hills Become',
    accent: 'a River.',
    quote: "Every river has a beginning. Arkavathi's story begins in the hills of Nandi.",
    paragraphs: [
      'In the **Nandi Hills** region, north of Bengaluru, rainfall takes different paths. Some runs over slopes into streams; some seeps into soil; some is stored in the landscape. Together, these processes shape the beginnings of the Arkavathi.',
      'The river travels **178 kilometres** through southern Karnataka before joining the Cauvery near **Sangama**. But its story is not contained within that one watercourse: the wider {{catchment:catchment}} determines how water reaches it, season by season.',
    ],
    why: 'Headwater slopes decide how much rain becomes river flow. Protecting the upper catchment protects every reach downstream.',
    extraPhotos: [],
    stops: [
      {
        at: 0, title: 'Nandi Hills · where the river begins', note: 'The first 15 km of the mapped Arkavathi over the project elevation model (DEM).',
        riverContext: ['arkavathi'], reach: 'source', elevation: true, places: ['source'], spotlight: 'source',
        frame: [{ kind: 'reach', id: 'source' }, { kind: 'place', key: 'source', km: 3 }], fallback: [77.55, 13.25, 77.69, 13.37], maxZoom: 11.8,
        photos: [ORIGIN],
      },
      {
        at: 1, title: 'From Nandi Hills to Sangama', note: 'The mapped river line measures about 176 km in the project dataset.',
        rivers: ['arkavathi'], places: ['source', 'sangama'],
        frame: [{ kind: 'river', ids: ['arkavathi'] }], fallback: ARKAVATHI,
      },
    ],
  },
  {
    eyebrow: 'Arkavathi and Her Sisters',
    lead: 'Three rivers, different journeys,',
    accent: 'one connected story.',
    quote: 'Every stream has a story; together, they share the journey of Arkavathi.',
    closingQuote: "Their journeys may begin apart, but their waters become part of Arkavathi's story.",
    paragraphs: [
      'As Arkavathi makes her way through the landscapes of Karnataka, she is connected to three important {{tributary:tributaries}} — **Kumudavathi**, **Suvarnamukhi** and **Vrishabhavathi**.',
      'Each begins its journey through a different landscape, carrying water from surrounding hills, streams, lakes and settlements.',
      "**Kumudavathi** connects with the Arkavathi near the **Thippagondanahalli Reservoir**, a place closely linked to Bengaluru's water-supply history.",
      '**Suvarnamukhi** flows through the southern catchment and connects with the **Vrishabhavathi** river system.',
      '**Vrishabhavathi** flows through parts of Bengaluru before joining Arkavathi farther downstream, bringing with it the influence of a growing urban landscape.',
      'Though their paths are different, their waters belong to a larger connected system. Together, they link landscapes, communities and changing environmental conditions across the basin.',
    ],
    why: 'Each tributary carries the conditions of its own catchment into the main river, so the health of one stream affects the whole system.',
    extraPhotos: [],
    stops: [
      {
        at: 0, title: 'Three tributaries of the Arkavathi', note: 'Kumudavathi, Suvarnamukhi and Vrishabhavathi, each in its own colour.',
        rivers: ['kumudavathi', 'suvarnamukhi', 'vrishabhavathi'], riverContext: ['arkavathi'], places: ['kumConf', 'suvConf', 'vrishConf'],
        frame: [{ kind: 'river', ids: ['kumudavathi', 'suvarnamukhi', 'vrishabhavathi'] }], fallback: [77.2292, 12.5987, 77.5786, 13.2064],
      },
      {
        at: 2, title: 'Kumudavathi meets Arkavathi', note: 'Mapped Kumudavathi course about 48 km; it joins the Arkavathi near Thippagondanahalli.',
        rivers: ['kumudavathi'], riverContext: ['arkavathi'], places: ['kumConf'], spotlight: 'kumConf',
        frame: [{ kind: 'river', ids: ['kumudavathi'] }], fallback: [77.2292, 12.9716, 77.3417, 13.2064],
        photos: [KUM_CONFLUENCE, KUM_ORIGIN],
      },
      {
        at: 3, title: 'Suvarnamukhi joins the Vrishabhavathi', note: 'Mapped Suvarnamukhi course about 35 km, ending on the Vrishabhavathi line.',
        rivers: ['suvarnamukhi'], riverContext: ['vrishabhavathi'], places: ['suvConf'], spotlight: 'suvConf',
        frame: [{ kind: 'river', ids: ['suvarnamukhi'] }], fallback: [77.4142, 12.6636, 77.5786, 12.8041],
        photos: [SUV_CONFLUENCE, SUV_ORIGIN],
      },
      {
        at: 4, title: 'Vrishabhavathi, from the city to the Arkavathi', note: 'Mapped Vrishabhavathi course about 69 km through western Bengaluru.',
        rivers: ['vrishabhavathi'], riverContext: ['arkavathi'], places: ['vrishConf'], spotlight: 'vrishConf',
        frame: [{ kind: 'river', ids: ['vrishabhavathi'] }], fallback: VRISHABHAVATHI,
        photos: [VRISH_CONFLUENCE, VRISH_ORIGIN],
      },
      {
        at: 5, title: 'One connected river system', note: 'All four mapped rivers and their confluences.',
        rivers: ALL_FOUR, places: ['kumConf', 'suvConf', 'vrishConf', 'sangama'],
        frame: [{ kind: 'river', ids: ALL_FOUR }], fallback: ALL_RIVERS,
      },
    ],
  },
  {
    eyebrow: 'River Heritage',
    lead: 'The river that helped',
    accent: 'water Bengaluru.',
    quote: 'Before its present pressures, Arkavathi was part of the city’s water story.',
    paragraphs: [
      "In **1896**, **Hesaraghatta Reservoir** became one of the city's earliest major water sources, collecting water from the Arkavathi system to meet the needs of a growing population.",
      "As Bengaluru expanded, the **Thippagondanahalli Reservoir**, completed in **1933**, strengthened the city's water supply by storing water from the Arkavathi and Kumudavathi {{catchment:catchments}}.",
      'Beyond these reservoirs, the river and its connected lakes and tanks supported agriculture, settlements and everyday life across the surrounding region.',
      'For generations, Arkavathi was more than a river flowing through Karnataka. It was part of the foundation on which Bengaluru grew.',
      'But as the city expanded and the surrounding landscape transformed, the river that supported this growth began facing new pressures.',
    ],
    why: 'These two reservoirs tie the river directly to the history of Bengaluru’s water supply, and to the catchments that keep them filled.',
    extraPhotos: [HESAR_HISTORY],
    stops: [
      {
        at: 0, title: 'Hesaraghatta Reservoir · 1896', note: 'Both historic reservoirs from the project waterbodies dataset; Hesaraghatta in focus.',
        rivers: ['arkavathi', 'kumudavathi'], reservoirs: [HESARAGHATTA, TG_HALLI], reservoirFocus: HESARAGHATTA, places: ['hesar', 'tgh'], spotlight: 'hesar',
        frame: [{ kind: 'water', names: [HESARAGHATTA, TG_HALLI] }], fallback: BOTH_RESERVOIRS, maxZoom: 11.6,
        photos: [HESAR, HESAR_1890],
      },
      {
        at: 1, title: 'Thippagondanahalli Reservoir · 1933', note: 'Both historic reservoirs; Thippagondanahalli in focus, at the Arkavathi–Kumudavathi confluence.',
        rivers: ['arkavathi', 'kumudavathi'], reservoirs: [HESARAGHATTA, TG_HALLI], reservoirFocus: TG_HALLI, places: ['hesar', 'tgh'], spotlight: 'tgh',
        frame: [{ kind: 'water', names: [HESARAGHATTA, TG_HALLI] }], fallback: BOTH_RESERVOIRS, maxZoom: 11.6,
        photos: [THIPPA, TG_HISTORY],
      },
      {
        at: 2, title: 'Reservoirs, lakes and tanks', note: 'The two historic reservoirs with the other major lakes and tanks mapped in the basin.',
        rivers: ['arkavathi', 'kumudavathi'], reservoirs: [HESARAGHATTA, TG_HALLI], waterContext: true, places: ['hesar', 'tgh'],
        frame: [{ kind: 'boundary' }], fallback: BASIN,
      },
    ],
  },
  {
    eyebrow: 'The Changing Basin',
    lead: 'The watershed changed.',
    accent: 'The river felt it.',
    quote: 'Development may happen on land; the consequences can reach the water.',
    paragraphs: [
      'For generations, Arkavathi and its connected water bodies supported Bengaluru and the surrounding communities. But as the region developed, the landscape around the river began to transform.',
      'Growing settlements, expanding roads, agricultural activities and industrial development brought increasing demands for land and water. {{groundwater:Groundwater extraction}} intensified in parts of the basin, while natural {{drainage:drainage networks}} experienced growing pressure.',
      'These changes also influenced how rainwater moved across the land, how water reached the reservoirs, and how {{wastewater:wastewater}} entered connected streams.',
      'Over time, the effects became increasingly evident. Research documented substantial declines in water inflows to the **Thippagondanahalli Reservoir**, while wastewater pollution emerged as a major concern in affected downstream stretches.',
      'Arkavathi was no longer experiencing only the natural changes of the seasons. Its condition was increasingly influenced by the activities taking place across its {{catchment:catchment}}.',
    ],
    why: 'Land use, groundwater and drainage change how much water reaches the river and what that water carries. These maps show the landscape today, not measured change over time.',
    extraPhotos: [],
    stops: [
      {
        at: 0, title: 'The basin from above', note: 'Present-day satellite imagery inside the basin boundary. Not a historical comparison.',
        basemap: 'satellite', boundary: 'full', riverContext: ALL_FOUR,
        frame: [{ kind: 'boundary' }], fallback: BASIN,
      },
      {
        at: 1, title: 'Industrial areas mapped today', note: 'Present-day industrial areas from the project dataset.',
        industrial: true, riverContext: ALL_FOUR,
        frame: [{ kind: 'boundary' }], fallback: BASIN,
      },
      {
        at: 2, title: 'How water moves: the drainage network', note: 'Stream network derived from the project DEM; line weight follows stream order.',
        drainage: true, riverContext: ['arkavathi'],
        frame: [{ kind: 'boundary' }], fallback: BASIN,
      },
      {
        at: 3, title: 'Catchments upstream of Thippagondanahalli', note: 'Catchment extent only. The inflow decline is reported by research; it is not measured on this map.',
        sheds: ['TGHalli', 'Kumudavathi', 'Hesaraghatta'], riverContext: ['arkavathi', 'kumudavathi'], places: ['tgh'],
        frame: [{ kind: 'shed', names: ['TGHalli', 'Kumudavathi', 'Hesaraghatta'] }], fallback: [77.2209, 12.9357, 77.6836, 13.388],
      },
      {
        at: 4, title: 'Terrain across the whole catchment', note: 'Project elevation model (DEM) with the seven sub-hydrosheds.',
        elevation: true, sheds: true, riverContext: ALL_FOUR,
        frame: [{ kind: 'boundary' }], fallback: BASIN,
      },
    ],
  },
  {
    eyebrow: 'The Hidden Journey',
    lead: 'What enters the river',
    accent: 'does not stay in one place.',
    subline: 'Not just what is happening, but why?',
    quote: 'A roadside drain can be the beginning of a much longer journey.',
    paragraphs: [
      '{{wastewater:Wastewater}} from settlements, inadequately treated industrial {{effluent:effluents}} and contaminated {{runoff:runoff}} can enter local drains, lakes and streams before making their way into the larger river system.',
      'One important connection is the **Vrishabhavathi River**, which flows through parts of Bengaluru and receives significant urban wastewater inputs. As it joins Arkavathi downstream, it becomes an important pathway through which pollution pressures can extend into the main river.',
      'The signs of pollution are already evident in affected stretches. Sewage-contaminated flows, discolouration, foam and unpleasant odours highlight the environmental challenges facing these waterways.',
      'But the problem extends beyond what is happening at any one location. Through connected {{drainage:drainage networks}}, wastewater and pollutants can travel from their points of entry into rivers and downstream water bodies.',
      'Understanding this journey requires identifying discharge locations, tracing drainage connections and examining the quality of water entering the river.',
      'Because pollution does not begin where we notice it. Its journey often starts much farther upstream.',
    ],
    why: 'Pollution is easiest to reduce where it enters. Mapping documented discharge points and drainage connections makes targeted action possible.',
    extraPhotos: [VB_RIVER, FOAM, DYE, OILY, SEWAGE],
    findings: 'drains',
    stops: [
      {
        at: 0, title: 'Where wastewater enters', note: 'RTI-documented effluent dumping locations in the Vrishabhavathi catchment.',
        rivers: ['vrishabhavathi'], evidence: { groups: ['citizen'], sheds: ['C05CAM34'] },
        frame: [{ kind: 'river', ids: ['vrishabhavathi'] }, { kind: 'evidence', groups: ['citizen'], sheds: ['C05CAM34'] }], fallback: VRISHABHAVATHI,
        photos: [VB_RIVER_1],
      },
      {
        at: 1, title: 'The Vrishabhavathi pathway', note: 'Vrishabhavathi joins the Arkavathi downstream; flow direction is not modelled here.',
        rivers: ['vrishabhavathi'], riverContext: ['arkavathi'], places: ['vrishConf'], spotlight: 'vrishConf',
        frame: [{ kind: 'river', ids: ['vrishabhavathi'] }, { kind: 'place', key: 'vrishConf', km: 4 }], fallback: VRISHABHAVATHI,
        photos: [VRISH_CONFLUENCE],
      },
      {
        at: 2, title: 'Peenya · drains beside the industrial area', note: 'CSIR–NEERI drain survey and VTU/BMS groundwater study locations.',
        rivers: ['vrishabhavathi'], evidence: { contributors: ['NEERI', 'Visvesvaraya'] }, places: ['peenya'],
        frame: [{ kind: 'evidence', contributors: ['NEERI', 'Visvesvaraya'] }], fallback: [77.52282, 13.02657, 77.53509, 13.02658], maxZoom: 12.6,
        photos: [V200],
      },
      {
        at: 3, title: 'Connected drainage across the catchment', note: 'Stream network of the Vrishabhavathi sub-hydroshed (DEM-derived).',
        drainage: true, sheds: ['Vrishabhavathi'], rivers: ['vrishabhavathi'], riverContext: ['arkavathi'],
        frame: [{ kind: 'shed', names: ['Vrishabhavathi'] }], fallback: [77.3452, 12.598, 77.5979, 13.0407],
      },
      {
        at: 4, title: 'Polluting drains recorded along the Arkavathi', note: 'Fifteen drains recorded at Ramanagara and Kanakapura (BOD, December 2020).',
        drains: true, rivers: ['arkavathi'], reach: 'stretch', places: ['ramanagara', 'kanakapura'],
        frame: [{ kind: 'drains' }], fallback: DRAINS,
      },
    ],
  },
  {
    eyebrow: 'The Evidence',
    lead: 'Beyond what',
    accent: 'the eye can see.',
    quote: 'What we see in the river is only the beginning. The evidence tells us more.',
    closingQuote: 'Every finding brings us closer to understanding Arkavathi — and every understanding brings us closer to protecting it.',
    paragraphs: [
      'As pollution spreads through Arkavathi and its connected waterways, its effects are evident in affected stretches of the river.',
      'Over the years, researchers, institutions and environmental organisations have investigated its water quality, contamination, changing river flows and environmental challenges.',
      "Contributions from **ATREE**, **CSIR–NEERI**, **Paani.Earth × ICCW (IIT Madras Research Park)**, **Visvesvaraya Technological University**, **BMS College of Engineering**, **Kuvempu University** and **SJBIT, Bengaluru**, alongside citizen-led efforts by **Arkavathi Horata Samithi** and {{rti:RTI}} initiatives associated with **Madhuri Mandava**, have helped build awareness and understanding of the river's condition.",
      'Together, scientific research, environmental monitoring and public participation provide a foundation for protecting Arkavathi.',
    ],
    why: 'Documented, source-attributed evidence turns concern into knowledge that planners, institutions and communities can act on.',
    extraPhotos: [INDUSTRIAL, BOMMANAHALLI, POLLUTED, SOLID_WASTE, VB_RIVER_2],
    findings: 'evidence',
    stops: [
      {
        at: 0, title: 'Documented evidence across the basin', note: '33 source-attributed evidence locations, coloured by type.',
        evidence: {}, riverContext: ALL_FOUR,
        frame: [{ kind: 'evidence' }], fallback: ALL_EVIDENCE,
      },
      {
        at: 1, title: 'Studies along the Vrishabhavathi corridor', note: 'ATREE, Kuvempu University & SJBIT and other study sites.',
        rivers: ['vrishabhavathi'], evidence: { groups: ['research'], sheds: ['C05CAM34'] },
        frame: [{ kind: 'evidence', groups: ['research'], sheds: ['C05CAM34'] }], fallback: [77.41229, 12.72711, 77.52798, 13.00028],
        photos: [BYRAMANGALA, BIDADI],
      },
      {
        at: 2, title: 'Paani.Earth × ICCW sites A–G', note: 'Water and sediment sampling, February–March 2024, with the listed polluted stretch (approximate).',
        rivers: ['arkavathi', 'vrishabhavathi'], evidence: { groups: ['paani'] }, reach: 'stretch',
        frame: [{ kind: 'evidence', groups: ['paani'] }], fallback: [77.334566, 12.358112, 77.439108, 12.98942],
      },
      {
        at: 3, title: 'Citizen-led and RTI evidence', note: 'Arkavathi Horata Samithi samples and RTI effluent analyses.',
        evidence: { groups: ['citizen'] }, riverContext: ['arkavathi', 'vrishabhavathi'],
        frame: [{ kind: 'evidence', groups: ['citizen'] }], fallback: [77.46711, 12.80236, 77.54965, 13.26351],
      },
    ],
  },
  {
    eyebrow: 'The Journey Downstream',
    lead: 'Where Two Rivers Meet,',
    accent: 'the Story Continues.',
    quote: 'What happens upstream becomes part of the river’s downstream story.',
    closingQuote: 'Arkavathi’s waters join the Cauvery. The responsibility to protect them continues.',
    paragraphs: [
      'After flowing through changing landscapes, historic reservoirs and connected tributaries, Arkavathi approaches the final stretch of its journey.',
      'Near **Sangama**, in **Kanakapura Taluk**, the river meets the **Cauvery**, becoming part of a much larger river system.',
      'But along this journey, Arkavathi carries more than water. {{sediment:Sediments}} and pollutants from affected upstream stretches may travel downstream, influencing water quality and the surrounding environment.',
      'Scientific investigations and pollution-monitoring reports have highlighted continuing water-quality concerns along the river, including its lower reaches.',
      'Protecting Arkavathi requires action throughout its basin — effective sewage treatment, responsible industrial wastewater management, protection of natural drainage networks and continuous scientific monitoring.',
      "The river's condition can improve only when these efforts translate into measurable environmental progress.",
    ],
    why: 'What the Arkavathi carries downstream becomes part of the Cauvery system, so protection has to work across the whole basin.',
    extraPhotos: [],
    stops: [
      {
        at: 0, title: 'The lower Arkavathi', note: 'About 44 km of mapped river from the Vrishabhavathi confluence to Sangama.',
        riverContext: ['arkavathi'], reach: 'downstream', places: ['vrishConf', 'harobele', 'sangama'],
        frame: [{ kind: 'reach', id: 'downstream' }], fallback: [77.37, 12.287, 77.46, 12.6],
        photos: [DOWNSTREAM],
      },
      {
        at: 1, title: 'Sangama · where Arkavathi meets the Cauvery', note: 'The Cauvery is not in the public dataset, so it is not drawn; the marker sits at the mapped end of the Arkavathi.',
        riverContext: ['arkavathi'], reach: 'downstream', places: ['sangama'], spotlight: 'sangama',
        frame: [{ kind: 'place', key: 'sangama', km: 3.5 }], fallback: [77.4, 12.26, 77.46, 12.31], maxZoom: 12.8,
        photos: [CONFLUENCE],
      },
      {
        at: 3, title: 'Monitoring the lower reaches', note: 'Paani.Earth × ICCW sites D and E, downstream of the Vrishabhavathi confluence.',
        riverContext: ['arkavathi'], reach: 'downstream', evidence: { sites: ['D', 'E'] }, places: ['sangama'],
        frame: [{ kind: 'evidence', sites: ['D', 'E'] }, { kind: 'place', key: 'sangama', km: 2 }], fallback: [77.42, 12.28, 77.44, 12.52],
      },
      {
        at: 4, title: 'One basin, one responsibility', note: 'The whole Arkavathi basin with all four rivers.',
        boundary: 'full', rivers: ALL_FOUR, places: ['source', 'sangama'],
        frame: [{ kind: 'boundary' }], fallback: BASIN,
      },
    ],
  },
]

export const INTRO_FACTS: Array<{ value: string; label: string }> = [
  { value: '178 km', label: 'From the hills of Nandi to the Cauvery' },
  { value: '3', label: 'Sister rivers: Kumudavathi, Suvarnamukhi, Vrishabhavathi' },
  { value: '1896 · 1933', label: 'Hesaraghatta and Thippagondanahalli reservoirs' },
  { value: 'Sangama', label: 'Where Arkavathi meets the Cauvery' },
]
