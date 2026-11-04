// CRM seed: each org's own book of fictional accounts, contacts and meetings (SAMPLE data, deterministic).
// The AA team's accounts carry over the v6 BD pipeline deals, with their stages.
import type { CrmAccount, CrmActivity, CrmContact, CrmPicklist } from '../domain/crm'
import { addDays, todayIso } from '../lib/dates'
import { rng } from '../lib/rng'

type Stage = CrmAccount['stage']
// name, domain, relationship, record type, city, industry, owner, stage, deal type, ₹ L, probability
type Spec = [string, string, string, string, string, string, string, Stage?, string?, number?, number?]

const BOOKS: Record<string, Spec[]> = {
  'ORG-AA': [
    ['Kestrel Retail Tech', 'kestrel.example', 'Occupier', 'BD', 'Bengaluru', 'Retail tech', 'U-AA-1', 'Prospect', 'Relocation', 35, 20],
    ['Northwind Analytics', 'northwind.example', 'Occupier', 'BD', 'Bengaluru', 'Analytics', 'U-AA-1', 'Prospect', 'Expansion', 50, 25],
    ['Bluepeak Bank GCC', 'bluepeak.example', 'Occupier', 'Pitch', 'Bengaluru', 'BFSI', 'U-AA-1', 'Qualified', 'Expansion', 45, 50],
    ['Tideway Energy Trading', 'tideway.example', 'Occupier', 'BD', 'Mumbai', 'Energy', 'U-AA-1', 'Qualified', 'New office', 32, 40],
    ['Sterling Harbour Bank', 'sterlingharbour.example', 'Occupier', 'Pitch', 'Bengaluru', 'BFSI', 'U-AA-1', 'Proposal', 'New office', 30, 85],
    ['Acme GCC India', 'acmegcc.example', 'Occupier', 'CRM', 'Bengaluru', 'Technology', 'U-AA-1', 'Won', 'Expansion', 65, 100],
    ['Orion Search India', 'orionsearch.example', 'Occupier', 'BD', 'Gurugram', 'Internet', 'U-AA-2', 'Proposal', 'Expansion', 90, 60],
    ['Helix Pharma GCC', 'helixpharma.example', 'Occupier', 'BD', 'Mumbai', 'Pharma', 'U-AA-2', 'Negotiation', 'Relocation', 55, 70],
    ['Vantage Mobility', 'vantagemobility.example', 'Occupier', 'BD', 'Gurugram', 'Automotive', 'U-AA-2', 'Qualified', 'New office', 25, 35],
    ['Meridian Developers', 'meridian.example', 'Owner', 'Partner', 'Gurugram', 'Real estate', 'U-AA-2'],
    ['Skyline Infra Developers', 'skylineinfra.example', 'Owner', 'Network', 'Mumbai', 'Real estate', 'U-AA-1'],
  ],
  // PropTattva (platform owner): owners and REITs it is pitching the platform to.
  'ORG-PT': [
    ['Banyan Realty Trust', 'banyanreit.example', 'Owner', 'Pitch', 'Bengaluru', 'REIT', 'U-ADMIN', 'Prospect', 'Investment', 120, 15],
    ['Harbour Holdings', 'harbour.example', 'Owner', 'BD', 'Mumbai', 'Real estate', 'U-ADMIN', 'Qualified', 'Property development', 40, 50],
    ['Lakeview Commercial REIT', 'lakeviewreit.example', 'Owner', 'Network', 'Gurugram', 'REIT', 'U-ADMIN'],
  ],
  'OWN-1': [
    ['Cobalt Payments', 'cobaltpay.example', 'Occupier', 'BD', 'Bengaluru', 'Fintech', 'U-OWN-1', 'Proposal', 'New office', 80, 60],
    ['Redwood Insurance GCC', 'redwoodins.example', 'Occupier', 'Pitch', 'Bengaluru', 'Insurance', 'U-OWN-1', 'Qualified', 'Expansion', 140, 40],
    ['Arclight Semiconductors', 'arclight.example', 'Occupier', 'BD', 'Bengaluru', 'Semiconductors', 'U-OWN-1B', 'Prospect', 'New office', 200, 20],
    ['Nimbus Cloud Labs', 'nimbuscloud.example', 'Occupier', 'CRM', 'Bengaluru', 'Technology', 'U-OWN-1', 'Won', 'Renewal', 95, 100],
    ['Juniper Health', 'juniperhealth.example', 'Occupier', 'CRM', 'Gurugram', 'Healthcare', 'U-OWN-1B'],
    ['Crestline Advisors', 'crestline.example', 'Broker', 'Partner', 'Mumbai', 'Brokerage', 'U-OWN-1'],
    ['Granite Park Developers', 'granitepark.example', 'Owner', 'Network', 'Bengaluru', 'Real estate', 'U-OWN-1'],
    ['Verity Consulting', 'verity.example', 'Occupier', 'Hire', 'Bengaluru', 'Consulting', 'U-OWN-1B'],
  ],
  'OWN-2': [
    ['Polaris Logistics', 'polarislog.example', 'Occupier', 'BD', 'Gurugram', 'Logistics', 'U-OWN-2', 'Qualified', 'New office', 60, 35],
    ['Monsoon Media', 'monsoonmedia.example', 'Occupier', 'Pitch', 'Gurugram', 'Media', 'U-OWN-2', 'Prospect', 'Relocation', 40, 20],
    ['Saffron Foods', 'saffronfoods.example', 'Occupier', 'CRM', 'Gurugram', 'FMCG', 'U-OWN-2'],
    ['Coastal Estates', 'coastalestates.example', 'Owner', 'Partner', 'Mumbai', 'Real estate', 'U-OWN-2'],
  ],
  'OWN-3': [
    ['Quill Learning', 'quill.example', 'Occupier', 'BD', 'Mumbai', 'Edtech', 'U-OWN-3', 'Negotiation', 'New office', 45, 70],
    ['Lumen Design Studio', 'lumendesign.example', 'Occupier', 'Pitch', 'Mumbai', 'Design', 'U-OWN-3B', 'Prospect', 'New office', 15, 25],
    ['Helix Pharma GCC', 'helixpharma.example', 'Occupier', 'BD', 'Mumbai', 'Pharma', 'U-OWN-3', 'Qualified', 'Relocation', 70, 40],
  ],
  'OCC-1': [
    ['Northstar Estates', 'northstar.example', 'Owner', 'CRM', 'Bengaluru', 'Real estate', 'U-OCC-1'],
    ['Meridian Developers', 'meridian.example', 'Owner', 'BD', 'Gurugram', 'Real estate', 'U-OCC-1', 'Proposal', 'Expansion', 0, 50],
    ['Trinity Realty', 'trinity.example', 'Owner', 'Network', 'Mumbai', 'Real estate', 'U-OCC-1'],
    ['Granite Park Developers', 'granitepark.example', 'Owner', 'Network', 'Bengaluru', 'Real estate', 'U-OCC-1'],
  ],
  'ENB-1': [
    ['Bluepeak Bank GCC', 'bluepeak.example', 'Occupier', 'BD', 'Bengaluru', 'BFSI', 'U-ENB-1', 'Qualified', 'Expansion', 25, 40],
    ['Polaris Logistics', 'polarislog.example', 'Occupier', 'Pitch', 'Gurugram', 'Logistics', 'U-ENB-1', 'Proposal', 'New office', 18, 60],
    ['Northstar Estates', 'northstar.example', 'Owner', 'Partner', 'Bengaluru', 'Real estate', 'U-ENB-1'],
    ['Trinity Realty', 'trinity.example', 'Owner', 'Network', 'Mumbai', 'Real estate', 'U-ENB-1'],
    ['Saffron Foods', 'saffronfoods.example', 'Occupier', 'CRM', 'Gurugram', 'FMCG', 'U-ENB-1'],
  ],
}

/** Colleagues who join meetings, per org. */
const TEAM: Record<string, string[]> = {
  'ORG-AA': ['U-AA-1', 'U-AA-2'],
  'ORG-PT': ['U-ADMIN'],
  'OWN-1': ['U-OWN-1', 'U-OWN-1B'],
  'OWN-2': ['U-OWN-2'],
  'OWN-3': ['U-OWN-3', 'U-OWN-3B'],
  'OCC-1': ['U-OCC-1'],
  'ENB-1': ['U-ENB-1'],
}

const FIRST = ['Neha', 'Rajat', 'Aditi', 'Karthik', 'Ishaan', 'Pooja', 'Siddharth', 'Tanvi', 'Manish', 'Ritika', 'Varun', 'Shreya', 'Anil', 'Divya', 'Gaurav', 'Meghna', 'Rohit', 'Lakshmi', 'Imran', 'Nandini']
const LAST = ['Kulkarni', 'Bhatia', 'Menon', 'Srinivasan', 'Chopra', 'Joshi', 'Banerjee', 'Pillai', 'Agarwal', 'Sethi', 'Rao', 'Gupta', 'Hegde', 'Das', 'Malik', 'Venkatesh', 'Trivedi', 'Fernandes']
const TITLES_OCC = ['Head of Real Estate', 'VP – Workplace', 'Director – Facilities', 'CFO', 'Country Head', 'Head – Corporate Real Estate', 'Head of Admin']
const TITLES_OWN = ['Leasing Head', 'Managing Director', 'VP – Asset Management', 'Head of Business Development', 'Director – Investments']

const NOTES: Record<string, string[]> = {
  'Intro Meeting': ['First meeting. Walked through the portfolio; they are mapping options for the next 12–18 months.', 'Introductory call — shared the firm overview and agreed to stay in touch on their expansion plans.'],
  'Periodic-Catch Up': ['Quarterly catch-up. Headcount growing ~15% this year; current space is at 90% utilisation.', 'Catch-up over coffee. No immediate requirement, but they flagged a possible consolidation next year.'],
  Pitch: ['Pitched two options with plug-and-play floors. Interested in the larger floor plate; want commercials.', 'Presented the campus and amenities. They asked for a test-fit and parking ratios.'],
  'Follow-Up': ['Followed up on the shortlist. Waiting on internal approval from their APAC team.', 'Shared revised floor options; they want a site visit with their CFO.'],
  'Review/Update': ['Reviewed requirement: 60–80k sq ft, Grade A, metro access. Timeline Q2 next year.', 'Update on their board approval — budget cleared, moving to term sheet.'],
  Negotiation: ['Negotiated rent-free period and fit-out contribution. Gap of ₹4/sq ft on rent.', 'Discussed escalation and lock-in; they want a 3-year lock-in instead of 5.'],
  'Site Visit': ['Site visit with their facilities team. Liked the floor plate; concerned about parking.', 'Toured two buildings. Shortlisted the newer tower.'],
  'Hiring discussion': ['Explored a senior leasing hire; candidate keen, notice period 60 days.'],
}

const PURPOSE_FLOW = ['Intro Meeting', 'Pitch', 'Follow-Up', 'Site Visit', 'Review/Update', 'Negotiation', 'Periodic-Catch Up']
const NEXT_FOR: Record<string, string> = { BD: 'Follow-up', Pitch: 'Proposal', CRM: 'General', Network: 'Network', Hire: 'Future', Partner: 'Collab' }

export function createCrmSeed() {
  const today = todayIso()
  const crm_accounts: CrmAccount[] = []
  const crm_contacts: CrmContact[] = []
  const crm_activities: CrmActivity[] = []
  const crm_picklists: CrmPicklist[] = []
  let n = 0

  for (const [org, specs] of Object.entries(BOOKS)) {
    specs.forEach(([name, domain, rel, rec, city, industry, owner, stage, deal, lakh, prob], i) => {
      const r = rng(`${org}-${name}`)
      const id = `ACC-${org.replace('-', '')}-${String(i + 1).padStart(2, '0')}`
      const created = addDays(today, -r.int(150, 220))
      crm_accounts.push({
        account_id: id, org_id: org, name, domain, relationship_type: rel, record_type: rec, city, industry, owner_user_id: owner,
        stage: stage ?? null, deal_type: deal ?? null, potential_lakh: stage && lakh ? lakh : null, probability: stage ? prob ?? null : null,
        notes: null, created_by: owner, created_at: `${created}T09:00:00.000Z`,
      })

      // Contacts: 1–3 people per firm
      const people: string[] = []
      const titles = rel === 'Owner' ? TITLES_OWN : TITLES_OCC
      for (let k = 0; k < r.int(1, 3); k++) {
        const first = r.pick(FIRST)
        const last = r.pick(LAST)
        const cid = `CON-${id.slice(4)}-${k + 1}`
        people.push(cid)
        crm_contacts.push({
          contact_id: cid, org_id: org, account_id: id, first_name: first, last_name: last, title: titles[(i + k) % titles.length],
          email: `${first}.${last}${k ? k + 1 : ''}@${domain}`.toLowerCase(), phone_cc: '+91', phone: `9${r.int(100000000, 999999999)}`,
          city, created_by: owner, created_at: `${created}T09:00:00.000Z`,
        })
      }

      // Meetings: 2–5 over the account's life, the latest one carrying the open next action
      const count = r.int(2, 5)
      const team = TEAM[org]
      let day = -r.int(120, 170)
      for (let k = 0; k < count; k++) {
        const last = k === count - 1
        const date = last ? addDays(today, -r.int(1, 18)) : addDays(today, day)
        const purpose = rec === 'Hire' ? 'Hiring discussion' : PURPOSE_FLOW[Math.min(k, PURPOSE_FLOW.length - 1)]
        const medium = purpose === 'Site Visit' ? 'Site visit' : k === 0 ? 'F2F' : r.pick(['F2F', 'Call', 'Video', 'F2F', 'Email', 'Group Meeting'])
        const colleague = team.length > 1 && r.chance(0.4) ? team.find((u) => u !== owner)! : null
        // Spread the open follow-ups: some overdue, some due soon, some further out.
        const nextIn = (n++ % 5) - 2 + r.int(0, 2) * (n % 2 ? 1 : 6)
        crm_activities.push({
          activity_id: `MTG-${id.slice(4)}-${k + 1}`, org_id: org, account_id: id,
          contact_ids: people.slice(0, k === 0 ? 1 : r.int(1, people.length)),
          date, record_type: rec, city: medium === 'Call' || medium === 'Video' || medium === 'Email' ? city : r.chance(0.85) ? city : r.pick(['Bengaluru', 'Gurugram', 'Mumbai']),
          medium, purpose, primary_attendee_id: owner, additional_attendees: [colleague, r.chance(0.12) ? 'External – broker partner' : null].filter((x): x is string => !!x),
          notes: r.pick(NOTES[purpose]),
          next_action: NEXT_FOR[rec] ?? 'Follow-up',
          next_action_date: last ? addDays(today, nextIn) : addDays(date, r.int(5, 14)),
          next_action_done: !last,
          created_by: colleague && r.chance(0.3) ? colleague : owner,
          created_at: `${date}T12:00:00.000Z`,
        })
        day += r.int(15, 35)
        if (addDays(today, day) >= today) day = -r.int(20, 30)
      }
    })
  }

  // Northstar has extended its dropdowns, to show org-specific values.
  crm_picklists.push({
    org_id: 'OWN-1', list: 'relationship_type',
    values: [{ value: 'Occupier', active: true }, { value: 'Owner', active: true }, { value: 'Broker', active: true }],
  })

  return { crm_accounts, crm_contacts, crm_activities, crm_picklists }
}
