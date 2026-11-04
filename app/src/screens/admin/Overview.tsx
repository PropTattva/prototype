import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { INTERNAL_ORG_TYPES } from '../../domain/platform'
import { fmtDate } from '../../lib/dates'
import { fmtSft } from '../../lib/format'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/Badge'
import { relativeTime } from '../../components/crud/fields'
import IssueGroups from './Issues'

/** Platform owner's home: how the platform is doing, what needs attention, and every tenant at a glance. */
export default function Overview() {
  const session = useAuthed()
  const { data } = useApi(() => api.adminOverview(session), [session.user.user_id])
  if (!data) return null
  const { orgs, issues, audit, names } = data
  const customers = orgs.filter((o) => !INTERNAL_ORG_TYPES.includes(o.org.type))
  const orgName = (id: string | null) => orgs.find((o) => o.org.org_id === id)?.org.name ?? 'Master data'
  const live = customers.filter((o) => o.subscription)
  const seatsUsed = customers.reduce((s, o) => s + o.seats.used, 0)
  const seatsCap = customers.reduce((s, o) => s + (o.seats.limit ?? 0), 0)
  const active30 = orgs.reduce((s, o) => s + o.users.active30, 0)
  const activeUsers = orgs.reduce((s, o) => s + o.users.active, 0)
  const buildings = customers.reduce((s, o) => s + o.footprint.buildings, 0)
  const area = customers.reduce((s, o) => s + o.footprint.area, 0)
  // Billing and account problems first; data quality has its own page.
  const attention = issues.filter((i) => i.area !== 'Data' && i.severity !== 'Info')
  const dataCritical = issues.filter((i) => i.area === 'Data' && i.severity === 'Critical').length
  const dataWarning = issues.filter((i) => i.area === 'Data' && i.severity === 'Warning').length

  return (
    <>
      <PageHeader title="Platform overview" subtitle="Customers, usage and issues across the platform — manage accounts and support tenants from here." />
      <div className="mb-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <KpiCard label="Customer orgs" value={customers.length} hint={`${customers.filter((o) => o.org.status === 'Active').length} active · ${customers.filter((o) => o.org.status === 'Pending').length} pending · ${customers.filter((o) => o.org.status === 'Suspended').length} suspended`} />
        <KpiCard label="Live subscriptions" value={live.length} hint={`${live.filter((o) => o.subscription?.status === 'Trial').length} on trial`} />
        <KpiCard label="Seats used" value={`${seatsUsed} / ${seatsCap}`} hint={`${customers.filter((o) => o.seats.limit != null && o.seats.used >= o.seats.limit).length} orgs at their limit`} />
        <KpiCard label="Active users · 30 days" value={active30} hint={`of ${activeUsers} active accounts`} />
        <KpiCard label="On the platform" value={buildings} unit="buildings" hint={`${fmtSft(area)} sq ft registered`} />
      </div>

      <div className="mb-3.5 grid gap-3.5 xl:grid-cols-[1.3fr_1fr]">
        <Card title={`Needs attention (${attention.length})`} sub="Billing and account issues to act on" action={<a href={href('admin/health')} className="text-xs font-semibold text-royal hover:underline">Data health →</a>}>
          <IssueGroups issues={attention} orgName={orgName} limit={4} />
          <a href={href('admin/health')} className="mt-3 flex items-center justify-between rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[12px] hover:border-royal">
            <span><strong className="text-ink">Data quality:</strong> <span className="text-crit">{dataCritical} critical</span> · <span className="text-[#7a5300]">{dataWarning} warnings</span> across tenant data</span>
            <span className="font-semibold text-royal">Review →</span>
          </a>
        </Card>
        <Card title="Recent activity" action={<a href={href('admin/audit')} className="text-xs font-semibold text-royal hover:underline">Audit log →</a>}>
          <ul className="divide-y divide-line-light">
            {audit.map((e) => (
              <li key={e.audit_id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{names[e.user_id] ?? e.user_id}</span>{' '}
                  <span className="text-ink-soft">{e.action.toLowerCase()} {e.entity} · {e.entity_label}</span>
                  {e.org_id && <span className="text-[11px] text-ink-muted"> · {orgName(e.org_id)}</span>}
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">{relativeTime(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Organisations" sub="Click an organisation to support it: people, plan, data, issues and history" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                <th className="px-4 py-2.5">Organisation</th>
                <th className="px-3 py-2.5">Plan</th>
                <th className="px-3 py-2.5">Seats</th>
                <th className="px-3 py-2.5">Users</th>
                <th className="px-3 py-2.5">On platform</th>
                <th className="px-3 py-2.5">Issues</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map(({ org: o, plan, subscription, seats, users, footprint: f, issues: n }) => {
                const pct = seats.limit ? Math.min(100, (seats.used / seats.limit) * 100) : 0
                return (
                  <tr key={o.org_id} className="cursor-pointer border-b border-line-light last:border-0 hover:bg-hover" onClick={() => navigate(`admin/organisations/${o.org_id}`)}>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-royal">{o.name}</div>
                      <div className="text-[11px] text-ink-muted">{o.type}{o.enabler_type ? ` · ${o.enabler_type}` : ''}{INTERNAL_ORG_TYPES.includes(o.type) ? ' · internal' : ''}</div>
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {plan?.name ?? (o.type === 'PropTattva' ? <span className="text-ink-muted">Platform owner</span> : <span className="font-semibold text-crit">No live plan</span>)}
                      {subscription?.status === 'Trial' && <div className="text-[11px] text-warn">Trial{subscription.end ? ` to ${fmtDate(subscription.end)}` : ''}</div>}
                    </td>
                    <td className="px-3 py-2.5">
                      {seats.limit ? (
                        <div className="w-24">
                          <div className="mb-1 text-[11px] text-ink-soft">{seats.used} / {seats.limit}</div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                            <div className={`h-full rounded-full ${pct >= 100 ? 'bg-crit' : 'bg-royal'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      ) : <span className="text-ink-muted">{seats.used} · no cap</span>}
                    </td>
                    <td className="px-3 py-2.5 text-ink-soft">
                      {users.active} active
                      <div className="text-[11px] text-ink-muted">{users.lastLogin ? `last login ${relativeTime(users.lastLogin)}` : 'never signed in'}</div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] text-ink-soft">
                      {o.type === 'Owner' ? `${f.buildings} bldgs · ${f.leases} leases` : o.type === 'Advisory' ? `${f.mandates || 'AA'} mandates` : '—'}
                      <div className="text-[11px] text-ink-muted">CRM {f.crmAccounts} accounts · {f.meetings} meetings</div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px]">
                      {n.critical + n.warning + n.info === 0 ? <span className="text-ok">None</span> : (
                        <span className="flex flex-wrap gap-1">
                          {n.critical > 0 && <span className="rounded bg-crit-bg px-1.5 font-bold text-crit">{n.critical} critical</span>}
                          {n.warning > 0 && <span className="rounded bg-warn-bg px-1.5 font-bold text-[#7a5300]">{n.warning} warn</span>}
                          {n.info > 0 && <span className="rounded bg-hover px-1.5 text-ink-soft">{n.info} info</span>}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5"><StatusBadge status={o.status} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  )
}
