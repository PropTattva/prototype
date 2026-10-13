import { featureLabel, FEATURES, QUOTA_KEYS } from '../access/policy'
import * as api from '../data/api'
import { useApi } from '../data/useApi'
import type { SubscriptionPlan } from '../domain/platform'
import { useAuthed } from '../state/SessionContext'
import Badge from '../components/ui/Badge'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'
import { useToast } from '../components/ui/Toast'

const price = (p: SubscriptionPlan) => (p.price == null ? 'Custom' : p.price === 0 ? 'Free' : `₹${p.price.toLocaleString('en-IN')}/mo`)

/** An org's own plan: seats, features and quotas, with the catalogue to compare (§7.3). */
export default function Subscription() {
  const session = useAuthed()
  const toast = useToast()
  const { data } = useApi(async () => {
    const [plans, seats] = await Promise.all([api.list('plan', session), api.getSeatUsage(session.org.org_id, session)])
    return { plans: (plans as SubscriptionPlan[]).filter((p) => p.applies_to === session.org.type && p.status === 'Active'), seats }
  }, [session.user.user_id])
  if (!data) return null
  const sub = session.subscription
  const current = session.plan
  const features = FEATURES.filter((f) => f.for === session.org.type)

  return (
    <>
      <PageHeader title="Subscription" subtitle={`${session.org.name} · plans are assigned by PropTattva in Alpha — no billing`} />
      <div className="mb-3.5 grid gap-3.5 lg:grid-cols-3">
        <Card title="Current plan" className="lg:col-span-1">
          {current && sub ? (
            <>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold text-royal">{current.name}</span>
                <Badge tone={sub.status === 'Trial' ? 'warn' : 'ok'}>{sub.status}</Badge>
              </div>
              <dl className="mt-3 space-y-1.5 text-[13px]">
                <div className="flex justify-between"><dt className="text-ink-muted">Seats</dt><dd className="font-semibold">{data.seats.used} / {sub.seat_limit}</dd></div>
                {QUOTA_KEYS.filter((q) => q.key in current.quotas).map((q) => (
                  <div key={q.key} className="flex justify-between"><dt className="text-ink-muted">{q.label}</dt><dd className="font-semibold">{current.quotas[q.key] ?? 'Unlimited'}</dd></div>
                ))}
                <div className="flex justify-between"><dt className="text-ink-muted">Since</dt><dd>{sub.start}</dd></div>
                <div className="flex justify-between"><dt className="text-ink-muted">Renews / ends</dt><dd>{sub.end ?? 'Open-ended'}</dd></div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-crit">No active subscription. Contact PropTattva.</p>
          )}
        </Card>
        <Card title="What’s included" className="lg:col-span-2">
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {features.map((f) => {
              const on = current?.feature_flags.includes(f.key)
              return (
                <li key={f.key} className={`flex items-center gap-2 text-[13px] ${on ? 'text-ink' : 'text-ink-muted line-through decoration-ink-muted/40'}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${on ? 'bg-ok-bg text-ok' : 'bg-hover text-ink-muted'}`}>{on ? '✓' : '–'}</span>
                  {f.label}
                </li>
              )
            })}
          </ul>
        </Card>
      </div>

      <Card title="Compare plans">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.plans.map((p) => {
            const isCurrent = p.plan_code === current?.plan_code
            return (
              <div key={p.plan_code} className={`flex flex-col rounded-lg border p-4 ${isCurrent ? 'border-royal bg-royal-soft/40' : 'border-line'}`}>
                <div className="flex items-baseline justify-between">
                  <span className="text-[15px] font-extrabold text-royal">{p.name}</span>
                  <span className="text-xs font-semibold text-gold-dark">{price(p)}</span>
                </div>
                <div className="mb-2 text-[11px] text-ink-muted">
                  {p.default_seat_limit} seats{p.quotas.buildings !== undefined ? ` · ${p.quotas.buildings ?? 'unlimited'} building${p.quotas.buildings === 1 ? '' : 's'}` : ''}
                </div>
                <ul className="mb-3 flex-1 space-y-0.5 text-xs text-ink-soft">
                  {p.feature_flags.map((f) => <li key={f}>✓ {featureLabel(f)}</li>)}
                </ul>
                {isCurrent ? (
                  <span className="text-center text-xs font-bold uppercase tracking-wide text-royal">Current plan</span>
                ) : (
                  <button className="btn" disabled={session.readOnly} onClick={() => toast('info', `Upgrade request for ${p.name} sent to your PropTattva account manager.`)}>
                    Request {p.name}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </>
  )
}
