import type { Session } from '../access/session'
import type { EntityKey } from '../entities/types'
import { href } from '../state/router'

const ADMIN_SLUG: Partial<Record<EntityKey, string>> = {
  organisation: 'organisations',
  user: 'users',
  invite: 'invites',
  plan: 'plans',
  subscription: 'subscriptions',
}

/** Where a record of a given entity opens for this viewer (null = no page for it). */
export function linkFor(s: Session) {
  return (entity: EntityKey, id: string): string | null => {
    switch (entity) {
      case 'building':
        return href(`buildings/${id}`)
      case 'campus':
        return href(`campuses/${id}`)
      case 'lease':
        return href(`leases/${id}`)
      case 'occupier':
        return href(`occupiers/${id}`)
      case 'owner':
        return href(`owners/${id}`)
      default:
        if (ADMIN_SLUG[entity]) {
          if (s.role === 'Super Admin') return href(`admin/${ADMIN_SLUG[entity]}/${id}`)
          if (entity === 'user') return href(`team/users/${id}`)
          if (entity === 'invite') return href(`team/invites/${id}`)
        }
        return null
    }
  }
}
