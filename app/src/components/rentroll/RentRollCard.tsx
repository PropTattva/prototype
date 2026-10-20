import type { Lease } from '../../domain/leasing'
import type { OptionCtx } from '../../entities/types'
import { fmtDate, todayIso } from '../../lib/dates'
import { fmtSft } from '../../lib/format'
import { cr, rollRow, rollTotals } from '../../lib/rentRoll'
import Card from '../ui/Card'
import { useToast } from '../ui/Toast'

/** Rent roll summary for a set of leases (portfolio, city or building), with a CSV export of the schedule. */
export default function RentRollCard({ leases, ctx, scope }: { leases: Lease[]; ctx: OptionCtx; scope: string }) {
  const toast = useToast()
  const today = todayIso()
  const rows = leases.filter((l) => l.status === 'Active').map((l) => rollRow(l, today))
  // Commercials are owner-only: if they're stripped for this viewer there's no rent roll to show.
  if (!rows.length || rows.every((r) => !('rent' in r.lease))) return null
  const t = rollTotals(rows)
  const pending = t.leases - t.captured

  const exportCsv = () => {
    const name = (id: string, list: { id: string; name: string }[]) => list.find((x) => x.id === id)?.name ?? ''
    const buildings = ctx.buildings.map((b) => ({ id: b.building_id, name: b.name, city: b.city }))
    const occupiers = ctx.occupiers.map((o) => ({ id: o.occupier_id, name: o.name }))
    const head = ['Building', 'City', 'Occupier', 'Area (sq ft)', 'Start', 'Expiry', 'Rent ₹/sq ft/mo', 'CAM ₹/sq ft/mo', 'Monthly (rent+CAM) ₹', 'Annual rent ₹', 'Escalation %', 'Frequency', 'Next escalation']
    const lines = rows.map((r) => {
      const l = r.lease
      return [name(l.building_id, buildings), buildings.find((b) => b.id === l.building_id)?.city, name(l.occupier_id, occupiers), l.area, l.start, l.expiry, l.rent ?? '', l.CAM ?? '', Math.round(r.monthly), Math.round(r.annualRent), l.escalation_pct ?? '', l.escalation_freq ?? '', r.nextEscalation ?? '']
    })
    const csv = [head, ...lines].map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `rent-roll-${scope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('info', `Exported rent roll for ${rows.length} leases.`)
  }

  const stat = (label: string, value: string, unit?: string) => (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="mt-0.5 truncate text-lg font-extrabold text-royal">
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-medium text-ink-muted">{unit}</span>}
      </div>
    </div>
  )

  return (
    <Card
      className="mb-4"
      title={`Rent roll · ${scope}`}
      sub={`${rows.length} active leases · as of ${fmtDate(today)}${pending ? ` · ${pending} pending capture, excluded from rent` : ''}`}
      action={<button className="btn" onClick={exportCsv}>Export CSV</button>}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stat('Annual rent roll', cr(t.annual))}
        {stat('Monthly billing', cr(t.monthly), 'rent + CAM')}
        {stat('Avg rent', `₹${t.avgRent.toFixed(1)}`, '/sq ft/mo')}
        {stat('WALE', t.wale.toFixed(1), 'yrs')}
        {stat('Leased area', fmtSft(t.area), 'sq ft')}
      </div>
    </Card>
  )
}
