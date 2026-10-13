// Asset & registry entities (PRD §5, epic E1). Field names follow the data dictionary;
// fields marked "ext" are prototype extensions needed by the screens (availability, publishing, strata threshold).

/** Statutory / compliance document categories (PRD BuildingDocument.type + the v6 Compliance Vault). */
export const DOC_TYPES = [
  'OC', 'Fire NOC', 'RERA certificate', 'Title document', 'Structural Safety', 'Property Tax', 'Pollution Board NOC',
  'Lift Inspection', 'Building Insurance', 'Trade Licence', 'Rainwater Harvesting', 'Elevator OEM Records',
] as const

export type Grade = 'A+' | 'A' | 'B' | 'C'
export type DevelopmentStatus = 'Operational' | 'Operational / U.C.' | 'U.C. / BTS' | 'Upcoming'
export type HandoverCondition = 'Warm Shell' | 'Furnished' | 'BTS'

export interface Campus {
  campus_id: string
  org_id: string
  name: string
  /** sq ft (built potential) */
  total_area: number | null
  num_buildings: number
  /** ext: carried over from the demo dataset */
  city: string
  location: string
  development_status: DevelopmentStatus
  acres: number | null
  /** E1-S16: company holding common-area control */
  management_company: string | null
}

export type OwnerSubType =
  | 'Owner (leasing)'
  | 'Owner (self-occupied)'
  | 'Owner (mixed)'
  | 'Owner (developer / under-construction)'
  | 'Owner (REIT / Fund)'

export interface Owner {
  owner_id: string
  org_id: string
  name: string
  sub_type: OwnerSubType
}

export interface Partner {
  name: string
  pct: number
  decision_rights: string
}

export interface Building {
  building_id: string
  org_id: string
  owner_id: string
  campus_id: string | null
  name: string
  address: string
  pincode: string
  city: string
  micro_market: string
  lat: number | null
  long: number | null
  grade: Grade | null
  /** sq ft */
  total_area: number | null
  ownership_type: 'Sole' | 'Multi-owner' | 'Strata'
  /** E1-S18: JV / consortium / SPV partners */
  multi_owner_struct: Partner[]
  status: 'Active' | 'Pre-OC' | 'Inactive'
  /** ext: visible to occupiers & brokers once published (§7.1 "Public once published") */
  published: boolean
  /** ext: for whole-building availability (Pre-OC / BTS) */
  handover_condition: HandoverCondition | null
  expected_completion: string | null
  /** ext, E1-S14: % of strata area that must sign for a valid mandate */
  mandate_threshold_pct: number | null
  /** ext: the calculator grade is indicative until an AA scorecard overrides it (E1-S04) */
  grade_source: 'Indicative (calculator)' | 'AA scorecard' | 'Imported' | null
  grade_assessed_at: string | null
}

export type OccupancyType = 'Self-occupied' | 'Leased' | 'Vacant' | 'Partially leased'

export interface BuildingFloor {
  floor_id: string
  org_id: string
  building_id: string
  floor_no: string
  /** ext: demo buildings are split into wings */
  wing: string | null
  /** ext: parking / MLCP floors are not leasable */
  floor_use: 'Office' | 'Parking' | 'Retail' | 'Amenity'
  chargeable_area: number | null
  carpet_area: number | null
  /** derived: carpet / chargeable */
  efficiency: number | null
  occupancy_type: OccupancyType | null
  self_occupied_entity: string | null
  vacant_since: string | null
  /** INR / sq ft / month */
  asking_rent: number | null
  /** ext: availability listing */
  handover_condition: HandoverCondition | null
  available_from: string | null
}

export interface FloorUnit {
  unit_id: string
  org_id: string
  floor_id: string
  building_id: string
  unit_label: string
  chargeable_area: number | null
  carpet_area: number | null
  status: 'Available' | 'Leased' | 'Vacant'
}

export type AmenityType = 'Cafeteria' | 'Food court' | 'Crèche' | 'Gym' | 'Conference' | 'Hotel proximity' | 'Other'

export interface BuildingAmenity {
  amenity_id: string
  org_id: string
  building_id: string
  type: AmenityType
  capacity: number | null
  notes: string | null
}

export interface CampusAmenity {
  amenity_id: string
  org_id: string
  campus_id: string
  type: AmenityType
  capacity: number | null
  notes: string | null
}

export interface BuildingImage {
  image_id: string
  org_id: string
  building_id: string
  type: 'Exterior' | 'Amenity' | 'Typical floor' | 'Parking plan' | 'Other'
  caption: string | null
  display_order: number
  is_cover: boolean
  /** ext: downscaled image stored in the browser (no file server in the prototype) */
  data_url: string | null
}

export type SharingScope = 'Private (owner + AA)' | 'Shared with prospects' | 'Public'

export interface BuildingDocument {
  doc_id: string
  org_id: string
  building_id: string
  type: string
  /** file name only — no file server in the prototype */
  file_ref: string | null
  validity: string | null
  sharing_scope: SharingScope
  /** ext (v6 Reminders): how long before expiry to remind */
  reminder_lead: string
}

export interface Certification {
  cert_id: string
  org_id: string
  building_id: string
  scheme: 'LEED' | 'IGBC' | 'GRIHA' | 'WELL' | 'ECBC' | 'GRESB'
  level: string | null
  validity: string | null
}

export interface OwnershipHistory {
  history_id: string
  org_id: string
  building_id: string
  floor_id: string | null
  unit_id: string | null
  owner_name: string
  ownership_pct: number | null
  event_type: 'Grant' | 'Mutation' | 'Sale' | 'Transfer' | 'Mortgage' | 'Release'
  from_date: string | null
  to_date: string | null
  encumbrance: string | null
}

export interface OwnerContact {
  contact_id: string
  org_id: string
  owner_id: string
  /** ext: strata owners belong to a specific building */
  building_id: string | null
  name: string
  email: string | null
  phone: string | null
  role: 'Committee member' | 'Representative' | 'Primary contact' | 'Strata unit owner'
  unit: string | null
  area: number | null
  ownership_pct: number | null
  is_primary: boolean
  /** ext, E1-S14: has signed the mandate */
  signed_mandate: boolean
}

/** ext (v6 Sharing & Access): share a document, category or building folder by email */
export interface DocumentShare {
  share_id: string
  org_id: string
  building_id: string | null
  scope: 'Single document' | 'Category' | 'Building folder'
  doc_id: string | null
  category: string | null
  email: string
  access: 'View only' | 'Comment' | 'Upload / Edit'
  expires_at: string | null
  status: 'Active' | 'Revoked'
}
