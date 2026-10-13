// Leasing & occupier entities (PRD §5, epics E2–E4).

export type SourceTag = 'Manual' | 'PT-Verified' | 'Propstack' | 'Owner-Declared'

export interface Occupier {
  occupier_id: string
  name: string
  sector_tag: 'IT/ITeS' | 'BFSI' | 'Flex/Co-working' | 'Consulting' | 'Manufacturing' | 'Pharma/Healthcare' | 'EV/Mobility' | 'Retail' | 'Other'
  is_gcc: boolean
  is_startup: boolean
  parent_company: string | null
  parent_country: string | null
}

export interface Lease {
  lease_id: string
  org_id: string
  building_id: string
  /** primary floor */
  floor_id: string
  unit_id: string | null
  occupier_id: string
  /** sq ft */
  area: number
  /** INR / sq ft / month */
  rent: number | null
  CAM: number | null
  escalation_pct: number | null
  escalation_freq: 'Annual' | 'Biennial' | 'Every 3 years' | null
  rent_free_months: number | null
  rent_free_conditions: string | null
  /** INR / sq ft */
  TI_contribution: number | null
  start: string
  expiry: string
  break_date: string | null
  deposit: number | null
  deposit_months: number | null
  deposit_form: 'Cash' | 'Bank Guarantee' | null
  deposit_received: boolean
  received_date: string | null
  parking_slots: number | null
  source_tag: SourceTag
  status: 'Draft' | 'Active' | 'Expired' | 'Terminated'
}

export interface LeaseSpace {
  space_id: string
  org_id: string
  lease_id: string
  floor_id: string
  unit_id: string | null
  area: number
}

export interface LeaseRenewal {
  renewal_id: string
  org_id: string
  lease_id: string
  stage: 'Initiated' | 'Negotiating' | 'Agreed' | 'Lost'
  /** user_id */
  assignee: string | null
  target_date: string | null
  /** ext: next steps / tasks (E3-S11) */
  notes: string | null
}

export interface LeaseDoc {
  doc_id: string
  org_id: string
  lease_id: string
  file_ref: string | null
  abstract: string | null
}

export interface RentInvoice {
  rent_id: string
  org_id: string
  lease_id: string
  invoice_no: string
  /** YYYY-MM */
  period: string
  /** pre-GST amount, INR */
  amount: number
  /** GST % */
  gst: number
  paid_amount: number
  paid_date: string | null
  /** ext: drives the aged bucket */
  due_date: string
  source_tag: SourceTag
}

export interface OccupierBrokerLog {
  log_id: string
  occupier_id: string
  broker_org_id: string
  building_id: string
  /** ext: owning org of the building, so owners can read logs on their assets */
  owner_org_id: string
  timestamp: string
  status: 'Registered' | 'Duplicate' | 'Expired'
  notes: string | null
}

/** ext, E3-S10: post-signing occupier relationship log */
export interface RelationshipLog {
  log_id: string
  org_id: string
  lease_id: string
  date: string
  type: 'Meeting' | 'Issue' | 'Request' | 'Note'
  summary: string
}
