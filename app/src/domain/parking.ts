// Parking & facilities entities (PRD §5 Bay, epic E6).

export type SlotType = 'Covered' | 'Open' | 'EV' | 'Visitor'

export interface Bay {
  bay_id: string
  org_id: string
  building_id: string
  /** ext: human bay ID shown on the plan, e.g. "B1-014" */
  bay_label: string
  level: 'B1' | 'B2' | 'B3' | 'Ground' | 'Upper'
  type: SlotType
  /** INR / slot / month override; null = building rate for the slot type */
  rate: number | null
  status: 'Available' | 'Allocated' | 'Reserved'
  /** ext, E6-S05: lease the bay is allocated to */
  lease_id: string | null
}

/** ext, E6-S01/S02: effective-dated rate per slot type with its escalation schedule. */
export interface ParkingRate {
  rate_id: string
  org_id: string
  building_id: string
  slot_type: SlotType
  /** INR / slot / month */
  rate: number
  effective_from: string
  escalation_pct: number | null
  escalation_freq: 'Annual' | 'Biennial' | 'Every 3 years' | null
}
