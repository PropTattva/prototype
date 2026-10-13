import { useState } from 'react'
import type { Grade } from '../../domain/assets'
import Modal from '../../components/ui/Modal'

interface Input {
  key: string
  label: string
  options: { label: string; score: number }[]
  weight: number
  pointer: string
}

// Simplified base-build checklist (E1-S04). The 32-criterion AA assessment replaces it in Phase 4.
const INPUTS: Input[] = [
  { key: 'plate', label: 'Typical floor plate', weight: 15, pointer: 'Larger contiguous floor plates (40k+ sq ft) score highest with GCC occupiers.', options: [{ label: '< 20k sq ft', score: 0.3 }, { label: '20–40k sq ft', score: 0.7 }, { label: '40k+ sq ft', score: 1 }] },
  { key: 'height', label: 'Floor-to-floor height', weight: 10, pointer: 'Target ≥ 4.2 m floor-to-floor for raised floors and services.', options: [{ label: '< 3.6 m', score: 0.3 }, { label: '3.6–4.2 m', score: 0.7 }, { label: '≥ 4.2 m', score: 1 }] },
  { key: 'power', label: 'Power backup', weight: 15, pointer: 'Move to 100% DG backup with N+1 redundancy.', options: [{ label: '< 50%', score: 0.2 }, { label: '50–99%', score: 0.6 }, { label: '100% (N+1)', score: 1 }] },
  { key: 'hvac', label: 'HVAC', weight: 15, pointer: 'A central chilled-water plant with BMS is the A+ benchmark.', options: [{ label: 'Split / package units', score: 0.3 }, { label: 'VRV', score: 0.7 }, { label: 'Central chilled water + BMS', score: 1 }] },
  { key: 'green', label: 'Green certification', weight: 15, pointer: 'A LEED / IGBC Gold or better certification is now table stakes for MNC occupiers.', options: [{ label: 'None', score: 0 }, { label: 'Certified / Silver', score: 0.6 }, { label: 'Gold / Platinum', score: 1 }] },
  { key: 'parking', label: 'Parking ratio', weight: 10, pointer: 'Aim for at least 1 slot per 1,000 sq ft.', options: [{ label: '< 0.5 / 1,000 sq ft', score: 0.3 }, { label: '0.5–1 / 1,000 sq ft', score: 0.7 }, { label: '≥ 1 / 1,000 sq ft', score: 1 }] },
  { key: 'fire', label: 'Fire & life safety', weight: 10, pointer: 'Full sprinkler coverage, addressable fire alarm and pressurised staircases.', options: [{ label: 'NBC minimum', score: 0.5 }, { label: 'Sprinklered + addressable alarm', score: 1 }] },
  { key: 'age', label: 'Building age', weight: 10, pointer: 'Older assets close the gap with a façade, lobby and lift modernisation.', options: [{ label: '> 15 years', score: 0.3 }, { label: '5–15 years', score: 0.7 }, { label: '< 5 years', score: 1 }] },
]

export const gradeFor = (score: number): Grade => (score >= 85 ? 'A+' : score >= 70 ? 'A' : score >= 55 ? 'B' : 'C')

/** E1-S04: self-serve preliminary grade with upgrade pointers. */
export default function GradeCalculator({ current, canApply, onApply, onClose }: { current: Grade | null; canApply: boolean; onApply: (g: Grade) => void; onClose: () => void }) {
  const [picks, setPicks] = useState<Record<string, number>>(Object.fromEntries(INPUTS.map((i) => [i.key, 1])))
  const score = Math.round(INPUTS.reduce((s, i) => s + i.weight * i.options[picks[i.key]].score, 0))
  const grade = gradeFor(score)
  const pointers = INPUTS.filter((i) => i.options[picks[i.key]].score < 1)
    .sort((a, b) => b.weight * (1 - b.options[picks[b.key]].score) - a.weight * (1 - a.options[picks[a.key]].score))
    .slice(0, 3)

  return (
    <Modal
      title="Grade calculator"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>Close</button>
          {canApply && grade !== current && <button className="btn btn-gold" onClick={() => onApply(grade)}>Apply grade {grade}</button>}
        </>
      }
    >
      <p className="mb-3 text-xs">Enter the base-build specs to get a preliminary grade. AA’s 32-criterion assessment (Phase 4) sets the official grade.</p>
      <div className="max-h-[45vh] space-y-2.5 overflow-y-auto pr-1">
        {INPUTS.map((i) => (
          <label key={i.key} className="grid grid-cols-[1fr_1.3fr] items-center gap-2 text-xs">
            <span className="font-semibold text-ink">{i.label}</span>
            <select className="input py-1 text-xs" value={picks[i.key]} onChange={(e) => setPicks((p) => ({ ...p, [i.key]: Number(e.target.value) }))}>
              {i.options.map((o, k) => <option key={o.label} value={k}>{o.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-4 rounded-lg bg-royal-soft px-4 py-3">
        <span className="text-3xl font-extrabold text-royal">{grade}</span>
        <span className="text-xs text-royal-dark">
          Score <strong>{score}/100</strong>
          {current && <> · current grade {current}</>}
        </span>
      </div>
      {pointers.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs">
          {pointers.map((p) => <li key={p.key}>↑ <strong className="text-ink">{p.label}:</strong> {p.pointer}</li>)}
        </ul>
      )}
    </Modal>
  )
}
