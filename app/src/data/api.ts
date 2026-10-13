// The only module that touches mock data. Every screen reads through these functions,
// so swapping in a real API later means changing this file only.
import raw from './mockData.json'
import type { Availability, Dataset, Organisation, Park, Scope } from '../types'

const db = raw as Dataset

/** Row-level scoping (PRD §7): Admin sees everything, an Owner org only its own parks. */
function inScope(scope: Scope, ownerId: string) {
  return scope.role === 'admin' || scope.ownerId === ownerId
}

export function getOwnerOrgs(): Organisation[] {
  return db.organisations.filter((o) => o.type === 'Owner')
}

export function getOrganisations(): Organisation[] {
  return db.organisations
}

export function getOrg(orgId: string): Organisation | undefined {
  return db.organisations.find((o) => o.orgId === orgId)
}

export function getParks(scope: Scope): Park[] {
  return db.parks.filter((p) => inScope(scope, p.ownerId))
}

export function getPark(scope: Scope, parkId: string): Park | undefined {
  return getParks(scope).find((p) => p.parkId === parkId)
}

export function getAvailability(scope: Scope): Availability[] {
  const ids = new Set(getParks(scope).map((p) => p.parkId))
  return db.availability.filter((a) => ids.has(a.parkId))
}

export function isOperational(p: Park) {
  return /^operational/i.test(p.status)
}
