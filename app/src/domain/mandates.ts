// Mandate, campaign & GTM entities (PRD §5 "Mandate & GTM", epic E5) plus the v6 BD pipeline.

export type ExecMode = 'Internal (owner team)' | 'AA team' | 'External agency' | 'Hybrid'

export interface Swot {
  strengths: string[]
  weaknesses: string[]
  opportunities: string[]
  threats: string[]
}

/** E5-S06: the 12 pricing inputs. */
export interface PricingInputs {
  market_rent: number
  grade_adj_pct: number
  floor_plate_adj_pct: number
  vacancy_adj_pct: number
  fitout_adj_pct: number
  rent_free_months: number
  ti_per_sqft: number
  escalation_pct: number
  cam: number
  parking_per_slot: number
  term_years: number
  threshold_noi: number
}

export interface PricingVersion {
  version: number
  created_at: string
  created_by: string
  inputs: PricingInputs
  /** Recommended headline range, net effective starting rent and term average with escalation, ₹/sq ft/month */
  output: { low: number; high: number; effective: number; term_average?: number; above_threshold: boolean }
  note: string | null
}

export interface Mandate {
  mandate_id: string
  org_id: string
  building_id: string
  status: 'Active' | 'Expired' | 'Terminated'
  exec_mode: ExecMode
  /** ext, E5-S02: vendor linked when execution is external */
  vendor_id: string | null
  /** INR / sq ft / month — set by the owner (E2-S02) */
  threshold_noi: number | null
  /** 12-input pricing bridge, versioned (E5-S06) */
  pricing_model: { versions: PricingVersion[] }
  /** ext, E5-S04: four structured lists, AA-only */
  swot: Swot
  start: string
  expiry: string
}

export interface Vendor {
  vendor_id: string
  type: 'Marketing agency' | 'Campus management' | 'Tech vendor' | 'Other'
  name: string
  contact: string | null
  scope: string | null
}

export interface TargetOccupier {
  list_id: string
  org_id: string
  building_id: string
  mandate_id: string | null
  occupier_ref: string
  status: 'Identified' | 'Contacted' | 'Accepted' | 'Rejected'
  /** ext: where the target came from (E5-S05 vs S08) */
  source: 'AA research' | 'Auto-suggested'
  notes: string | null
}

export interface BuildingAssessment {
  assessment_id: string
  org_id: string
  building_id: string
  assessment_date: string
  assessor: string
  total_score: number | null
  grade: 'A+' | 'A' | 'B' | 'C' | null
  status: 'Draft' | 'Completed'
  /** ext, E5-S07: 14-day audit window */
  audit_due: string
}

export interface AssessmentCriterion {
  criterion_id: string
  org_id: string
  assessment_id: string
  criterion_name: string
  category: 'NBC' | 'LEED' | 'WELL' | 'Structural' | 'MEP' | 'Amenity' | 'Other'
  weight: number
  /** 0–10; null until scored */
  score: number | null
}

/** v6 BD pipeline: pre-mandate opportunities with a CRM ownership lock. */
export interface Opportunity {
  opp_id: string
  account_name: string
  /** user_id of the BD owner; null = released / unclaimed */
  owner_user_id: string | null
  /** extra users granted co-ownership through an access request */
  co_owners: string[]
  team: 'AA' | 'N8'
  stage: 'Prospect' | 'Qualified' | 'Proposal' | 'Negotiation' | 'Won' | 'Lost'
  deal_type: 'New office' | 'Expansion' | 'Renewal' | 'Relocation'
  /** mandate fee potential, ₹ lakh */
  potential_lakh: number | null
  probability: number | null
  last_activity: string
  notes: string | null
}

export interface AccessRequest {
  request_id: string
  opp_id: string
  requester_id: string
  status: 'Pending' | 'Approved' | 'Co-owned' | 'Declined'
  created_at: string
  /** No response by then → escalates to team leads */
  escalate_at: string
}
