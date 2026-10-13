import { useMemo, useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import BarList from '../../components/ui/BarList'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'

const median = (xs: number[]) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/** E2-S03 / §7.1 "Public (anonymised)": executed rents with tenant, building and owner stripped. */
export default function Comparables() {
  const session = useAuthed()
  const { data } = useApi(() => api.comparables(session), [session.user.user_id])
  const [f, setF] = useState({ city: '', market: '', grade: '', band: '' })
  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => (!f.city || r.city === f.city) && (!f.market || r.micro_market === f.market) && (!f.grade || r.grade === f.grade) && (!f.band || r.area_band === f.band)),
    [data, f],
  )
  if (!data) return null
  const opts = (k: 'city' | 'micro_market' | 'grade' | 'area_band') => [...new Set(data.rows.map((r) => r[k]).filter(Boolean))].sort() as string[]
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }))
  const rents = rows.map((r) => r.rent)
  const byMarket = [...new Set(rows.map((r) => r.micro_market))].map((m) => {
    const xs = rows.filter((r) => r.micro_market === m).map((r) => r.rent)
    return { key: m, label: m, value: median(xs), display: `₹${median(xs)}`, tooltip: `${m}: median ₹${median(xs)}/sq ft/mo across ${xs.length} deals` }
  }).sort((a, b) => b.value - a.value)

  return (
    <>
      <PageHeader title="Rent comparables" subtitle="Executed rents across the market, anonymised: no tenant, building or owner is ever shown." />
      {data.limit != null && data.total > data.limit && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold bg-gold-light px-4 py-2.5 text-xs text-royal-dark">
          <span>Showing <b>{data.limit}</b> of {data.total} comparables on {session.plan?.name}.</span>
          <a href={href('subscription')} className="font-bold hover:underline">Upgrade for full comparables depth →</a>
        </div>
      )}
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Deals" value={rows.length} />
        <KpiCard label="Median rent" value={`₹${median(rents)}`} unit="/sq ft/mo" />
        <KpiCard label="Range" value={rents.length ? `₹${Math.min(...rents)}–${Math.max(...rents)}` : '—'} />
        <KpiCard label="Median CAM" value={`₹${median(rows.map((r) => r.CAM ?? 0).filter(Boolean))}`} unit="/sq ft/mo" />
      </div>
      <div className="grid gap-3.5 xl:grid-cols-[1fr_1.6fr]">
        <Card title="Median rent by micro-market"><BarList rows={byMarket} /></Card>
        <div>
          <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-3">
            <select className="input w-auto" value={f.city} onChange={set('city')} aria-label="City"><option value="">All cities</option>{opts('city').map((x) => <option key={x}>{x}</option>)}</select>
            <select className="input w-auto" value={f.market} onChange={set('market')} aria-label="Micro-market"><option value="">All micro-markets</option>{opts('micro_market').map((x) => <option key={x}>{x}</option>)}</select>
            <select className="input w-auto" value={f.grade} onChange={set('grade')} aria-label="Grade"><option value="">All grades</option>{opts('grade').map((x) => <option key={x}>{x}</option>)}</select>
            <select className="input w-auto" value={f.band} onChange={set('band')} aria-label="Deal size"><option value="">All deal sizes</option>{opts('area_band').map((x) => <option key={x}>{x}</option>)}</select>
          </div>
          <div className="max-h-[520px] overflow-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="sticky top-0">
                <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  <th className="px-4 py-2.5">Signed</th><th className="px-3 py-2.5">Micro-market</th><th className="px-3 py-2.5">Grade</th><th className="px-3 py-2.5">Deal size</th><th className="px-3 py-2.5 text-right">Rent</th><th className="px-3 py-2.5 text-right">CAM</th><th className="px-4 py-2.5">Escalation</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-line-light last:border-0">
                    <td className="px-4 py-2 text-ink-soft">{r.quarter}</td>
                    <td className="px-3 py-2">{r.micro_market}<span className="text-ink-muted">, {r.city}</span></td>
                    <td className="px-3 py-2">{r.grade ?? '—'}</td>
                    <td className="px-3 py-2 text-ink-soft">{r.area_band}</td>
                    <td className="px-3 py-2 text-right font-semibold">₹{r.rent}</td>
                    <td className="px-3 py-2 text-right text-ink-soft">{r.CAM != null ? `₹${r.CAM}` : '—'}</td>
                    <td className="px-4 py-2 text-ink-soft">{r.escalation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
