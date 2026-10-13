import { useMemo, useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { RentInvoice } from '../../domain/leasing'
import { leaseLabel, leaseOptions } from '../../entities/helpers'
import { daysFromToday, fmtDate, todayIso } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import RecordDrawer, { useErrorHandler } from '../../components/crud/RecordDrawer'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import UpgradeGate from '../../components/ui/UpgradeGate'
import { useToast } from '../../components/ui/Toast'

const BUCKETS = ['Current (0-30)', '31-60', '61-90', '90+'] as const
const total = (i: RentInvoice) => Math.round(i.amount * (1 + i.gst / 100))
const outstanding = (i: RentInvoice) => total(i) - (i.paid_amount ?? 0)
/** Aged bucket (PRD Rent.aged_bucket), derived from days past due on the unpaid balance. */
export function agedBucket(i: RentInvoice): (typeof BUCKETS)[number] {
  const late = -daysFromToday(i.due_date)
  return late <= 30 ? 'Current (0-30)' : late <= 60 ? '31-60' : late <= 90 ? '61-90' : '90+'
}
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
const cr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : `₹${(n / 1e5).toFixed(1)} L`)

/** E2-S11 / S12: GST invoices matched to payments, with aged receivables. */
export default function Ledger({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const toast = useToast()
  const perms = api.permissions('rent', session)
  const { handle, dialog, setDialog } = useErrorHandler(session)
  const { data } = useApi(async () => {
    const [inv, ctx] = await Promise.all([api.list('rent', session), api.getOptionCtx(session)])
    return { inv: inv as RentInvoice[], ctx }
  }, [session.user.user_id])
  const [period, setPeriod] = useState('')
  const [show, setShow] = useState<'all' | 'open'>('open')
  const rows = useMemo(() => (data?.inv ?? []).filter((i) => (!period || i.period === period) && (show === 'all' || outstanding(i) > 0)).sort((a, b) => a.due_date.localeCompare(b.due_date)), [data, period, show])
  if (!api.hasFeature(session, 'invoicing')) return <UpgradeGate session={session} feature="invoicing" />
  if (!data) return null
  const { inv, ctx } = data
  const open = inv.filter((i) => outstanding(i) > 0)
  const byBucket = BUCKETS.map((b) => ({ b, amt: open.filter((i) => agedBucket(i) === b).reduce((s, i) => s + outstanding(i), 0), n: open.filter((i) => agedBucket(i) === b).length }))
  const billed = inv.reduce((s, i) => s + total(i), 0)
  const collected = inv.reduce((s, i) => s + (i.paid_amount ?? 0), 0)
  const periods = [...new Set(inv.map((i) => i.period))].sort().reverse()
  const [openId, mode] = rest

  const generate = () => setDialog(<GenerateDialog ctx={ctx} onClose={() => setDialog(null)} onGo={async (leaseId, p) => {
    try {
      await api.generateInvoice(leaseId, p, session)
      toast('ok', `GST invoice generated for ${p}.`)
      setDialog(null)
    } catch (e) {
      handle(e)
    }
  }} />)
  const pay = (i: RentInvoice) => setDialog(<PayDialog inv={i} onClose={() => setDialog(null)} onGo={async (amt, d) => {
    try {
      await api.recordPayment(i.rent_id, amt, d, session)
      toast('ok', 'Payment recorded and matched to the invoice.')
      setDialog(null)
    } catch (e) {
      handle(e)
    }
  }} />)

  return (
    <>
      <PageHeader
        title="Rent ledger"
        subtitle="Invoices matched to payments, with aged receivables (E2-S12)."
        right={perms.create && <button className="btn btn-gold" onClick={generate}>+ Generate GST invoice</button>}
      />
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Billed (incl. GST)" value={cr(billed)} hint={`${inv.length} invoices`} />
        <KpiCard label="Collected" value={cr(collected)} hint={billed ? `${((collected / billed) * 100).toFixed(1)}% collection` : undefined} />
        <KpiCard label="Outstanding" value={cr(billed - collected)} hint={`${open.length} open invoices`} />
        <KpiCard label="90+ days" value={cr(byBucket[3].amt)} hint={`${byBucket[3].n} invoices`} />
      </div>
      <Card title="Aged receivables" className="mb-3.5">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {byBucket.map(({ b, amt, n }, i) => (
            <div key={b} className={`rounded-md border-l-[3px] bg-canvas px-3 py-2 ${['border-ok', 'border-gold', 'border-warn', 'border-crit'][i]}`}>
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{b.startsWith('Current') ? 'Current · 0–30 days' : `${b} days`}</div>
              <div className="text-lg font-extrabold text-ink">{cr(amt)}</div>
              <div className="text-[11px] text-ink-muted">{n} invoices</div>
            </div>
          ))}
        </div>
      </Card>
      <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-line bg-white p-3">
        <select className="input w-auto" value={show} onChange={(e) => setShow(e.target.value as 'all' | 'open')} aria-label="Show"><option value="open">Open invoices</option><option value="all">All invoices</option></select>
        <select className="input w-auto" value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Period"><option value="">All periods</option>{periods.map((p) => <option key={p}>{p}</option>)}</select>
      </div>
      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full min-w-[900px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
              <th className="px-4 py-2.5">Invoice</th>
              <th className="px-3 py-2.5">Lease</th>
              <th className="px-3 py-2.5">Due</th>
              <th className="px-3 py-2.5 text-right">Total (GST)</th>
              <th className="px-3 py-2.5 text-right">Paid</th>
              <th className="px-3 py-2.5 text-right">Outstanding</th>
              <th className="px-3 py-2.5">Ageing</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 150).map((i) => {
              const o = outstanding(i)
              const bucket = agedBucket(i)
              return (
                <tr key={i.rent_id} className="border-b border-line-light last:border-0 hover:bg-hover">
                  <td className="px-4 py-2.5"><button className="font-mono text-xs font-semibold text-royal hover:underline" onClick={() => navigate(`ledger/${i.rent_id}`)}>{i.invoice_no}</button><div className="text-[11px] text-ink-muted">{i.period}</div></td>
                  <td className="px-3 py-2.5 text-ink-soft">{leaseLabel(ctx, i.lease_id)}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{fmtDate(i.due_date)}</td>
                  <td className="px-3 py-2.5 text-right">{inr(total(i))}</td>
                  <td className="px-3 py-2.5 text-right text-ink-soft">{i.paid_amount ? inr(i.paid_amount) : '—'}</td>
                  <td className={`px-3 py-2.5 text-right font-semibold ${o > 0 ? 'text-ink' : 'text-ok'}`}>{o > 0 ? inr(o) : 'Paid'}</td>
                  <td className="px-3 py-2.5">{o > 0 ? (i.due_date > todayIso() ? <Badge tone="muted">Not due</Badge> : <Badge tone={bucket === '90+' ? 'crit' : bucket === '61-90' ? 'warn' : bucket === '31-60' ? 'gold' : 'ok'}>{bucket}</Badge>) : <Badge tone="ok">Settled</Badge>}</td>
                  <td className="px-4 py-2.5 text-right">{o > 0 && perms.update && <button className="btn py-1 text-[11px]" onClick={() => pay(i)}>Record payment</button>}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-muted">No invoices match.</td></tr>}
          </tbody>
        </table>
        {rows.length > 150 && <div className="border-t border-line px-4 py-2 text-xs text-ink-muted">Showing 150 of {rows.length} — filter by period to narrow.</div>}
      </div>
      {openId && (
        <RecordDrawer entity="rent" id={openId} mode={mode === 'edit' ? 'edit' : 'view'} session={session} ctx={ctx} linkTo={linkFor(session)} defaultOrgId={null}
          onClose={() => navigate('ledger')} onMode={(m, id) => navigate(m === 'edit' ? `ledger/${id}/edit` : `ledger/${id}`)} />
      )}
      {dialog}
    </>
  )
}

function GenerateDialog({ ctx, onClose, onGo }: { ctx: Parameters<typeof leaseOptions>[0]; onClose: () => void; onGo: (leaseId: string, period: string) => void }) {
  const [leaseId, setLeaseId] = useState('')
  const [period, setPeriod] = useState(todayIso().slice(0, 7))
  const lease = ctx.leases.find((l) => l.lease_id === leaseId)
  const amount = lease && lease.rent != null ? Math.round((lease.rent + (lease.CAM ?? 0)) * lease.area) : null
  return (
    <Modal title="Generate GST invoice" onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={!leaseId || !period} onClick={() => onGo(leaseId, period)}>Generate</button></>}>
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="g-lease">Lease</label>
          <select id="g-lease" className="input" value={leaseId} onChange={(e) => setLeaseId(e.target.value)}>
            <option value="">Select…</option>
            {leaseOptions({ ...ctx, leases: ctx.leases.filter((l) => l.status === 'Active') }).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="g-period">Period</label>
          <input id="g-period" type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} />
        </div>
        {amount != null && (
          <p className="rounded-md bg-canvas px-3 py-2 text-xs">
            (Rent ₹{lease!.rent} + CAM ₹{lease!.CAM ?? 0}) × {lease!.area.toLocaleString('en-IN')} sq ft = <b>{inr(amount)}</b> + 18% GST = <b className="text-ink">{inr(amount * 1.18)}</b>, due on the 10th.
          </p>
        )}
      </div>
    </Modal>
  )
}

function PayDialog({ inv, onClose, onGo }: { inv: RentInvoice; onClose: () => void; onGo: (amount: number, date: string) => void }) {
  const [amt, setAmt] = useState(outstanding(inv))
  const [date, setDate] = useState(todayIso())
  return (
    <Modal title={`Record payment · ${inv.invoice_no}`} onClose={onClose} actions={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-gold" disabled={!(amt > 0)} onClick={() => onGo(amt, date)}>Record</button></>}>
      <p className="mb-3 text-xs">Outstanding {inr(outstanding(inv))} of {inr(total(inv))}.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="p-amt">Amount (₹)</label><input id="p-amt" type="number" className="input" value={amt} onChange={(e) => setAmt(Number(e.target.value))} /></div>
        <div><label className="label" htmlFor="p-date">Paid on</label><input id="p-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      </div>
    </Modal>
  )
}
