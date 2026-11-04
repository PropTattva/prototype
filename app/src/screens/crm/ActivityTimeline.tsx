import * as api from '../../data/api'
import type { CrmActivity } from '../../domain/crm'
import { downloadIcs, nextActionIcs } from '../../lib/crm'
import { fmtDate } from '../../lib/dates'
import { href } from '../../state/router'
import { useToast } from '../../components/ui/Toast'
import { Chip, contactLabel, NextActionTag, type CrmCtx } from './shared'

const month = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

/** Meetings, newest first, grouped by month. Used on the account, contact and all-activities views. */
export default function ActivityTimeline({ c, items, showAccount = true, empty }: { c: CrmCtx; items: CrmActivity[]; showAccount?: boolean; empty: string }) {
  if (!items.length) return <p className="py-10 text-center text-[13px] text-ink-muted">{empty}</p>
  const groups: [string, CrmActivity[]][] = []
  for (const a of items) {
    const m = month(a.date)
    if (groups.at(-1)?.[0] === m) groups.at(-1)![1].push(a)
    else groups.push([m, [a]])
  }
  return (
    <div className="space-y-5">
      {groups.map(([m, list]) => (
        <section key={m}>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">{m} · {list.length}</h4>
          <ol className="relative space-y-2.5 border-l-2 border-line pl-4">
            {list.map((a) => <Item key={a.activity_id} c={c} a={a} showAccount={showAccount} />)}
          </ol>
        </section>
      ))}
    </div>
  )
}

function Item({ c, a, showAccount }: { c: CrmCtx; a: CrmActivity; showAccount: boolean }) {
  const toast = useToast()
  const acc = c.account(a.account_id)
  const others = a.additional_attendees.map(c.userName)
  const markDone = async () => {
    try {
      await api.update('crmActivity', a.activity_id, { next_action_done: true }, c.session)
      toast('ok', `${a.next_action} marked done.`)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }
  const remind = () =>
    downloadIcs(
      `${(acc?.name ?? 'follow-up').replace(/\W+/g, '-')}-${a.next_action_date}.ics`,
      nextActionIcs({ uid: a.activity_id, title: `${a.next_action} — ${acc?.name ?? ''}`, date: a.next_action_date!, description: a.notes ?? '', location: a.city }),
    )

  return (
    <li className="relative rounded-lg border border-line bg-white p-3">
      <span className="absolute -left-[23px] top-4 h-3 w-3 rounded-full border-2 border-white bg-gold" aria-hidden="true" />
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-ink">
            {showAccount && acc && <a className="text-royal hover:underline" href={href(`crm/accounts/${acc.account_id}`)}>{acc.name}</a>}
            {showAccount && ' · '}
            {a.contact_ids.map((id, i) => (
              <span key={id}>
                {i > 0 && ', '}
                <a className="hover:underline" href={href(`crm/contacts/${id}`)}>{contactLabel(c.contact(id))}</a>
              </span>
            ))}
          </div>
          <div className="mt-0.5 text-[11px] text-ink-muted">
            {fmtDate(a.date)} · {a.city} · {c.userName(a.primary_attendee_id)}
            {others.length > 0 && ` with ${others.join(', ')}`}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          {c.multiOrg && <Chip tone="ok">{c.orgName(a.org_id)}</Chip>}
          <Chip tone="royal">{a.purpose}</Chip>
          <Chip>{a.medium}</Chip>
          <Chip tone="gold">{a.record_type}</Chip>
        </div>
      </div>
      {a.notes && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-ink-soft">{a.notes}</p>}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-line-light pt-2">
        <div className="text-[11px] text-ink-muted">
          Next action: <NextActionTag a={a} />
        </div>
        {c.canWrite && (
          <div className="flex gap-1.5">
            {a.next_action && !a.next_action_done && (
              <>
                <button className="btn py-1 text-[11px]" onClick={remind} title="Download an Outlook reminder (.ics)">Outlook reminder</button>
                <button className="btn py-1 text-[11px]" onClick={markDone}>Mark done</button>
              </>
            )}
            <button className="btn py-1 text-[11px]" onClick={() => c.open({ kind: 'meeting', activityId: a.activity_id })}>Edit</button>
          </div>
        )}
      </div>
    </li>
  )
}
