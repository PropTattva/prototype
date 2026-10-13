import type { Session } from '../../access/session'

export interface NavItem {
  path: string
  label: string
  icon: string
}
export interface NavSection {
  title: string
  items: NavItem[]
}

/** Sidebar per role. Screens still check access themselves; this only decides what is offered. */
export function navFor(s: Session): NavSection[] {
  const portfolio = { path: 'portfolio', label: 'Dashboard', icon: '▣' }
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
        ] },
        { title: 'Security', items: [
          { path: 'admin/audit', label: 'Audit log', icon: '◉' },
          { path: 'admin/view-as', label: 'View as', icon: '⇆' },
        ] },
        { title: 'Portfolio', items: [{ ...portfolio, label: 'All parks' }] },
      ]
    case 'AA':
      return [
        { title: 'Portfolio', items: [{ ...portfolio, label: 'All parks' }] },
        { title: 'Security', items: [{ path: 'audit', label: 'Audit log', icon: '◉' }] },
      ]
    case 'Owner/Developer':
      return [
        { title: 'Portfolio', items: [portfolio] },
        { title: 'Account', items: [
          { path: 'team', label: 'Team & seats', icon: '◍' },
          { path: 'subscription', label: 'Subscription', icon: '★' },
        ] },
      ]
    default:
      return [
        { title: 'Workspace', items: [{ path: 'home', label: 'Home', icon: '▣' }] },
        { title: 'Account', items: [
          { path: 'team', label: 'Team & seats', icon: '◍' },
          { path: 'subscription', label: 'Subscription', icon: '★' },
        ] },
      ]
  }
}

export function homePath(s: Session) {
  if (s.role === 'Super Admin') return 'admin'
  if (s.role === 'AA' || s.role === 'Owner/Developer') return 'portfolio'
  return 'home'
}
