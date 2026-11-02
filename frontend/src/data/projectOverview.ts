export const riverOverviewFacts = [
  {
    label: 'Total River Length',
    value: '178 km',
    detail: 'Arkavathi River system',
    tone: 'blue' as const,
  },
  {
    label: 'Catchment Area',
    value: '4,156 sq. km',
    detail: 'Project study catchment',
    tone: 'cyan' as const,
  },
  {
    label: 'Major River Basin',
    value: 'Cauvery',
    detail: 'Arkavathi sub-basin context',
    tone: 'violet' as const,
  },
  {
    label: 'Major Tributaries',
    value: '3',
    detailLines: ['Kumudavathi', 'Vrishabhavathi', 'Suvarnamukhi'],
    tone: 'green' as const,
  },
  {
    label: 'Water Infrastructure',
    value: '22 assets',
    detailLines: ['Reservoirs – 9', 'ETPs – 4', 'STPs – 7', 'Hydropower Plants – 2'],
    tone: 'amber' as const,
  },
  {
    label: 'Major Industrial Zones',
    value: '10',
    detail: 'Identified project zones',
    tone: 'rose' as const,
  },
]

export const understandingPollutionIntro =
  'The ongoing assessment focuses on identifying pollution sources and understanding their impact. The Arkavathi River Pollution Assessment Project integrates field investigations, water-quality assessment, GIS and LiDAR / Drone technologies to build a scientific foundation for the protection and rejuvenation of the Arkavathi River system.'

export const understandingPollutionPoints = [
  'The study brings together multiple technologies and datasets—including LiDAR / Drone surveys, GIS mapping, field investigations, water-quality and quantity assessment, and hydrological and hydraulic analysis—to develop a detailed spatial and environmental understanding of the basin.',
  'The LiDAR survey is being undertaken along the Arkavathi River and its three major tributaries, including the required buffer areas, while Drone surveys support detailed mapping of identified industrial areas and surrounding land use. These datasets provide a basis for examining drainage pathways, river characteristics, land-use patterns and potential pollution sources.',
]

export const fromDataToActionIntro =
  'The assessment is intended to identify pollution-prone locations and potential hotspots, evaluate their impacts on the river system, and provide a scientific basis for appropriate mitigation, rejuvenation and pollution-control measures.'

export const fromDataToActionPoints = [
  'This ongoing assessment brings together spatial, environmental and field-based information to support a comprehensive understanding of the Arkavathi River pollution scenario and facilitate informed river-basin management.',
]

export const keyFocusAreas = [
  'River basin and drainage characteristics',
  'Water-quality and pollution assessment',
  'Sampling locations and spatial distribution',
  'Identification of major pollution sources',
  'GIS-based mapping and hotspot identification',
  'Reservoirs, tributaries and associated water bodies',
  'Data visualization and comparative assessment',
  'Support for sustainable river-basin management',
]

export const riverSystemDetails = [
  {
    name: 'Arkavathi River',
    kind: 'Main River',
    description:
      'The primary river system assessed for pollution sources, water quality, drainage behaviour, spatial conditions and rejuvenation planning.',
  },
  {
    name: 'Kumudavathi',
    kind: 'Major Tributary',
    description:
      'Included in the basin-wide LiDAR / Drone, GIS, drainage and pollution-source assessment together with the required study buffer areas.',
  },
  {
    name: 'Vrishabhavathi',
    kind: 'Major Tributary',
    description:
      'Included in the field, spatial, water-quality and pollution assessment to understand its relationship with the wider Arkavathi River system.',
  },
  {
    name: 'Suvarnamukhi',
    kind: 'Major Tributary',
    description:
      'Included in the catchment, drainage, land-use and pollution-source assessment forming part of the overall river-basin study.',
  },
]

// NGO names were not included in the supplied project package. Add only client-approved
// names here when they are available; the Collaboration UI safely handles an empty list.
export const participatingNgos: string[] = []
