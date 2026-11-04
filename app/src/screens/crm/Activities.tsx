import { useState } from 'react'
import * as api from '../../data/api'
import { daysBetween, fmtDate, todayIso } from '../../lib/dates'
import { href } from '../../state/router'
import Card from '../../components/ui/Card'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import ActivityTimeline from './ActivityTimeline'
import { byDateDesc, contactLabel, FilterSelect, NextActionTag, uniq, type CrmCtx } from './shared'

const PERIODS = [
  { key: '30', label: 'Last 30 days' },
  { key: '90', label: 'Last 90 days' },
  { key: '180', label: 'Last 6 months' },
  { key: 'all', label: 'All time' },
]

export function CrmHeaderActions({ c, extra }: { c: CrmCtx; extra?: React.ReactNode }) {
  return (
    <>
      <a className="btn" href={href('crm/settings')} title="Add or rename dropdown values">⚙ Dropdown values</a>
      {c.canWrite && extra}
      {c.canWrite && <button className="btn btn-gold" onClick={() => c.open({ kind: 'meeting' })}>+ Log meeting</button>}
    </>
  )
}

/** Every meeting logged in the org, with the viewer's open next actions on top. */
export default function Activities({ c }: { c: CrmCtx }) {
  const toast = useToast()
  const { book, session } = c
  const me = session.user.user_id
  const today = todayIso()
  const [q, setQ] = useState('')
  const [period, setPeriod] = useState('90')
  const [who, setWho] = useState('')
  const [medium, setMedium] = useState('')
  const [purpose, setPurpose] = useState('')
  const [record, setRecord] = useState('')
  const [city, setCity] = useState('')

  const all = [...book.activities].sort(byDateDesc)
  const since = (days: number) => all.filter((a) => daysBetween(a.date, today) <= days)
  const myOpen = all
    .filter((a) => a.primary_attendee_id === me && a.next_action && a.next_action_date && !a.next_action_done)
    .sort((a, b) => a.next_action_date!.localeCompare(b.next_action_date!))
  const overdue = myOpen.filter((a) => a.next_action_date! < today)

  const term = q.trim().toLowerCase()
  const shown = all.filter((a) => {
    if (period !== 'all' && daysBetween(a.date, today) > Number(period)) return false
    if (who === 'me' && a.primary_attendee_id !== me && !a.additional_attendees.includes(me)) return false
    if (who && who !== 'me' && a.primary_attendee_id !== who && !a.additional_attendees.includes(who)) return false
    if (medium && a.medium !== medium) return false
    if (purpose && a.purpose !== purpose) return false
    if (record && a.record_type !== record) return false
    if (city && a.city !== city) return false
    if (term) {
      const hay = [c.account(a.account_id)?.name, a.notes, ...a.contact_ids.map((id) => contactLabel(c.contact(id)))].join(' ').toLowerCase()
      if (!hay.includes(term)) return false
    }
    return true
  })

  const done = async (id: string, label: string) => {
    try {
      await api.update('crmActivity', id, { next_action_done: true }, session)
      toast('ok', `${label} marked done.`)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <>
      <PageHeader
        title="Activities"
        subtitle={c.multiOrg ? 'Every meeting logged across all organisations.' : `Every meeting logged by ${c.orgName(c.defaultOrg)} — visible to the whole team, never to other organisations.`}
        right={<CrmHeaderActions c={c} />}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Meetings · 30 days" value={String(since(30).length)} />
        <KpiCard label="Firms met · 90 days" value={String(new Set(since(90).map((a) => a.account_id)).size)} />
        <KpiCard label="My open next actions" value={String(myOpen.length)} />
        <KpiCard label="My overdue" value={String(overdue.length)} />
      </div>

      <Card title="My next actions" sub={myOpen.length ? `${myOpen.length} open · ${overdue.length} overdue` : 'Nothing open — nice.'} className="mb-4" flush>
        {myOpen.length > 0 && (
          <ul className="divide-y divide-line-light">
            {myOpen.slice(0, 8).map((a) => {
              const acc = c.account(a.account_id)
              return (
                <li key={a.activity_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-[18px]">
                  <div className="min-w-0">
                    <a className="text-[13px] font-bold text-royal hover:underline" href={href(`crm/accounts/${a.account_id}`)}>{acc?.name}</a>
                    <span className="text-[12px] text-ink-muted"> · {a.contact_ids.map((id) => contactLabel(c.contact(id))).join(', ')} · met {fmtDate(a.date)}</span>
                    <div><NextActionTag a={a} /></div>
                  </div>
                  {c.canWrite && (
                    <div className="flex gap-1.5">
                      <button className="btn py-1 text-[11px]" onClick={() => done(a.activity_id, a.next_action!)}>Mark done</button>
                      <button className="btn btn-primary py-1 text-[11px]" onClick={() => c.open({ kind: 'meeting', accountId: a.account_id, contactId: a.contact_ids[0] })}>Log follow-up</button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {myOpen.length > 8 && <p className="border-t border-line px-4 py-2 text-[11px] text-ink-muted sm:px-[18px]">+ {myOpen.length - 8} more in the timeline below</p>}
        {!myOpen.length && <div className="pb-2" />}
      </Card>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className="input w-full sm:w-64" placeholder="Search firm, person or notes" value={q} onChange={(e) => setQ(e.target.value)} />
        <select aria-label="Period" className="input w-auto py-1 text-xs" value={period} onChange={(e) => setPeriod(e.target.value)}>
          {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        <select aria-label="Attendee" className={`input w-auto py-1 text-xs ${who ? 'border-royal text-royal' : ''}`} value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Attendee: everyone</option>
          <option value="me">My meetings</option>
          {book.team.filter((u) => u.user_id !== me).map((u) => <option key={u.user_id} value={u.user_id}>{u.name}{c.multiOrg ? ` · ${c.orgName(u.org_id)}` : ''}</option>)}
        </select>
        <FilterSelect label="Medium" value={medium} options={uniq(all.map((a) => a.medium))} onChange={setMedium} />
        <FilterSelect label="Purpose" value={purpose} options={uniq(all.map((a) => a.purpose))} onChange={setPurpose} />
        <FilterSelect label="Record type" value={record} options={uniq(all.map((a) => a.record_type))} onChange={setRecord} />
        <FilterSelect label="City" value={city} options={uniq(all.map((a) => a.city))} onChange={setCity} />
        <span className="ml-auto text-[12px] text-ink-muted">{shown.length} meeting{shown.length === 1 ? '' : 's'}</span>
      </div>

      <ActivityTimeline c={c} items={shown} empty={all.length ? 'No meetings match these filters.' : 'No meetings yet — log your first one.'} />
    </>
  )
}
