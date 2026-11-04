import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { EntityKey, Rec } from '../../entities/types'
import { INTERNAL_ORG_TYPES, type User } from '../../domain/platform'
import { fmtDate } from '../../lib/dates'
import { fmtSft } from '../../lib/format'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useSession } from '../../state/SessionContext'
import RecordDrawer, { type DrawerMode } from '../../components/crud/RecordDrawer'
import { relativeTime } from '../../components/crud/fields'
import { StatusBadge } from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import Modal from '../../components/ui/Modal'
import { useToast } from '../../components/ui/Toast'
import IssueGroups from './Issues'

type Open = { entity: EntityKey; id: string | null; mode: DrawerMode; presets?: Rec }

/** One organisation, for the platform owner: account status, plan and seats, people, data, issues and history. */
export default function OrgDetail({ id }: { id: string }) {
  const { session, viewAs } = useSession()
  const toast = useToast()
  const { data, error } = useApi(async () => {
    const [support, ctx] = await Promise.all([api.orgSupport(id, session!), api.getOptionCtx(session!)])
    return { ...support, ctx }
  }, [id, session?.user.user_id])
  const [drawer, setDrawer] = useState<Open | null>(null)
  const [confirm, setConfirm] = useState<null | 'Suspended' | 'Active'>(null)
  if (!session) return null
  if (error) return <p className="text-sm text-ink-muted">{error.message} <a className="text-royal underline" href={href('admin/organisations')}>Back to organisations</a></p>
  if (!data) return null
  const { summary, users, invites, subscriptions, plans, issues, audit, names, ctx } = data
  const { org, plan, subscription, seats, footprint: f } = summary
  const internal = INTERNAL_ORG_TYPES.includes(org.type)
  const platform = org.type === 'PropTattva'
  const firstActive = users.find((u) => u.status === 'Active' && u.user_id !== session.actor.user_id)
  const pct = seats.limit ? Math.min(100, (seats.used / seats.limit) * 100) : 0

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast('ok', ok)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }
  const setUserStatus = (u: User, status: User['status']) => run(() => api.update('user', u.user_id, { status }, session), `${u.name} ${status === 'Active' ? 'enabled' : 'disabled'}.`)
  const openCrm = () => {
    try {
      localStorage.setItem('pt-crm-scope', org.org_id)
    } catch {
      // the CRM page falls back to "All organisations"
    }
    navigate('crm/accounts')
  }

  return (
    <>
      <a href={href('admin/organisations')} className="mb-2 inline-block text-[12px] font-semibold text-royal hover:underline">← Organisations</a>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex flex-wrap items-center gap-2 text-[22px] font-extrabold tracking-tight text-royal">
            {org.name} <StatusBadge status={org.status} />
          </h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">
            {org.type}{org.enabler_type ? ` · ${org.enabler_type}` : ''}{internal ? ' · internal' : ' · customer'} · {org.org_id} · since {fmtDate(org.created_at)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => setDrawer({ entity: 'organisation', id: org.org_id, mode: 'edit' })}>Edit details</button>
          {firstActive && <button className="btn" onClick={() => viewAs(firstActive.user_id).catch((e) => toast('error', e.message))}>View as {firstActive.name.split(' ')[0]}</button>}
          {!platform && org.status !== 'Active' && <button className="btn btn-gold" onClick={() => setConfirm('Active')}>Activate</button>}
          {!platform && org.status === 'Active' && <button className="btn text-crit" onClick={() => setConfirm('Suspended')}>Suspend</button>}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-5">
        <KpiCard label="Plan" value={plan?.name ?? (platform ? 'Platform owner' : 'None')} hint={subscription ? `${subscription.status}${subscription.end ? ` · ends ${fmtDate(subscription.end)}` : ' · open-ended'}` : platform ? 'Not subscription-gated' : 'Features locked'} />
        <KpiCard label="Seats" value={seats.limit ? `${seats.used} / ${seats.limit}` : seats.used} hint={seats.limit ? `${Math.round(pct)}% used` : 'No cap'} />
        <KpiCard label="Active users · 30 days" value={summary.users.active30} hint={summary.users.lastLogin ? `Last login ${relativeTime(summary.users.lastLogin)}` : 'Nobody has signed in'} />
        <KpiCard label="Buildings" value={f.buildings} hint={f.buildings ? `${fmtSft(f.area)} sq ft · ${f.leases} active leases` : 'None registered'} />
        <KpiCard label="CRM" value={f.crmAccounts} unit="accounts" hint={`${f.meetings} meetings logged`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-4">
          <Card
            title="Subscription"
            sub={platform ? 'Not subscription-gated' : 'Plan, seats and term'}
            action={!platform && (subscription
              ? <button className="btn py-1 text-[11px]" onClick={() => setDrawer({ entity: 'subscription', id: subscription.subscription_id, mode: 'edit' })}>Change plan / seats</button>
              : <button className="btn btn-gold py-1 text-[11px]" onClick={() => setDrawer({ entity: 'subscription', id: null, mode: 'create', presets: { org_id: org.org_id } })}>Assign plan</button>)}
          >
            {subscription ? (
              <>
                <div className="mb-2 flex items-baseline justify-between text-[13px]">
                  <span className="font-bold text-ink">{plan?.name}</span>
                  <span className="text-ink-muted">{seats.used} of {seats.limit} seats</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-hover"><div className={`h-full rounded-full ${pct >= 100 ? 'bg-crit' : 'bg-royal'}`} style={{ width: `${pct}%` }} /></div>
                <dl className="mt-3 grid grid-cols-[90px_1fr] gap-y-1 text-[12px]">
                  <dt className="text-ink-muted">Status</dt><dd><StatusBadge status={subscription.status} /></dd>
                  <dt className="text-ink-muted">Term</dt><dd>{fmtDate(subscription.start)} → {subscription.end ? fmtDate(subscription.end) : 'open-ended'}</dd>
                  <dt className="text-ink-muted">Features</dt><dd>{plan?.feature_flags.length ? `${plan.feature_flags.length} features` : internal ? 'All (internal role)' : 'None'}</dd>
                </dl>
              </>
            ) : (
              <p className="text-[13px] text-ink-muted">{platform ? 'Platform admins have every feature.' : 'No live subscription — this organisation’s plan features are locked.'}</p>
            )}
            {subscriptions.filter((x) => x.subscription_id !== subscription?.subscription_id).length > 0 && (
              <p className="mt-3 border-t border-line-light pt-2 text-[11px] text-ink-muted">
                History: {subscriptions.filter((x) => x.subscription_id !== subscription?.subscription_id).map((x) => `${plans.find((p) => p.plan_code === x.plan_code)?.name ?? x.plan_code} (${x.status.toLowerCase()})`).join(' · ')}
              </p>
            )}
          </Card>

          <Card title={`Issues (${issues.length})`} sub="Account, billing and data problems for this organisation">
            <IssueGroups issues={issues} orgName={() => org.name} showOrg={false} limit={3} />
          </Card>

          <Card title="On the platform" sub="Support access to this organisation’s workspace">
            <ul className="grid gap-2 text-[13px] sm:grid-cols-2">
              {org.type === 'Owner' && (
                <>
                  <li><a className="font-semibold text-royal hover:underline" href={href('buildings/table')}>{f.buildings} buildings</a>{f.area > 0 && <span className="text-ink-muted"> · {fmtSft(f.area)} sq ft</span>}</li>
                  <li><a className="font-semibold text-royal hover:underline" href={href('leases/table')}>{f.leases} active leases</a></li>
                  <li><span className="font-semibold text-ink">{f.documents}</span> <span className="text-ink-muted">compliance documents</span></li>
                  <li><a className="font-semibold text-royal hover:underline" href={href('mandates')}>{f.mandates} mandates</a></li>
                </>
              )}
              <li><button className="font-semibold text-royal hover:underline" onClick={openCrm}>{f.crmAccounts} CRM accounts</button> <span className="text-ink-muted">· {f.meetings} meetings</span></li>
              {firstActive && <li><button className="font-semibold text-royal hover:underline" onClick={() => viewAs(firstActive.user_id).catch((e) => toast('error', e.message))}>See their workspace (View as)</button></li>}
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card
            title={`People (${users.length})`}
            sub={`${summary.users.active} active · ${invites.filter((i) => i.status === 'Pending').length} pending invites`}
            action={<button className="btn py-1 text-[11px]" onClick={() => setDrawer({ entity: 'invite', id: null, mode: 'create', presets: { org_id: org.org_id } })}>+ Invite user</button>}
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-[13px]">
                <tbody>
                  {users.map((u) => (
                    <tr key={u.user_id} className="border-b border-line-light">
                      <td className="px-4 py-2 sm:px-[18px]">
                        <button className="font-semibold text-ink hover:text-royal hover:underline" onClick={() => setDrawer({ entity: 'user', id: u.user_id, mode: 'view' })}>{u.name}</button>
                        <div className="text-[11px] text-ink-muted">{u.role} · {u.email}</div>
                      </td>
                      <td className="px-2 py-2 text-[12px] text-ink-soft">{u.last_login ? `Signed in ${relativeTime(u.last_login)}` : <span className="text-warn">Never signed in</span>}</td>
                      <td className="px-2 py-2"><StatusBadge status={u.status} /></td>
                      <td className="whitespace-nowrap px-4 py-2 text-right sm:px-[18px]">
                        {u.status === 'Active' && u.user_id !== session.actor.user_id && <button className="btn mr-1.5 py-0.5 text-[11px]" onClick={() => viewAs(u.user_id).catch((e) => toast('error', e.message))}>View as</button>}
                        {u.user_id !== session.actor.user_id && u.status === 'Active' && <button className="btn py-0.5 text-[11px]" onClick={() => setUserStatus(u, 'Disabled')}>Disable</button>}
                        {u.status === 'Disabled' && <button className="btn py-0.5 text-[11px]" onClick={() => setUserStatus(u, 'Active')}>Enable</button>}
                      </td>
                    </tr>
                  ))}
                  {invites.filter((i) => i.status === 'Pending').map((i) => {
                    const expired = i.expires_at < new Date().toISOString()
                    return (
                      <tr key={i.invite_id} className="border-b border-line-light bg-canvas/60">
                        <td className="px-4 py-2 sm:px-[18px]">
                          <span className="font-semibold text-ink-soft">{i.email}</span>
                          <div className="text-[11px] text-ink-muted">Invited · {i.role}</div>
                        </td>
                        <td className={`px-2 py-2 text-[12px] ${expired ? 'text-crit' : 'text-ink-soft'}`}>{expired ? `Expired ${fmtDate(i.expires_at)}` : `Expires ${fmtDate(i.expires_at)}`}</td>
                        <td className="px-2 py-2"><StatusBadge status="Pending" /></td>
                        <td className="whitespace-nowrap px-4 py-2 text-right sm:px-[18px]">
                          <button className="btn mr-1.5 py-0.5 text-[11px]" onClick={() => run(() => api.resendInvite(i.invite_id, session), `Invite resent to ${i.email}.`)}>Resend</button>
                          <button className="btn py-0.5 text-[11px]" onClick={() => run(() => api.revokeInvite(i.invite_id, session), `Invite to ${i.email} revoked — seat freed.`)}>Revoke</button>
                        </td>
                      </tr>
                    )
                  })}
                  {!users.length && <tr><td className="px-4 py-6 text-center text-ink-muted">No users yet — invite the first one.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="pb-2" />
          </Card>

          <Card title="Activity" sub="Changes in this organisation, newest first" action={<a href={href('admin/audit')} className="text-xs font-semibold text-royal hover:underline">Full audit log →</a>}>
            {audit.length ? (
              <ul className="divide-y divide-line-light">
                {audit.map((e) => (
                  <li key={e.audit_id} className="flex items-baseline justify-between gap-3 py-1.5 text-[12px]">
                    <span className="min-w-0">
                      <span className="font-semibold text-ink">{names[e.user_id] ?? e.user_id}</span>{' '}
                      <span className="text-ink-soft">{e.action.toLowerCase()} {e.entity} · {e.entity_label}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-ink-muted">{relativeTime(e.timestamp)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="py-4 text-center text-[12px] text-ink-muted">No recorded activity yet.</p>}
          </Card>
        </div>
      </div>

      {drawer && (
        <RecordDrawer
          entity={drawer.entity}
          id={drawer.id}
          mode={drawer.mode}
          session={session}
          ctx={ctx}
          linkTo={linkFor(session)}
          defaultOrgId={org.org_id}
          presets={drawer.presets}
          onClose={() => setDrawer(null)}
          onMode={(mode, rid) => (mode === 'view' && drawer.mode !== 'view' ? setDrawer(null) : setDrawer({ ...drawer, mode, id: rid ?? drawer.id }))}
        />
      )}
      {confirm && (
        <Modal
          tone={confirm === 'Suspended' ? 'crit' : 'ok'}
          title={confirm === 'Suspended' ? `Suspend ${org.name}?` : `Activate ${org.name}?`}
          onClose={() => setConfirm(null)}
          actions={
            <>
              <button className="btn" onClick={() => setConfirm(null)}>Cancel</button>
              <button
                className={`btn ${confirm === 'Suspended' ? 'btn-danger' : 'btn-gold'}`}
                onClick={async () => {
                  await run(() => api.update('organisation', org.org_id, { status: confirm }, session), confirm === 'Suspended' ? `${org.name} suspended — its users can no longer sign in.` : `${org.name} activated.`)
                  setConfirm(null)
                }}
              >
                {confirm === 'Suspended' ? 'Suspend' : 'Activate'}
              </button>
            </>
          }
        >
          {confirm === 'Suspended'
            ? <>All {summary.users.active} users of {org.name} will be blocked from signing in. Their data is kept and access returns when you reactivate.</>
            : <>{org.name}’s users will be able to sign in{subscription ? '' : ' — note it has no live plan yet, so plan features stay locked until you assign one'}.</>}
        </Modal>
      )}
    </>
  )
}
