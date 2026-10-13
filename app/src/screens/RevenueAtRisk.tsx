import { useMemo, useState } from 'react'
import * as api from '../data/api'
import { useApi } from '../data/useApi'
import { addMonths, fmtDate, quarterOf, todayIso } from '../lib/dates'
import { href } from '../state/router'
import { useAuthed } from '../state/SessionContext'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import KpiCard from '../components/ui/KpiCard'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../components/ui/Toast'
import UpgradeGate from '../components/ui/UpgradeGate'

const cr = (n: number) => `₹${(n / 1e7).toFixed(2)} Cr`
const WINDOWS = [6, 12, 18, 24, 36]

/** E7-S02 / S03: annual rent at risk from expiries and break options — by asset, by quarter, drill-down, export. */
export default function RevenueAtRisk() {
  const session = useAuthed()
  const toast = useToast()
  const [months, setMonths] = useState(24)
  const [cause, setCause] = useState<'' | 'Expiry' | 'Break'>('')
  const [asset, setAsset] = useState('')
  const { data } = useApi(() => api.revenueAtRisk(months, session), [months, session.user.user_id])
  const rows = useMemo(() => (data ?? []).filter((r) => (!cause || r.cause === cause) && (!asset || r.building_id === asset)), [data, cause, asset])
  if (!api.hasFeature(session, 'revenue_at_risk')) return <UpgradeGate session={session} feature="revenue_at_risk" />
  if (!data) return null

  const quarters: string[] = []
  for (let i = 0; i < Math.ceil(months / 3) + 1; i++) {
    const q = quarterOf(addMonths(todayIso(), i * 3))
    if (!quarters.includes(q)) quarters.push(q)
  }
  const assets = [...new Set(rows.map((r) => r.building_id))]
    .map((id) => ({ id, name: rows.find((r) => r.building_id === id)!.building, total: rows.filter((r) => r.building_id === id).reduce((s, r) => s + r.annual_rent, 0) }))
    .sort((a, b) => b.total - a.total)
  const total = rows.reduce((s, r) => s + r.annual_rent, 0)
  const max = Math.max(1, ...assets.flatMap((a) => quarters.map((q) => rows.filter((r) => r.building_id === a.id && r.quarter === q).reduce((s, r) => s + r.annual_rent, 0))))
  const byQ = quarters.map((q) => rows.filter((r) => r.quarter === q).reduce((s, r) => s + r.annual_rent, 0))

  const exportCsv = async () => {
    const lines = [['Lease', 'Occupier', 'Building', 'Cause', 'Date', 'Quarter', 'Annual rent (INR)', 'Area (sq ft)'].join(','), ...rows.map((r) => [r.lease_id, r.occupier, r.building, r.cause, r.date, r.quarter, Math.round(r.annual_rent), r.area].map((x) => `"${x}"`).join(','))]
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
    a.download = `revenue-at-risk-${months}m.csv`
    a.click()
    await api.auditExport('RevenueAtRisk', `${rows.length} at-risk lease events (${months} months)`, session)
    toast('info', 'Exported — logged in the audit trail.')
  }

  return (
    <>
      <PageHeader
        title="Revenue at risk"
        subtitle="Annualised rent on leases that expire or can break inside the window — board-ready, by asset and quarter."
        right={<button className="btn" onClick={exportCsv}>Export CSV</button>}
      />
      <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-3">
        <select className="input w-auto" value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Window">{WINDOWS.map((w) => <option key={w} value={w}>Next {w} months</option>)}</select>
        <select className="input w-auto" value={cause} onChange={(e) => setCause(e.target.value as typeof cause)} aria-label="Cause"><option value="">Expiry and break</option><option value="Expiry">Expiry only</option><option value="Break">Break option only</option></select>
        <select className="input w-auto" value={asset} onChange={(e) => setAsset(e.target.value)} aria-label="Asset"><option value="">All assets</option>{[...new Set((data ?? []).map((r) => r.building_id))].map((id) => <option key={id} value={id}>{data!.find((r) => r.building_id === id)!.building}</option>)}</select>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Annual rent at risk" value={cr(total)} hint={`${rows.length} lease events`} />
        <KpiCard label="From expiries" value={cr(rows.filter((r) => r.cause === 'Expiry').reduce((s, r) => s + r.annual_rent, 0))} />
        <KpiCard label="From break options" value={cr(rows.filter((r) => r.cause === 'Break').reduce((s, r) => s + r.annual_rent, 0))} />
        <KpiCard label="Assets exposed" value={assets.length} hint={assets[0] ? `Largest: ${assets[0].name}` : undefined} />
      </div>

      <Card title="At-risk rent by asset and quarter" sub="Cell shade scales with ₹ at risk; click an asset to drill down" flush className="mb-3.5">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-[12px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="sticky left-0 bg-canvas px-4 py-2.5">Asset</th>
                {quarters.map((q) => <th key={q} className="px-2 py-2.5 text-right">{q}</th>)}
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-b border-line-light">
                  <td className="sticky left-0 bg-white px-4 py-2"><button className="font-semibold text-royal hover:underline" onClick={() => setAsset(a.id === asset ? '' : a.id)}>{a.name}</button></td>
                  {quarters.map((q) => {
                    const v = rows.filter((r) => r.building_id === a.id && r.quarter === q).reduce((s, r) => s + r.annual_rent, 0)
                    return (
                      <td key={q} className="px-1 py-1 text-right">
                        {v ? <span className="block rounded px-1.5 py-1 font-semibold" style={{ background: `rgba(201,164,74,${0.15 + 0.75 * (v / max)})`, color: v / max > 0.6 ? '#fff' : '#0f1b3d' }}>{(v / 1e7).toFixed(1)}</span> : <span className="text-ink-muted">·</span>}
                      </td>
                    )
                  })}
                  <td className="px-4 py-2 text-right font-bold">{cr(a.total)}</td>
                </tr>
              ))}
              {!assets.length && <tr><td colSpan={quarters.length + 2} className="px-4 py-10 text-center text-ink-muted">Nothing at risk in this window.</td></tr>}
            </tbody>
            {assets.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gold bg-canvas font-bold">
                  <td className="sticky left-0 bg-canvas px-4 py-2">All assets (₹ Cr)</td>
                  {byQ.map((v, i) => <td key={i} className="px-2 py-2 text-right">{v ? (v / 1e7).toFixed(1) : '·'}</td>)}
                  <td className="px-4 py-2 text-right">{cr(total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      <Card title={asset ? `Leases — ${assets.find((a) => a.id === asset)?.name ?? ''}` : 'Leases at risk'} flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2.5">Occupier</th><th className="px-3 py-2.5">Building</th><th className="px-3 py-2.5">Cause</th><th className="px-3 py-2.5">Date</th><th className="px-3 py-2.5 text-right">Area</th><th className="px-4 py-2.5 text-right">Annual rent</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 120).map((r) => (
                <tr key={r.key} className="border-b border-line-light last:border-0 hover:bg-hover">
                  <td className="px-4 py-2"><a href={href(`leases/${r.lease_id}`)} className="font-semibold text-royal hover:underline">{r.occupier}</a></td>
                  <td className="px-3 py-2 text-ink-soft">{r.building}</td>
                  <td className="px-3 py-2"><Badge tone={r.cause === 'Expiry' ? 'gold' : 'warn'}>{r.cause}</Badge></td>
                  <td className="px-3 py-2 text-ink-soft">{fmtDate(r.date)} <span className="text-[11px] text-ink-muted">{r.quarter}</span></td>
                  <td className="px-3 py-2 text-right text-ink-soft">{r.area.toLocaleString('en-IN')}</td>
                  <td className="px-4 py-2 text-right font-semibold">{cr(r.annual_rent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
