// Read-only access to the demo dataset generated from PropTattva_Demo_Database.xlsx.
import raw from './mockData.json'
import type { Availability, Dataset, Park } from '../domain/legacy'

const db = raw as Dataset

export function getAllParks(): Park[] {
  return db.parks
}

export function getParksForOrg(orgId: string): Park[] {
  return db.parks.filter((p) => p.ownerId === orgId)
}

export function getAvailabilityForParks(parkIds: Set<string>): Availability[] {
  return db.availability.filter((a) => parkIds.has(a.parkId))
}

export function isOperational(p: Park) {
  return /^operational/i.test(p.status)
}

/** Owner orgs as named in the demo dataset (owner name is public on a park listing). */
export function getParkOwners(): { orgId: string; name: string }[] {
  return db.organisations.filter((o) => o.type === 'Owner').map((o) => ({ orgId: o.orgId, name: o.name }))
}
