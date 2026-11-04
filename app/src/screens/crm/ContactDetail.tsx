import { fmtPhone, fullName } from '../../lib/crm'
import { fmtDate } from '../../lib/dates'
import { href } from '../../state/router'
import Card from '../../components/ui/Card'
import ActivityTimeline from './ActivityTimeline'
import { byDateDesc, Chip, type CrmCtx } from './shared'

/** One person: their details and every meeting they were in. */
export default function ContactDetail({ c, id }: { c: CrmCtx; id: string }) {
  const x = c.contact(id)
  if (!x) return <p className="text-sm text-ink-muted">Contact not found. <a className="text-royal underline" href={href('crm/contacts')}>Back to contacts</a></p>
  const acc = c.account(x.account_id)
  const meetings = c.book.activities.filter((m) => m.contact_ids.includes(id)).sort(byDateDesc)
  const colleagues = c.book.contacts.filter((y) => y.account_id === x.account_id && y.contact_id !== id)

  return (
    <>
      <a href={href('crm/contacts')} className="mb-2 inline-block text-[12px] font-semibold text-royal hover:underline">← Contacts</a>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-extrabold tracking-tight text-royal">{fullName(x)}</h1>
          <div className="mt-1 text-[13px] text-ink-soft">
            {x.title ? `${x.title} · ` : ''}
            {acc && <a className="font-semibold text-royal hover:underline" href={href(`crm/accounts/${acc.account_id}`)}>{acc.name}</a>}
          </div>
          {acc && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Chip tone="royal">{acc.relationship_type}</Chip>
              <Chip tone="gold">{acc.record_type}</Chip>
            </div>
          )}
        </div>
        {c.canWrite && (
          <div className="flex flex-wrap gap-2">
            <button className="btn" onClick={() => c.open({ kind: 'contact', id })}>Edit</button>
            <button className="btn btn-gold" onClick={() => c.open({ kind: 'meeting', accountId: x.account_id, contactId: id })}>+ Log meeting</button>
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Card title="Contact details">
            <dl className="grid grid-cols-[80px_1fr] gap-y-1.5 text-[12px]">
              <dt className="text-ink-muted">Email</dt><dd>{x.email ? <a className="text-royal hover:underline" href={`mailto:${x.email}`}>{x.email}</a> : '—'}</dd>
              <dt className="text-ink-muted">Mobile</dt><dd>{fmtPhone(x) ? <a className="text-royal hover:underline" href={`tel:${x.phone_cc}${x.phone}`}>{fmtPhone(x)}</a> : '—'}</dd>
              <dt className="text-ink-muted">City</dt><dd>{x.city ?? '—'}</dd>
              <dt className="text-ink-muted">Meetings</dt><dd>{meetings.length}{meetings[0] ? ` · last ${fmtDate(meetings[0].date)}` : ''}</dd>
              <dt className="text-ink-muted">Added</dt><dd>{fmtDate(x.created_at)} by {c.userName(x.created_by)}</dd>
            </dl>
          </Card>
          {colleagues.length > 0 && (
            <Card title={`Also at ${acc?.name}`} flush>
              <ul className="divide-y divide-line-light pb-2">
                {colleagues.map((y) => (
                  <li key={y.contact_id} className="px-4 py-2 sm:px-[18px]">
                    <a className="text-[13px] font-semibold text-ink hover:text-royal hover:underline" href={href(`crm/contacts/${y.contact_id}`)}>{fullName(y)}</a>
                    {y.title && <span className="text-[12px] text-ink-muted"> · {y.title}</span>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <Card title={`Activity (${meetings.length})`} sub={`Meetings ${x.first_name} was part of`}>
          <ActivityTimeline c={c} items={meetings} showAccount={false} empty={`No meetings with ${x.first_name} yet.`} />
        </Card>
      </div>
    </>
  )
}
