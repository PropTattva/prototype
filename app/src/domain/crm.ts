// CRM for every persona: accounts (firms), contacts (people met) and activities (meetings).
// Each org keeps its own book — visible to everyone in that org, never to other orgs.
// The v6 BD pipeline lives here too: an account enters the pipeline once it has a BD stage.

/** The dropdowns each org can extend. Values are free text so orgs can add their own. */
export type PicklistKey = 'record_type' | 'relationship_type' | 'meeting_medium' | 'meeting_purpose' | 'next_action'

export interface PicklistValue {
  value: string
  /** Retired values stay on old records but are no longer offered. */
  active: boolean
}

/** One org's copy of one dropdown. Missing = the platform defaults. */
export interface CrmPicklist {
  org_id: string
  list: PicklistKey
  values: PicklistValue[]
}

export const BD_STAGES = ['Prospect', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'] as const
export type BdStage = (typeof BD_STAGES)[number]

export interface CrmAccount {
  account_id: string
  org_id: string
  name: string
  /** Website / email domain, e.g. kestrel.example — links contacts by email */
  domain: string | null
  record_type: string
  relationship_type: string
  city: string | null
  industry: string | null
  owner_user_id: string
  /** null = not in the BD pipeline */
  stage: BdStage | null
  deal_type: string | null
  /** fee / deal potential, ₹ lakh */
  potential_lakh: number | null
  probability: number | null
  notes: string | null
  created_by: string
  created_at: string
}

export interface CrmContact {
  contact_id: string
  org_id: string
  account_id: string
  first_name: string
  last_name: string
  title: string | null
  /** Official email only — personal mailboxes are rejected */
  email: string | null
  /** Dialling code, default +91 */
  phone_cc: string
  phone: string | null
  city: string | null
  created_by: string
  created_at: string
}

export interface CrmActivity {
  activity_id: string
  org_id: string
  account_id: string
  /** People met (at least one) */
  contact_ids: string[]
  date: string
  record_type: string
  city: string
  medium: string
  purpose: string
  /** Defaults to whoever logs it; editable when a colleague logs on someone's behalf */
  primary_attendee_id: string
  /** Colleagues (user ids) or other attendees by name */
  additional_attendees: string[]
  notes: string | null
  next_action: string | null
  next_action_date: string | null
  next_action_done: boolean
  created_by: string
  created_at: string
}
