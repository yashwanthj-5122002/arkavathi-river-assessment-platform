export type DaySummary = {
  day: number
  date: string | null
  clips: number
  distance_km: number
  duration_seconds: number
  duration_label: string
  duration_available: boolean
  alt_min_m: number | null
  alt_max_m: number | null
  source_rows: number
  columns: string[]
  workbook: string
  reported_track_points: number
  rendered_vertices: number
}

export type Summary = {
  project: string
  dataset: string
  survey_days: number
  flight_clips: number
  source_rows: number
  reported_track_points: number
  rendered_vertices: number
  clickable_points?: number
  clickable_points_note?: string
  flight_distance_km: number
  recomputed_path_distance_km: number
  recorded_duration_seconds: number
  airborne_combined: string
  duration_note: string
  alt_min_m: number
  alt_max_m: number
  bbox: [number, number, number, number]
  days: DaySummary[]
}

export type FlightPoint = {
  time: string | null
  frame: number | null
  lat: number | null
  lon: number | null
  rel_alt_m: number | null
  abs_alt_m: number | null
}

export type TrackPoint = {
  point_id: string
  flight_id: string
  day: number
  flight_sequence: number
  clip: string
  point_index: number
  point_count: number
  time: string | null
  date: string | null
  time_of_day: string | null
  frame: number | null
  lat: number
  lon: number
  rel_alt_m: number | null
  abs_alt_m: number | null
  source_row: number | null
  source_workbook: string | null
  source_time_delta_ms: number | null
  elapsed_seconds: number | null
  distance_from_start_m: number
  progress_pct: number
  detail_status: string
  schema_note: string
}

export type FlightListItem = {
  id: string
  day: number
  sequence: number
  clip: string
  distance_km: number
  reported_points: number | null
  rendered_vertices: number
  duration_label: string
  alt_min_m: number | null
  alt_max_m: number | null
  start: FlightPoint
  end: FlightPoint
}

export type FlightDetail = FlightListItem & {
  coordinates: [number, number, number | null][]
  playback: TrackPoint[]
  points: TrackPoint[]
}

export type DataAvailability = {
  available_now: {key:string;label:string;status:'available'|'partial';source:string}[]
  needed_next: {module:string;data:string}[]
}

export type Verification = {
  validation_passed: boolean
  issues: string[]
  checks: Record<string, boolean | number>
  note: string
}

export type ProjectEventStatus = 'DRAFT'|'UPCOMING'|'COMPLETED'

export type ProjectEventImage = {
  public_id:string
  original_name:string
  content_type:string
  size_bytes:number
  sort_order:number
  uploaded_at:string
  url:string
}

export type ProjectEvent = {
  public_id:string
  title:string
  event_date:string
  event_time:string
  location:string
  short_description:string
  description:string
  status:ProjectEventStatus
  created_by:number
  created_by_name:string
  created_at:string
  updated_at:string
  images:ProjectEventImage[]
}

export type PortalId = 'company' | 'cnnl' | 'institution'
export type OrganizationType = 'COMPANY' | 'CNNL' | 'INSTITUTION'

export type AuthUser = {
  id: number
  email: string
  display_name: string
  organization_id: string
  organization_name: string
  organization_type: OrganizationType
  role: string
  active: boolean
  must_change_password: boolean
}

export type InstitutionOption = {
  id: string
  name: string
  code: string
  placeholder_name: number
}

export type PortalConfig = {
  portals: {id:PortalId;label:string;organization_type:OrganizationType}[]
  institutions: InstitutionOption[]
  institution_names_status: string
}

export type InstitutionOverview = {
  institution: InstitutionOption
  data_status: string
  metrics: {
    watershed: string | null
    locations_assigned: number | null
    surveyed: number | null
    samples: number | null
    progress_pct: number | null
    total_records?: number
    drafts?: number
    submitted?: number
    under_review?: number
    returned?: number
    approved?: number
  }
  available_actions: string[]
  note: string
}

export type AccessOrganization = {
  id: string
  name: string
  org_type: OrganizationType
  code: string
  active: number
  placeholder_name: number
}

export type AccessUser = {
  id: number
  email: string
  display_name: string
  organization_id: string
  organization_name: string
  organization_type: OrganizationType
  role: string
  active: number
  must_change_password: number
  created_at: string
  last_login_at: string | null
}

export type AccessSummary = {
  organizations: AccessOrganization[]
  users: AccessUser[]
  counts: {organizations:number;users:number;institutions:number}
}

export type CivilEntryType = 'RIVER_SURVEY'|'DRAIN_SURVEY'|'STRUCTURE'|'OUTFALL'|'WATER_SAMPLE'|'CRITICAL_LOCATION'
export type CivilStatus = 'DRAFT'|'SUBMITTED'|'UNDER_REVIEW'|'RETURNED'|'APPROVED'

export type CivilAttachment = {
  public_id:string
  original_name:string
  content_type:string|null
  size_bytes:number
  uploaded_at?:string
}

export type CivilEntry = {
  public_id:string
  institution_id:string
  institution_name:string
  entry_type:CivilEntryType
  status:CivilStatus
  fields:Record<string,any>
  created_by:number
  created_by_name:string
  created_at:string
  updated_at:string
  submitted_at:string|null
  review_started_at:string|null
  reviewed_at:string|null
  reviewer_name:string|null
  review_comment:string|null
  attachments:CivilAttachment[]
}

export type DepartmentId = 'CIVIL'|'GIS'|'SURVEY'|'LIDAR'|'PHOTOGRAMMETRY'

export type DepartmentSummary = {
  id:DepartmentId
  name:string
  code:string
  total_batches:number
  total_files:number
  total_bytes:number
  last_upload_at:string|null
  today_batches:number
  can_view_all:boolean
  requires_passkey_to_upload:boolean
}

export type DepartmentUnlock = {
  token:string
  expires_at:string
  purpose:'BROWSE'|'UPLOAD'
  batch_public_id:string|null
  department:{id:DepartmentId;name:string;code:string}
}

export type RepositoryFile = {
  public_id:string
  original_name:string
  extension:string
  content_type:string|null
  size_bytes:number
  sha256:string
  version_no:number
  duplicate_of:string|null
  uploaded_at:string
  uploaded_by_name?:string
}

export type RepositoryBatch = {
  public_id:string
  department_id:DepartmentId
  department_name:string
  department_code:string
  data_date:string
  category:string
  description:string
  remarks:string
  uploader_label:string
  status:'DRAFT'|'UPLOADING'|'COMPLETE'
  created_by:number
  created_by_name:string
  created_by_email:string
  created_at:string
  completed_at:string|null
  total_files:number
  total_bytes:number
  files:RepositoryFile[]
}

export type RepositorySummary = {
  departments:number
  total_batches:number
  total_files:number
  total_bytes:number
  today_batches:number
  today_files:number
}

export type RepositoryFilters = {
  department_id?:DepartmentId|''
  date_from?:string
  date_to?:string
  data_date_from?:string
  data_date_to?:string
  category?:string
  extension?:string
  search?:string
  order?:'latest'|'oldest'
}

export type UploadInit = {
  upload_id:string
  chunk_size:number
  received_bytes:number
  expected_size:number
  resumed:boolean
}

export type RepositoryAuditItem = {
  id:number
  department_id:string|null
  action:string
  batch_public_id:string|null
  file_public_id:string|null
  occurred_at:string
  user_name:string|null
  user_email:string|null
  details:Record<string,any>
}

export type PermissionProfile = {
  role:string
  organization_type:OrganizationType
  organization_id:string
  department_scope:string|null
  permissions:string[]
}

export type WorkflowStatus = 'DRAFT'|'SUBMITTED'|'UNDER_REVIEW'|'CORRECTION_REQUIRED'|'RESUBMITTED'|'TECHNICALLY_APPROVED'|'FINAL_APPROVED'|'INTEGRATED'|'REJECTED'
export type WorkflowSourceType = 'REPOSITORY_BATCH'|'INSTITUTION_ENTRY'

export type WorkflowHistoryItem = {
  action:string
  from_status:string
  to_status:string
  performed_by:number|null
  reviewer_role:string|null
  remarks:string|null
  details_json?:string|null
  created_at:string
  performed_by_name?:string|null
}

export type WorkflowItem = {
  public_id:string
  source_type:WorkflowSourceType
  source_ref:string
  owner_organization_id:string
  department_id:string|null
  institution_id:string|null
  micro_catchment_id:string|null
  current_status:WorkflowStatus
  created_by:number
  technical_reviewer_id:number|null
  final_approver_id:number|null
  submitted_at:string|null
  review_started_at:string|null
  technical_approved_at:string|null
  final_approved_at:string|null
  integrated_at:string|null
  created_at:string
  updated_at:string
  source:Record<string,any>
  history?:WorkflowHistoryItem[]
}

export type TaskStatus = 'DRAFT'|'ASSIGNED'|'IN_PROGRESS'|'SUBMITTED'|'UNDER_REVIEW'|'CORRECTION_REQUIRED'|'RESUBMITTED'|'APPROVED'|'COMPLETED'|'CANCELLED'
export type TaskPriority = 'LOW'|'MEDIUM'|'HIGH'|'CRITICAL'

export type TaskAssignment = {
  id:number
  assignee_user_id:number|null
  assignee_organization_id:string|null
  assignee_department_id:string|null
  is_primary:number
  active:number
  assigned_at:string
  assignee_name?:string|null
  assignee_email?:string|null
}

export type TaskHistoryItem = {
  action:string
  from_status:string
  to_status:string
  comment:string|null
  performed_by:number|null
  created_at:string
  performed_by_name?:string|null
}

export type TaskItem = {
  public_id:string
  title:string
  description:string
  created_by:number
  owner_organization_id:string
  department_id:string|null
  institution_id:string|null
  micro_catchment_id:string|null
  priority:TaskPriority
  status:TaskStatus
  due_date:string|null
  submitted_at:string|null
  approved_at:string|null
  completed_at:string|null
  created_at:string
  updated_at:string
  assignments:TaskAssignment[]
  history?:TaskHistoryItem[]
}

export type TaskTargets = {
  departments:{id:string;name:string;code:string}[]
  institutions:{id:string;name:string;code:string}[]
  eligible_users:{id:number;email:string;display_name:string;organization_id:string;role:string;organization_name:string}[]
}

export type WorkflowNotification = {
  public_id:string
  user_id:number|null
  organization_id:string|null
  department_id:string|null
  notification_type:string
  title:string
  message:string
  related_type:string|null
  related_ref:string|null
  is_read:number
  created_at:string
  read_at:string|null
}

export type WorkflowAuditItem = {
  public_id:string
  user_id:number|null
  organization_id:string|null
  department_id:string|null
  action:string
  module:string
  entity_type:string|null
  entity_ref:string|null
  details_json:string|null
  ip_address:string|null
  user_agent:string|null
  occurred_at:string
  user_name:string|null
  user_email:string|null
}

export type ScientificRecordType = 'WATERSHED'|'DRAINAGE'|'INDUSTRY'|'WATER_SAMPLE'|'LAB_RESULT'|'HYDROLOGY'|'POLLUTION_HOTSPOT'|'ISSUE_RISK'
export type ScientificRecordStatus = 'DRAFT'|'SUBMITTED'|'UNDER_REVIEW'|'CORRECTION_REQUIRED'|'APPROVED'
export type ScientificPackageStatus = 'PENDING'|'UPLOADED'|'VALIDATED'|'APPROVED'

export type MicroCatchment = {
  id:string
  name:string
  institution_id:string
  institution_name:string
  area_sq_km:number|null
  perimeter_km:number|null
  boundary_status:ScientificPackageStatus
  drainage_status:ScientificPackageStatus
  validation_status:ScientificPackageStatus
  remarks:string
  updated_at:string
}

export type ScientificRecord = {
  public_id:string
  record_type:ScientificRecordType
  institution_id:string|null
  institution_name:string|null
  micro_catchment_id:string|null
  micro_catchment_name:string|null
  status:ScientificRecordStatus
  fields:Record<string,any>
  metadata:Record<string,any>
  created_by:number
  created_by_name:string
  reviewer_name:string|null
  review_comment:string
  created_at:string
  updated_at:string
  submitted_at:string|null
  review_started_at:string|null
  reviewed_at:string|null
}

export type ScientificPackageItem = {
  item_key:string
  label:string
  status:ScientificPackageStatus
  notes:string
  updated_at:string
}

export type ScientificPackage = {
  institution_id:string
  institution_name:string
  items:ScientificPackageItem[]
  complete_items:number
  total_items:number
  completion_pct:number
}

export type ScientificSummary = {
  records:number
  micro_catchments:number
  type_counts:Record<ScientificRecordType,number>
  status_counts:Record<ScientificRecordStatus,number>
  approved_records:number
  pending_review:number
  institution_package_average_pct?:number
  package?:ScientificPackage
}

export type IndustrySourceState = {
  configured:boolean
  primary:boolean
  mode:string
  portal?:string
  endpoint?:string
  attempted?:boolean
  ok?:boolean
  count?:number
  message?:string
  source?:string
}

export type IndustryRiverContext = {
  available:boolean
  source:'KIADB'|'OPENSTREETMAP'|'NONE'|string
  feature_count:number
  filter_distance_m:number
  message:string
  kiadb_configured?:boolean
  portal?:string
  geojson:{type:'FeatureCollection';features:any[]}
}

export type IndustryCandidate = {
  id:string
  name:string
  display_name?:string
  identity_source?:string
  identity_status?:string
  kiadb_plot_no?:string
  industrial_area?:string
  nature_of_industry?:string
  plot_status?:string
  source:'KIADB'|'OPENSTREETMAP'|string
  source_id:string
  category:string
  lat:number
  lng:number
  address:string
  distance_from_route_m:number
  current_distance_m?:number
  river_distance_m:number|null
  nearest_river_name:string
  river_source:string
  river_relevance:'HIGH'|'MEDIUM'|'LOW'|'RIVER_DATA_UNAVAILABLE'|string
  current_relevance?:'HIGH'|'MEDIUM'|'REVIEW'|string
  nearest_river_lat?:number|null
  nearest_river_lng?:number|null
  nearest_video_time_s:number
  nearest_video_time:string
  nearest_track_index:number
  nearest_track_lat:number
  nearest_track_lng:number
  proximity_band?:string
  verification_status:string
  metadata:Record<string,any>
}

export type IndustryDiscoveryResult = {
  run_id:string|null
  version:string
  generated_at?:string
  video_name?:string
  srt_name?:string
  radius_m?:number
  river_radius_m?:number
  sample_count?:number
  route_bbox?:{south:number;west:number;north:number;east:number}
  river_bbox?:{south:number;west:number;north:number;east:number}
  river_context?:IndustryRiverContext
  sources?:Record<string,IndustrySourceState>
  counts:{
    total:number
    route_candidates_before_river_filter?:number
    kiadb?:number
    openstreetmap?:number
    river_high?:number
    river_medium?:number
    within_100m?:number
    within_250m?:number
    within_500m?:number
    within_1km?:number
  }
  candidates:IndustryCandidate[]
  disclaimer?:string
}

export type IndustrySourceStatus = {
  version:string
  note:string
  kiadb:IndustrySourceState
  openstreetmap:IndustrySourceState
  river:IndustrySourceState
}

export type DatasetValidationResult = {
  valid:boolean
  filename:string
  extension:string
  data_group:string|null
  naming_convention_ok:boolean
  errors:string[]
  warnings:string[]
  supported_formats:string[]
}

export type IndustryObservationStatus = 'OBSERVED_SITE'|'RECORD_NOT_AVAILABLE'|'VERIFICATION_REQUIRED'|'VERIFIED'
export type IndustryDischargeStatus = 'YES'|'NO'|'UNKNOWN'
export type IndustryCategory = 'UNKNOWN'|'MANUFACTURING'|'WAREHOUSE'|'FOOD_PROCESSING'|'TEXTILE'|'CHEMICAL'|'CONSTRUCTION_MATERIAL'|'WORKSHOP'|'UTILITY'|'OTHER'

export type IndustryEvidence = {
  public_id:string
  original_name:string
  content_type:string
  size_bytes:number
  uploaded_at:string
  url:string
}

export type IndustryObservation = {
  public_id:string
  organization_id:string
  organization_name:string
  name:string
  category:IndustryCategory
  latitude:number
  longitude:number
  video_name:string
  srt_name:string
  video_time_seconds:number
  heading:number|null
  status:IndustryObservationStatus
  discharge_status:IndustryDischargeStatus
  discharge_notes:string
  notes:string
  registration_reference:string
  survey_day:number|null
  flight_id:string|null
  flight_clip:string|null
  source_workbook:string|null
  nearest_track_point_id:string|null
  nearest_track_distance_m:number|null
  track_match:boolean
  created_by:number
  created_by_name:string
  updated_by:number
  updated_by_name:string
  verified_by:number|null
  verified_by_name:string|null
  verified_at:string|null
  created_at:string
  updated_at:string
  evidence:IndustryEvidence[]
}

export type IndustryIntelligenceSummary = {
  total:number
  status_counts:Record<IndustryObservationStatus,number>
  discharge_observed:number
  with_evidence:number
  by_day:Record<string,number>
  official_registry_loaded:boolean
  river_geometry_loaded:boolean
  classification_note:string
  track_match_threshold_m:number
}
