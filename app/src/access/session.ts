import type { Organisation, Role, Subscription, SubscriptionPlan, User } from '../domain/platform'

/** Who is making a request. Resolved fresh from the store on every render, so plan/role changes apply immediately. */
export interface Session {
  user: User
  org: Organisation
  role: Role
  subscription: Subscription | null
  plan: SubscriptionPlan | null
  /** The signed-in person; differs from `user` while a Super Admin uses View as */
  actor: User
  /** View as is read-only (EP-C-S03) */
  readOnly: boolean
}

export const isInternal = (s: Session) => s.role === 'Super Admin' || s.role === 'AA'
