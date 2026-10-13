// Read-only demo dataset (parks/blocks/floors/leases) from data/mockData.json.
// Phase 2-3 replace these with the PRD asset & leasing entities (Campus, Building, BuildingFloor, Lease…).

export type OrgType = 'PropTattva' | 'Owner' | 'Occupier' | 'Enabler'
export type PlanCode = 'OWNER_STARTER' | 'OWNER_GROWTH' | 'OWNER_ENTERPRISE'

export interface Organisation {
  orgId: string
  name: string
  type: OrgType
  planCode: PlanCode | null
  subscriptionStatus: string | null
}

export interface User {
  userId: string
  orgId: string
  name: string
  email: string
  role: string
}

export interface TopOccupier {
  occupier: string
  sft: number
}

export interface Park {
  parkId: string
  name: string
  ownerId: string
  location: string
  city: string
  status: string
  scale: string | null
  availabilityNote: string | null
  acres: number | null
  /** Built potential in million sft, parsed from the scale text */
  msft: number | null
  builtPotential: string | null
  operationalMsft: string | null
  underDevMsft: string | null
  tenants: string | null
  certification: string | null
  /** INR per sft per month (warm shell) */
  askingRent: number | null
  vacancyPct: number | null
  timeline: string | null
  handover: string | null
  occupiedSft: number
  availableSft: number
  topOccupiers: TopOccupier[]
}

export interface Block {
  blockId: string
  parkId: string
  name: string
  totalSft: number | null
}

export type FloorStatus = 'Occupied' | 'Vacant' | 'Parking' | 'Self-use'

export interface Floor {
  floorId: string
  blockId: string
  parkId: string
  floorNo: string
  wing: string | null
  use: string
  occupier: string | null
  areaSft: number | null
  status: FloorStatus
}

export interface Lease {
  leaseId: string
  parkId: string
  blockId: string
  floorNo: string
  wing: string | null
  occupier: string
  areaSft: number | null
  status: string
}

export interface Availability {
  availId: string
  parkId: string
  blockId: string | null
  blockName: string | null
  floorLabel: string
  wing: string | null
  areaSft: number | null
  handover: string
  timeline: string
  source: string
}

export interface Occupier {
  occupierId: string
  name: string
  sector: string
  isGcc: boolean
  isStartup: boolean
}

export interface Transaction {
  txnId: string
  parkId: string
  occupier: string
  areaSft: number | null
  rent: number | null
}

export interface Dataset {
  organisations: Organisation[]
  users: User[]
  parks: Park[]
  blocks: Block[]
  floors: Floor[]
  leases: Lease[]
  availability: Availability[]
  occupiers: Occupier[]
  transactions: Transaction[]
}
