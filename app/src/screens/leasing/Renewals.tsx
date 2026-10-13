import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Lease, LeaseRenewal } from '../../domain/leasing'
import { RENEWAL_STAGES } from '../../entities/leasing'
import { leaseLabel } from '../../entities/helpers'
import { addMonths, daysFromToday, fmtDate, todayIso } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import { useErrorHandler } from '../../components/crud/RecordDrawer'
import RecordDrawer from '../../components/crud/RecordDrawer'
import PageHeader from '../../components/ui/PageHeader'
import UpgradeGate from '../../components/ui/UpgradeGate'
import { useToast } from '../../components/ui/Toast'

const COLS: { key: string; label: string; tone: string }[] = [
  { key: 'Due', label: 'Due — not started', tone: 'border-t-warn' },
  { key: 'Initiated', label: 'Initiated', tone: 'border-t-royal' },
  { key: 'Negotiating', label: 'Negotiating', tone: 'border-t-royal' },
  { key: 'Agreed', label: 'Agreed', tone: 'border-t-ok' },
  { key: 'Lost', label: 'Lost', tone: 'border-t-crit' },
]

/** E3-S04 / S11: renewals as a pipeline. Leases inside 12 months with no renewal yet surface in "Due". */
export default function Renewals({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const toast = useToast()
  const perms = api.permissions('renewal', session)
  const { handle, dialog } = useErrorHandler(session)
  const { data } = useApi(async () => {
    const [renewals, leases, ctx] = await Promise.all([api.list('renewal', session), api.list('lease', session), api.getOptionCtx(session)])
    return { renewals: renewals as LeaseRenewal[], leases: leases as Lease[], ctx }
  }, [session.user.user_id])
  if (!api.hasFeature(session, 'lease_crm')) return <UpgradeGate session={session} feature="lease_crm" />
  if (!data) return null
  const { renewals, leases, ctx } = data
  const in12 = addMonths(todayIso(), 12)
  const due = leases.filter((l) => l.status === 'Active' && l.expiry <= in12 && !renewals.some((r) => r.lease_id === l.lease_id && r.stage !== 'Lost'))
  const leaseOf = (id: string) => leases.find((l) => l.lease_id === id)
  const users = Object.fromEntries(ctx.users.map((u) => [u.user_id, u.name]))
  const [openId, mode] = rest

  const start = async (l: Lease) => {
    try {
      await api.create('renewal', { lease_id: l.lease_id, stage: 'Initiated', assignee: session.user.user_id, target_date: l.expiry > todayIso() ? addMonths(l.expiry, -2) : todayIso(), notes: null }, session)
      toast('ok', 'Renewal started.')
    } catch (e) {
      handle(e)
    }
  }
  const move = async (r: LeaseRenewal, stage: string) => {
    try {
      await api.update('renewal', r.renewal_id, { stage }, session)
    } catch (e) {
      handle(e)
    }
  }

  const annual = (l?: Lease) => (l?.rent != null ? `₹${((l.rent * l.area * 12) / 1e7).toFixed(2)} Cr/yr` : '')

  return (
    <>
      <PageHeader title="Renewals" subtitle={`${due.length} leases expire within 12 months without a renewal in progress. Alerts start at 12 months and repeat monthly (E3-S03).`} />
      <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-5">
        {COLS.map((c) => {
          const cards = c.key === 'Due' ? [] : renewals.filter((r) => r.stage === c.key)
          const n = c.key === 'Due' ? due.length : cards.length
          return (
            <section key={c.key} className={`min-h-[300px] min-w-[220px] rounded-lg border border-t-[3px] border-line bg-white p-3 ${c.tone}`}>
              <header className="mb-2.5 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-royal">
                {c.label}
                <span className="rounded-full bg-royal-soft px-2 py-0.5 text-[10px]">{n}</span>
              </header>
              {c.key === 'Due'
                ? due
                    .sort((a, b) => a.expiry.localeCompare(b.expiry))
                    .map((l) => (
                      <article key={l.lease_id} className="mb-2 rounded border-l-[3px] border-warn bg-canvas p-2.5 text-[11px]">
                        <a href={href(`leases/${l.lease_id}`)} className="block text-xs font-bold text-ink hover:text-royal">{leaseLabel(ctx, l.lease_id)}</a>
                        <div className="text-ink-muted">Expires {fmtDate(l.expiry)} · {daysFromToday(l.expiry)}d</div>
                        <div className="font-semibold text-royal">{annual(l)}</div>
                        {perms.create && <button className="btn mt-1.5 w-full py-1 text-[11px]" onClick={() => start(l)}>Start renewal</button>}
                      </article>
                    ))
                : cards.map((r) => {
                    const l = leaseOf(r.lease_id)
                    const i = RENEWAL_STAGES.indexOf(r.stage)
                    return (
                      <article key={r.renewal_id} className={`mb-2 rounded border-l-[3px] bg-canvas p-2.5 text-[11px] ${l && daysFromToday(l.expiry) < 90 && r.stage !== 'Agreed' && r.stage !== 'Lost' ? 'border-crit' : 'border-royal'}`}>
                        <button onClick={() => navigate(`renewals/${r.renewal_id}`)} className="block text-left text-xs font-bold text-ink hover:text-royal">{leaseLabel(ctx, r.lease_id)}</button>
                        {l && <div className="text-ink-muted">Expires {fmtDate(l.expiry)}</div>}
                        <div className="text-ink-muted">{r.assignee ? users[r.assignee] ?? 'Assigned' : 'Unassigned'}{r.target_date ? ` · target ${fmtDate(r.target_date)}` : ''}</div>
                        <div className="font-semibold text-royal">{annual(l)}</div>
                        {perms.update && (
                          <div className="mt-1.5 flex gap-1">
                            {i > 0 && <button className="btn flex-1 px-1 py-0.5 text-[11px]" onClick={() => move(r, RENEWAL_STAGES[i - 1])} title={`Back to ${RENEWAL_STAGES[i - 1]}`}>←</button>}
                            {i < RENEWAL_STAGES.length - 1 && <button className="btn flex-1 px-1 py-0.5 text-[11px]" onClick={() => move(r, RENEWAL_STAGES[i + 1])} title={`Move to ${RENEWAL_STAGES[i + 1]}`}>{RENEWAL_STAGES[i + 1]} →</button>}
                          </div>
                        )}
                      </article>
                    )
                  })}
            </section>
          )
        })}
      </div>
      {openId && (
        <RecordDrawer
          entity="renewal"
          id={openId}
          mode={mode === 'edit' ? 'edit' : 'view'}
          session={session}
          ctx={ctx}
          linkTo={linkFor(session)}
          defaultOrgId={null}
          onClose={() => navigate('renewals')}
          onMode={(m, id) => navigate(m === 'edit' ? `renewals/${id}/edit` : `renewals/${id}`)}
          extra={(r) => <a href={href(`leases/${r.lease_id}`)} className="mt-4 inline-block text-xs font-semibold text-royal hover:underline">Open lease →</a>}
        />
      )}
      {dialog}
    </>
  )
}
