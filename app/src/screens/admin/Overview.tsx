import { seatUsage } from '../../entities/registry'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Organisation, PlatformDb, Subscription, SubscriptionPlan, User } from '../../domain/platform'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'
import { StatusBadge } from '../../components/ui/Badge'
import { relativeTime } from '../../components/crud/fields'

/** Super Admin landing: tenants at a glance — the tenant-isolation story starts here. */
export default function Overview() {
  const session = useAuthed()
  const { data } = useApi(async () => {
    const [orgs, users, invites, subs, plans, audit] = await Promise.all([
      api.list('organisation', session),
      api.list('user', session),
      api.list('invite', session),
      api.list('subscription', session),
      api.list('plan', session),
      api.listAudit(session),
    ])
    return { orgs: orgs as Organisation[], users: users as User[], invites, subs: subs as Subscription[], plans: plans as SubscriptionPlan[], audit }
  }, [session.user.user_id])
  if (!data) return null
  const { orgs, users, invites, subs, plans, audit } = data
  const shape = { users, invites, subscriptions: subs } as unknown as PlatformDb
  const customers = orgs.filter((o) => o.type !== 'PropTattva')

  return (
    <>
      <PageHeader title="Admin console" subtitle="Organisations, users, plans and the audit trail across every tenant" />
      <div className="mb-[18px] grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Customer orgs" value={customers.length} hint={`${customers.filter((o) => o.status === 'Active').length} active · ${customers.filter((o) => o.status !== 'Active').length} pending/suspended`} />
        <KpiCard label="Users" value={users.filter((u) => u.status === 'Active').length} hint={`${users.length} total incl. invited/disabled`} />
        <KpiCard label="Pending invites" value={invites.filter((i) => i.status === 'Pending').length} hint="Each reserves a seat" />
        <KpiCard label="Plans" value={plans.filter((p) => p.status === 'Active').length} hint={`${subs.filter((s) => s.status === 'Active' || s.status === 'Trial').length} live subscriptions`} />
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Tenants" sub="Each org is an isolated tenant: its users only ever see its own records" flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  <th className="px-4 py-2.5">Organisation</th>
                  <th className="px-3 py-2.5">Plan</th>
                  <th className="px-3 py-2.5">Seats</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((o) => {
                  const seats = seatUsage(shape, o.org_id)
                  const plan = plans.find((p) => p.plan_code === seats.subscription?.plan_code)
                  const pct = seats.limit ? Math.min(100, (seats.used / seats.limit) * 100) : 0
                  return (
                    <tr key={o.org_id} className="border-b border-line-light last:border-0 hover:bg-hover">
                      <td className="px-4 py-2.5">
                        <a href={href(`admin/organisations/${o.org_id}`)} className="font-semibold text-royal hover:underline">{o.name}</a>
                        <div className="text-[11px] text-ink-muted">{o.type}{o.enabler_type ? ` · ${o.enabler_type}` : ''}</div>
                      </td>
                      <td className="px-3 py-2.5 text-ink-soft">{plan?.name ?? <span className="text-crit">No live plan</span>}</td>
                      <td className="px-3 py-2.5">
                        {seats.limit ? (
                          <div className="w-28">
                            <div className="mb-1 text-[11px] text-ink-soft">{seats.used} / {seats.limit}</div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-hover">
                              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-crit' : 'bg-royal'}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-ink-muted">—</span>
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

        <Card title="Recent activity" action={<a href={href('admin/audit')} className="text-xs font-semibold text-royal hover:underline">Audit log →</a>}>
          <ul className="divide-y divide-line-light">
            {audit.slice(0, 8).map((e) => (
              <li key={e.audit_id} className="flex items-baseline justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <span className="font-semibold text-ink">{e.action}</span>{' '}
                  <span className="text-ink-soft">{e.entity} · {e.entity_label}</span>
                </span>
                <span className="shrink-0 text-[11px] text-ink-muted">{relativeTime(e.timestamp)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
