// The AA physical assessment (E1-S06, E5-S03, E5-S07). The PRD calls it a "32-criterion scorecard" in E1/E5-S03
// and a "33-item site audit" in E5-S07; the merged BuildingAssessment uses the 33-item superset below.
import type { AssessmentCriterion } from '../domain/mandates'

type Cat = AssessmentCriterion['category']

export const ASSESSMENT_TEMPLATE: { name: string; category: Cat; weight: number }[] = [
  // Structural (14)
  { name: 'Structural stability certificate current', category: 'Structural', weight: 4 },
  { name: 'Seismic zone compliance', category: 'Structural', weight: 3 },
  { name: 'Floor-to-floor height ≥ 4.2 m', category: 'Structural', weight: 3 },
  { name: 'Floor loading ≥ 4 kN/m²', category: 'Structural', weight: 2 },
  { name: 'Façade condition', category: 'Structural', weight: 2 },
  // NBC / fire & life safety (16)
  { name: 'Fire NOC current', category: 'NBC', weight: 4 },
  { name: 'Sprinkler coverage', category: 'NBC', weight: 3 },
  { name: 'Addressable fire alarm', category: 'NBC', weight: 2 },
  { name: 'Pressurised staircases', category: 'NBC', weight: 2 },
  { name: 'Travel distance to exits', category: 'NBC', weight: 2 },
  { name: 'Accessibility (ramps, lifts, toilets)', category: 'NBC', weight: 2 },
  // MEP (26)
  { name: 'Power backup 100% (N+1)', category: 'MEP', weight: 4 },
  { name: 'Dual utility feed', category: 'MEP', weight: 3 },
  { name: 'HVAC plant type and age', category: 'MEP', weight: 4 },
  { name: 'Building management system', category: 'MEP', weight: 3 },
  { name: 'Lift waiting time < 30 s', category: 'MEP', weight: 3 },
  { name: 'Lift count per 100k sq ft', category: 'MEP', weight: 2 },
  { name: 'Water storage and STP', category: 'MEP', weight: 2 },
  { name: 'Fresh-air rate (ASHRAE 62.1)', category: 'MEP', weight: 3 },
  // LEED / sustainability (14)
  { name: 'Green certification level', category: 'LEED', weight: 5 },
  { name: 'Energy performance (EPI)', category: 'LEED', weight: 3 },
  { name: 'Renewable energy share', category: 'LEED', weight: 2 },
  { name: 'Rainwater harvesting', category: 'LEED', weight: 2 },
  { name: 'Waste segregation', category: 'LEED', weight: 2 },
  // WELL / occupant wellbeing (10)
  { name: 'Daylight access', category: 'WELL', weight: 3 },
  { name: 'Indoor air quality monitoring', category: 'WELL', weight: 3 },
  { name: 'Acoustic comfort', category: 'WELL', weight: 2 },
  { name: 'Biophilic / outdoor spaces', category: 'WELL', weight: 2 },
  // Amenity (16)
  { name: 'Food court / cafeteria capacity', category: 'Amenity', weight: 4 },
  { name: 'Parking ratio ≥ 1 / 1,000 sq ft', category: 'Amenity', weight: 4 },
  { name: 'Public transport access', category: 'Amenity', weight: 4 },
  { name: 'Crèche, gym and conference', category: 'Amenity', weight: 4 },
  // Other (4)
  { name: 'Site audit sign-off (assessor declaration)', category: 'Other', weight: 4 },
]

/** Weighted score out of 100; unscored items count as zero. */
export function assessmentScore(criteria: Pick<AssessmentCriterion, 'weight' | 'score'>[]) {
  const total = criteria.reduce((s, c) => s + c.weight, 0) || 1
  return Math.round((criteria.reduce((s, c) => s + c.weight * ((c.score ?? 0) / 10), 0) / total) * 1000) / 10
}

export const gradeBand = (score: number): 'A+' | 'A' | 'B' | 'C' => (score >= 85 ? 'A+' : score >= 70 ? 'A' : score >= 55 ? 'B' : 'C')
