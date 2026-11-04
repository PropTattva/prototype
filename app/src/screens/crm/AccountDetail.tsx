import * as api from '../../data/api'
import { BD_STAGES } from '../../domain/crm'
import { fmtPhone, fullName } from '../../lib/crm'
import { fmtDate } from '../../lib/dates'
import { href } from '../../state/router'
import Card from '../../components/ui/Card'
import { useToast } from '../../components/ui/Toast'
import ActivityTimeline from './ActivityTimeline'
import { byDateDesc, Chip, type CrmCtx } from './shared'

/** One firm: classification, people, BD pipeline position and every meeting with them. */
export default function AccountDetail({ c, id }: { c: CrmCtx; id: string }) {
  const toast = useToast()
  const a = c.account(id)
  if (!a) return <p className="text-sm text-ink-muted">Account not found. <a className="text-royal underline" href={href('crm/accounts')}>Back to accounts</a></p>
  const contacts = c.book.contacts.filter((x) => x.account_id === id).sort((x, y) => fullName(x).localeCompare(fullName(y)))
  const meetings = c.book.activities.filter((m) => m.account_id === id).sort(byDateDesc)
  const lastMet = new Map<string, string>()
  for (const m of meetings) for (const cid of m.contact_ids) if (!lastMet.has(cid)) lastMet.set(cid, m.date)
  const isOwner = a.owner_user_id === c.session.user.user_id || c.session.role === 'Super Admin'

  const setStage = async (stage: string | null) => {
    try {
      await api.updateCrmAccount(a.account_id, stage ? { stage, deal_type: a.deal_type ?? 'New office' } : { stage: null }, c.session)
      toast('ok', stage ? `${a.name} moved to ${stage}.` : `${a.name} removed from the pipeline.`)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <>
      <a href={href('crm/accounts')} className="mb-2 inline-block text-[12px] font-semibold text-royal hover:underline">← Accounts</a>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-royal">{a.name}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip tone="royal">{a.relationship_type}</Chip>
            <Chip tone="gold">{a.record_type}</Chip>
            {a.city && <Chip>{a.city}</Chip>}
            {a.industry && <Chip>{a.industry}</Chip>}
            <span className="text-[12px] text-ink-muted">Owner: {c.userName(a.owner_user_id)}{c.isAdmin ? ` · ${c.orgName(a.org_id)}` : ''}</span>
          </div>
        </div>
        {c.canWrite && (
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => c.open({ kind: 'account', id })}>Edit</button>
            <button className="btn" onClick={() => c.open({ kind: 'contact', accountId: id })}>+ Add contact</button>
            <button className="btn btn-gold" onClick={() => c.open({ kind: 'meeting', accountId: id })}>+ Log meeting</button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card title={`Contacts (${contacts.length})`} action={c.canWrite && <button className="text-[12px] font-semibold text-royal hover:underline" onClick={() => c.open({ kind: 'contact', accountId: id })}>+ Add</button>} flush>
            <ul className="divide-y divide-line-light">
              {contacts.map((x) => (
                <li key={x.contact_id} className="px-4 py-2.5 sm:px-[18px]">
                  <a className="text-[13px] font-bold text-ink hover:text-royal hover:underline" href={href(`crm/contacts/${x.contact_id}`)}>{fullName(x)}</a>
                  {x.title && <div className="text-[12px] text-ink-soft">{x.title}</div>}
                  <div className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-ink-muted">
                    {x.email && <a className="hover:text-royal" href={`mailto:${x.email}`}>{x.email}</a>}
                    {fmtPhone(x) && <a className="hover:text-royal" href={`tel:${x.phone_cc}${x.phone}`}>{fmtPhone(x)}</a>}
                  </div>
                  <div className="text-[11px] text-ink-muted">{lastMet.has(x.contact_id) ? `Last met ${fmtDate(lastMet.get(x.contact_id))}` : 'Not met yet'}</div>
                </li>
              ))}
              {!contacts.length && <li className="px-4 py-6 text-center text-[12px] text-ink-muted">No contacts yet.</li>}
            </ul>
            <div className="pb-2" />
          </Card>

          <Card title="BD pipeline" sub={a.stage ? `${a.deal_type ?? 'Deal'}${a.potential_lakh != null ? ` · ₹${a.potential_lakh} L potential` : ''}${a.probability != null ? ` · ${a.probability}% probability` : ''}` : 'Not tracked in the pipeline'}>
            {a.stage ? (
              <>
                <ol className="flex flex-wrap gap-1">
                  {BD_STAGES.map((s) => {
                    const on = s === a.stage
                    const cls = on ? (s === 'Won' ? 'border-ok bg-ok text-white' : s === 'Lost' ? 'border-crit bg-crit text-white' : 'border-royal bg-royal text-white') : 'border-line bg-white text-ink-soft hover:border-royal hover:text-royal'
                    return (
                      <li key={s}>
                        <button className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${cls}`} disabled={!isOwner || !c.canWrite || on} onClick={() => setStage(s)}>{s}</button>
                      </li>
                    )
                  })}
                </ol>
                {!isOwner && <p className="mt-2 text-[11px] text-ink-muted">Only {c.userName(a.owner_user_id)} (owner) can move the stage.</p>}
              </>
            ) : (
              isOwner && c.canWrite && <button className="btn" onClick={() => setStage('Prospect')}>+ Add to BD pipeline</button>
            )}
          </Card>

          <Card title="Details">
            <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[12px]">
              <dt className="text-ink-muted">Domain</dt><dd>{a.domain ?? '—'}</dd>
              <dt className="text-ink-muted">Meetings</dt><dd>{meetings.length}{meetings[0] ? ` · last ${fmtDate(meetings[0].date)}` : ''}</dd>
              <dt className="text-ink-muted">Added</dt><dd>{fmtDate(a.created_at)} by {c.userName(a.created_by)}</dd>
              {a.notes && <><dt className="text-ink-muted">Notes</dt><dd className="whitespace-pre-line">{a.notes}</dd></>}
            </dl>
          </Card>
        </div>

        <Card title={`Activity (${meetings.length})`} sub="Every meeting with this firm, newest first">
          <ActivityTimeline c={c} items={meetings} showAccount={false} empty="No meetings logged with this firm yet." />
        </Card>
      </div>
    </>
  )
}
