import { useState, type ReactNode } from 'react'
import * as api from '../../data/api'
import { ApiError } from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Opportunity } from '../../domain/mandates'
import { OPP_STAGES } from '../../entities/mandates'
import { fmtDate } from '../../lib/dates'
import { linkFor } from '../../lib/links'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import { relativeTime } from '../../components/crud/fields'
import RecordDrawer, { useErrorHandler } from '../../components/crud/RecordDrawer'
import Badge from '../../components/ui/Badge'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'

const initials = (n: string) => n.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

/** v6 BD pipeline: your accounts + unclaimed ones; everyone else's are locked behind an access request. */
export default function Pipeline({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const toast = useToast()
  const { handle, dialog, setDialog } = useErrorHandler(session)
  const { data } = useApi(async () => {
    const [opps, locked, reqs, ctx] = await Promise.all([api.list('opportunity', session), api.lockedAccounts(session), api.accessRequests(session), api.getOptionCtx(session)])
    return { opps: opps as Opportunity[], locked, reqs, ctx }
  }, [session.user.user_id])
  const [form, setForm] = useState({ account_name: '', deal_type: 'New office', team: 'AA', potential_lakh: '' as string | number, notes: '' })
  if (!data) return null
  const { opps, locked, reqs, ctx } = data
  const userName = (id: string | null) => ctx.users.find((u) => u.user_id === id)?.name ?? 'Unclaimed'
  const released = opps.filter((o) => !o.owner_user_id || Date.now() - new Date(o.last_activity).getTime() > 120 * 86_400_000)
  const active = opps.filter((o) => !released.includes(o))
  const [openId, mode] = rest
  const pending = reqs.incoming.filter((r) => r.status === 'Pending')

  const lockModal = (oppId: string): ReactNode => {
    const acc = locked.find((l) => l.opp_id === oppId)
    return (
      <Modal
        tone="crit"
        title="Account already tagged"
        onClose={() => setDialog(null)}
        actions={
          <>
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                try {
                  await api.requestAccess(oppId, session)
                  setDialog(
                    <Modal tone="ok" title="Request sent" onClose={() => setDialog(null)} actions={<button className="btn btn-primary" onClick={() => setDialog(null)}>Got it</button>}>
                      Access request sent to <strong className="text-ink">{acc?.owner}</strong>. They have 48 hours to approve, decline, or propose co-ownership.
                      <div className="my-3 rounded-md bg-royal-soft px-3 py-2 text-royal">If there is no response in 48 hours, the request escalates to the AA / N8 team leads.</div>
                      Until then, you cannot log activity on {acc?.account_name}.
                    </Modal>,
                  )
                } catch (e) {
                  handle(e)
                }
              }}
            >
              Request access from {acc?.owner.split(' ')[0]}
            </button>
          </>
        }
      >
        <strong className="text-ink">{acc?.account_name}</strong> is already an active account with:
        <div className="my-3 rounded-md bg-crit-bg px-3.5 py-3 text-xs text-ink">
          <strong>{acc?.owner}</strong> ({acc?.team})<br />
          Last activity: {acc ? fmtDate(acc.last_activity) : ''} · Pipeline stage: {acc?.stage}
        </div>
        <strong className="text-ink">CRM ownership lock</strong> prevents duplicate outreach — it protects client trust, avoids internal collisions and keeps attribution clean.
      </Modal>
    )
  }

  const saveNew = async () => {
    try {
      const o = await api.createOpportunity({ ...form, potential_lakh: form.potential_lakh === '' ? null : Number(form.potential_lakh), stage: 'Prospect' }, session)
      toast('ok', `${o.account_name} added to your pipeline.`)
      setForm({ account_name: '', deal_type: 'New office', team: 'AA', potential_lakh: '', notes: '' })
    } catch (e) {
      if (e instanceof ApiError && e.message.startsWith('LOCKED:')) setDialog(lockModal(e.message.slice(7)))
      else if (e instanceof ApiError && e.message.startsWith('RELEASED:')) {
        const id = e.message.slice(9)
        setDialog(
          <Modal title="Released account" onClose={() => setDialog(null)} actions={<><button className="btn" onClick={() => setDialog(null)}>Cancel</button><button className="btn btn-gold" onClick={async () => { await api.claimOpportunity(id, session); setDialog(null); toast('ok', 'Account claimed — it is now yours.') }}>Claim account</button></>}>
            This account was released after 120 days without activity. You can claim it.
          </Modal>,
        )
      } else handle(e)
    }
  }

  return (
    <>
      <PageHeader
        title={session.role === 'Super Admin' ? 'BD pipeline — all teams' : `BD pipeline — ${session.user.name.split(' ')[0]}’s view`}
        subtitle="AA / N8 business development before a mandate is signed."
      />
      {session.role !== 'Super Admin' && (
        <div className="mb-3.5 rounded-[5px] border-l-[3px] border-royal bg-royal-soft px-3.5 py-2.5 text-xs leading-relaxed text-royal-dark">
          <strong>CRM ownership lock active.</strong> You see only accounts you own (or co-own) plus unclaimed ones. Accounts owned by other BD team members are locked — try adding <em>Orion Search India</em> below to see what happens.
        </div>
      )}

      {pending.length > 0 && (
        <Card title={`Access requests waiting on you (${pending.length})`} sub="Answer within 48 hours or it escalates to the team leads" className="mb-3.5">
          <ul className="divide-y divide-line-light">
            {pending.map((r) => (
              <li key={r.request_id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13px]">
                <span><b>{r.requester}</b> wants access to <b>{r.account}</b> <span className="text-[11px] text-ink-muted">· {relativeTime(r.created_at)}{r.overdue ? ' · escalated' : ''}</span></span>
                <span className="flex gap-1.5">
                  {(['Declined', 'Co-owned', 'Approved'] as const).map((d) => (
                    <button
                      key={d}
                      className={`btn py-1 text-[11px] ${d === 'Approved' ? 'btn-primary' : ''}`}
                      onClick={async () => {
                        try {
                          await api.decideAccess(r.request_id, d, session)
                          toast('ok', d === 'Approved' ? 'Account handed over.' : d === 'Co-owned' ? 'Added as co-owner.' : 'Request declined.')
                        } catch (e) {
                          handle(e)
                        }
                      }}
                    >
                      {d === 'Approved' ? 'Hand over' : d === 'Co-owned' ? 'Co-own' : 'Decline'}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="mb-3.5 grid gap-2.5 overflow-x-auto pb-1 lg:grid-cols-6">
        {OPP_STAGES.map((st) => {
          const cards = active.filter((o) => o.stage === st)
          const won = st === 'Won'
          return (
            <section key={st} className={`min-h-[220px] min-w-[200px] rounded-[7px] border border-line p-3 ${won ? 'bg-ok-bg' : 'bg-white'}`}>
              <header className={`mb-2.5 flex justify-between text-[11px] font-extrabold uppercase tracking-[0.08em] ${won ? 'text-ok' : 'text-royal'}`}>
                {st}
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${won ? 'bg-ok text-white' : 'bg-royal-soft text-royal'}`}>{cards.length}</span>
              </header>
              {cards.map((o) => (
                <button key={o.opp_id} onClick={() => navigate(`pipeline/${o.opp_id}`)} className={`relative mb-2 block w-full rounded border-l-[3px] p-2.5 text-left text-[11px] hover:bg-royal-soft ${won ? 'bg-white' : 'bg-canvas'} ${(o.probability ?? 0) >= 50 && !won ? 'border-gold' : 'border-royal'}`}>
                  <span className="absolute right-2 top-2 rounded-[3px] bg-royal px-1.5 text-[9px] font-bold text-gold">{initials(userName(o.owner_user_id))}</span>
                  <span className="block pr-7 text-xs font-bold text-ink">{o.account_name}</span>
                  <span className="block text-[10px] text-ink-muted">{o.team} · {o.deal_type}</span>
                  <span className="block font-bold text-royal">₹{o.potential_lakh ?? '—'} L{o.probability != null && !won ? ` · ${o.probability}% prob` : ''}</span>
                  {o.co_owners.length > 0 && <span className="block text-[10px] text-ink-muted">co-owned</span>}
                </button>
              ))}
            </section>
          )
        })}
      </div>

      <div className="grid gap-3.5 xl:grid-cols-[1fr_1.2fr]">
        {session.role !== 'Super Admin' && (
          <Card title="New opportunity" sub="PT checks ownership before you proceed">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><label className="label" htmlFor="o-n">Company name *</label><input id="o-n" className="input" value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="e.g. Orion Search India" /></div>
              <div><label className="label" htmlFor="o-d">Deal type</label><select id="o-d" className="input" value={form.deal_type} onChange={(e) => setForm({ ...form, deal_type: e.target.value })}>{['New office', 'Expansion', 'Renewal', 'Relocation'].map((x) => <option key={x}>{x}</option>)}</select></div>
              <div><label className="label" htmlFor="o-t">Team</label><select id="o-t" className="input" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })}><option>AA</option><option>N8</option></select></div>
              <div><label className="label" htmlFor="o-p">Mandate potential (₹ L)</label><input id="o-p" type="number" className="input" value={form.potential_lakh} onChange={(e) => setForm({ ...form, potential_lakh: e.target.value })} /></div>
            </div>
            <div className="mt-3 rounded-md bg-warn-bg px-3 py-2 text-xs text-warn"><strong>Ownership check runs on save.</strong> If the company is already an active account, you will be asked to request access from its owner.</div>
            <div className="mt-3 flex justify-end"><button className="btn btn-gold" disabled={!form.account_name.trim() || session.readOnly} onClick={saveNew}>Save & check ownership</button></div>
          </Card>
        )}
        <Card title="Accounts owned by other BD team members" sub={`${locked.length} locked · request access before engaging any`} flush>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-[13px]">
              <thead>
                <tr className="border-b border-line bg-canvas text-left text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  <th className="px-4 py-2.5">Account</th><th className="px-3 py-2.5">Owner</th><th className="px-3 py-2.5">Last activity</th><th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {locked.map((l) => (
                  <tr key={l.opp_id} className="border-b border-line-light">
                    <td className="px-4 py-2.5 font-semibold">{l.account_name}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{l.owner} · {l.team}</td>
                    <td className="px-3 py-2.5 text-ink-soft">{fmtDate(l.last_activity)} <span className="text-[11px] text-ink-muted">({relativeTime(l.last_activity)})</span></td>
                    <td className="px-4 py-2.5 text-right">
                      {l.my_request === 'Pending' ? <Badge tone="warn">Requested</Badge> : l.my_request === 'Declined' ? <Badge tone="crit">Declined</Badge> : session.role !== 'Super Admin' && <button className="btn py-1 text-[11px]" onClick={() => setDialog(lockModal(l.opp_id))}>Request access</button>}
                    </td>
                  </tr>
                ))}
                {released.map((o) => (
                  <tr key={o.opp_id} className="border-b border-line-light">
                    <td className="px-4 py-2.5 font-semibold">{o.account_name}</td>
                    <td className="px-3 py-2.5 text-ink-soft">— (released, {Math.round((Date.now() - new Date(o.last_activity).getTime()) / 86_400_000)} days inactive)</td>
                    <td className="px-3 py-2.5 text-ink-soft">{fmtDate(o.last_activity)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!session.readOnly && <button className="btn btn-gold py-1 text-[11px]" onClick={async () => { try { await api.claimOpportunity(o.opp_id, session); toast('ok', 'Account claimed.') } catch (e) { handle(e) } }}>Claim account</button>}
                    </td>
                  </tr>
                ))}
                {!locked.length && !released.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-ink-muted">No locked accounts.</td></tr>}
              </tbody>
            </table>
          </div>
          {reqs.outgoing.length > 0 && (
            <p className="border-t border-line px-4 py-2 text-[11px] text-ink-muted">
              Your requests: {reqs.outgoing.map((r) => `${r.account} (${r.status.toLowerCase()})`).join(' · ')}
            </p>
          )}
        </Card>
      </div>
      {openId && (
        <RecordDrawer
          entity="opportunity"
          id={openId}
          mode={mode === 'edit' ? 'edit' : 'view'}
          session={session}
          ctx={ctx}
          linkTo={linkFor(session)}
          defaultOrgId={null}
          onClose={() => navigate('pipeline')}
          onMode={(m, id) => navigate(m === 'edit' ? `pipeline/${id}/edit` : `pipeline/${id}`)}
        />
      )}
      {dialog}
    </>
  )
}
