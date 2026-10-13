// Platform & access entities — field names follow the Alpha PRD §5 data dictionary verbatim.
import type {
  Building, BuildingAmenity, BuildingDocument, BuildingFloor, BuildingImage, Campus, CampusAmenity, Certification,
  DocumentShare, FloorUnit, Mandate, Owner, OwnerContact, OwnershipHistory,
} from './assets'
import type { LeaseDoc, Lease, LeaseRenewal, LeaseSpace, Occupier, OccupierBrokerLog, RelationshipLog, RentInvoice } from './leasing'

export type OrgType = 'PropTattva' | 'Owner' | 'Occupier' | 'Enabler'
export type EnablerType =
  | 'Broker firm'
  | 'Campus management company'
  | 'Architecture firm'
  | 'Marketing agency'
  | 'Tech vendor'
  | 'Other'
export type OrgStatus = 'Active' | 'Suspended' | 'Pending'

export interface Organisation {
  org_id: string
  name: string
  type: OrgType
  enabler_type: EnablerType | null
  status: OrgStatus
  created_at: string
}

export type Role = 'Super Admin' | 'AA' | 'Owner/Developer' | 'Occupier' | 'Enabler'
export type UserStatus = 'Active' | 'Invited' | 'Disabled'

export interface User {
  user_id: string
  org_id: string
  name: string
  email: string
  phone: string | null
  role: Role
  status: UserStatus
  last_login: string | null
}

export type InviteStatus = 'Pending' | 'Accepted' | 'Expired' | 'Revoked'

export interface Invite {
  invite_id: string
  org_id: string
  email: string
  role: Role
  token: string
  expires_at: string
  status: InviteStatus
}

export type PlanAppliesTo = 'Owner' | 'Occupier' | 'Enabler'

export interface SubscriptionPlan {
  plan_code: string
  name: string
  applies_to: PlanAppliesTo
  default_seat_limit: number
  feature_flags: string[]
  /** e.g. { buildings: 10 }; a missing key or null means unlimited */
  quotas: Record<string, number | null>
  /** INR per month; null = custom pricing */
  price: number | null
  status: 'Active' | 'Retired'
}

export interface Subscription {
  subscription_id: string
  org_id: string
  plan_code: string
  seat_limit: number
  start: string
  end: string | null
  status: 'Active' | 'Expired' | 'Trial'
}

export type AuditAction = 'Create' | 'Update' | 'Delete' | 'Read' | 'Login' | 'Export'

export interface AuditEntry {
  audit_id: string
  /** org that owns the affected record (or the actor's org for logins) */
  org_id: string | null
  /** actor; "SYSTEM" for automatic changes such as invite expiry */
  user_id: string
  /** set when the actor was impersonating via View as */
  on_behalf_of: string | null
  entity: string
  entity_id: string
  entity_label: string
  action: AuditAction
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  source_tag: 'Manual' | 'PT-Verified' | 'Propstack' | 'Owner-Declared' | 'System'
  timestamp: string
}

/** The whole in-browser database. */
export interface PlatformDb {
  organisations: Organisation[]
  users: User[]
  invites: Invite[]
  plans: SubscriptionPlan[]
  subscriptions: Subscription[]
  audit_log: AuditEntry[]
  // assets (E1)
  campuses: Campus[]
  owners: Owner[]
  buildings: Building[]
  floors: BuildingFloor[]
  units: FloorUnit[]
  building_amenities: BuildingAmenity[]
  campus_amenities: CampusAmenity[]
  images: BuildingImage[]
  documents: BuildingDocument[]
  certifications: Certification[]
  ownership_history: OwnershipHistory[]
  owner_contacts: OwnerContact[]
  document_shares: DocumentShare[]
  mandates: Mandate[]
  // leasing (E2–E4)
  occupiers: Occupier[]
  leases: Lease[]
  lease_spaces: LeaseSpace[]
  renewals: LeaseRenewal[]
  lease_docs: LeaseDoc[]
  rent_invoices: RentInvoice[]
  broker_log: OccupierBrokerLog[]
  relationship_log: RelationshipLog[]
}
