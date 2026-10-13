import type { Session } from '../../access/session'

export interface NavItem {
  path: string
  label: string
  icon: string
  /** Plan feature; shown with a lock (upsell) when the org's plan lacks it */
  feature?: string
}
export interface NavSection {
  title: string
  items: NavItem[]
}

const I = {
  dash: { path: 'portfolio', label: 'Dashboard', icon: '▣', feature: 'portfolio_dashboard' },
  campuses: { path: 'campuses', label: 'Campuses', icon: '⌂', feature: 'campus' },
  buildings: { path: 'buildings', label: 'Buildings', icon: '▤', feature: 'registry' },
  stacking: { path: 'stacking', label: 'Stacking plan', icon: '☰', feature: 'stacking' },
  availability: { path: 'availability', label: 'Availability', icon: '◌' },
  leases: { path: 'leases', label: 'Leases', icon: '≡', feature: 'basic_leasing' },
  renewals: { path: 'renewals', label: 'Renewals', icon: '↻', feature: 'lease_crm' },
  ledger: { path: 'ledger', label: 'Rent ledger', icon: '₹', feature: 'invoicing' },
  occupiers: { path: 'occupiers', label: 'Occupiers', icon: '◍' },
  brokers: { path: 'broker-log', label: 'Broker log', icon: '⇄' },
  vault: { path: 'vault', label: 'Compliance Vault', icon: '◫', feature: 'documents' },
  reminders: { path: 'reminders', label: 'Reminders', icon: '◉' },
  sharing: { path: 'sharing', label: 'Sharing & Access', icon: '⇆', feature: 'documents' },
  owners: { path: 'owners', label: 'Owners & contacts', icon: '◎' },
  comparables: { path: 'comparables', label: 'Rent comparables', icon: '≈' },
  team: { path: 'team', label: 'Team & seats', icon: '◍' },
  subscription: { path: 'subscription', label: 'Subscription', icon: '★' },
}

/** Sidebar per role. Screens still check access themselves; this only decides what is offered. */
export function navFor(s: Session): NavSection[] {
  switch (s.role) {
    case 'Super Admin':
      return [
        { title: 'Admin console', items: [
          { path: 'admin', label: 'Overview', icon: '◆' },
          { path: 'admin/organisations', label: 'Organisations', icon: '◫' },
          { path: 'admin/users', label: 'Users', icon: '◍' },
          { path: 'admin/invites', label: 'Invites', icon: '✉' },
          { path: 'admin/plans', label: 'Plans', icon: '★' },
          { path: 'admin/subscriptions', label: 'Subscriptions', icon: '≡' },
          { path: 'admin/audit', label: 'Audit log', icon: '◉' },
          { path: 'admin/view-as', label: 'View as', icon: '⇆' },
        ] },
        { title: 'Assets', items: [{ ...I.dash, label: 'Portfolio' }, I.campuses, I.buildings, I.stacking, I.availability, I.owners] },
        { title: 'Leasing', items: [I.leases, I.renewals, I.ledger, I.occupiers, I.brokers, I.comparables] },
        { title: 'Vault', items: [I.vault, I.reminders, I.sharing] },
      ]
    case 'AA':
      return [
        { title: 'Mandated assets', items: [{ ...I.dash, label: 'Portfolio' }, I.campuses, I.buildings, I.stacking, I.availability] },
        { title: 'Leasing', items: [I.leases, I.renewals, I.ledger, I.occupiers, I.brokers, I.comparables] },
        { title: 'Vault', items: [I.vault, I.reminders] },
        { title: 'Security', items: [{ path: 'audit', label: 'Audit log', icon: '◉' }] },
      ]
    case 'Owner/Developer':
      return [
        { title: 'Portfolio', items: [I.dash, I.campuses, I.buildings, I.stacking, I.availability] },
        { title: 'Leasing', items: [I.leases, I.renewals, I.ledger, I.occupiers, I.brokers] },
        { title: 'Vault', items: [I.vault, I.reminders, I.sharing, I.owners] },
        { title: 'Market', items: [I.comparables] },
        { title: 'Account', items: [I.team, I.subscription] },
      ]
    case 'Occupier':
      return [
        { title: 'Discover', items: [{ path: 'home', label: 'Home', icon: '▣' }, { ...I.buildings, label: 'Buildings', feature: undefined }, I.availability, I.stacking, I.comparables] },
        { title: 'Account', items: [I.team, I.subscription] },
      ]
    default:
      return [
        { title: 'Listings', items: [{ path: 'home', label: 'Home', icon: '▣' }, { ...I.buildings, label: 'Listings', feature: undefined }, I.availability, I.comparables] },
        { title: 'Introductions', items: [{ ...I.brokers, label: 'My introductions' }] },
        { title: 'Account', items: [I.team, I.subscription] },
      ]
  }
}

export function homePath(s: Session) {
  if (s.role === 'Super Admin') return 'admin'
  if (s.role === 'AA' || s.role === 'Owner/Developer') return 'portfolio'
  return 'home'
}

/** Paths each role may open (first path segment). */
export function allowedSections(s: Session): Set<string> {
  return new Set(navFor(s).flatMap((sec) => sec.items.map((i) => i.path.split('/')[0])))
}
