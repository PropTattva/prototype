import * as api from '../data/api'
import { useApi } from '../data/useApi'
import type { EntityKey } from '../entities/types'
import { href } from '../state/router'
import { useAuthed } from '../state/SessionContext'
import EntityPage from '../components/crud/EntityPage'
import PageHeader from '../components/ui/PageHeader'

const TABS: { key: 'users' | 'invites'; entity: EntityKey; label: string }[] = [
  { key: 'users', entity: 'user', label: 'Users' },
  { key: 'invites', entity: 'invite', label: 'Invites' },
]

export const teamLink = (entity: EntityKey, id: string) =>
  entity === 'user' ? href(`team/users/${id}`) : entity === 'invite' ? href(`team/invites/${id}`) : null

/** EP-A-S03: an org manages its own users and invites within its seat limit. */
export default function Team({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const [tabKey = 'users', ...more] = rest
  const tab = TABS.find((t) => t.key === tabKey) ?? TABS[0]
  const { data: seats } = useApi(() => api.getSeatUsage(session.org.org_id, session), [session.org.org_id])
  const full = seats?.limit != null && seats.used >= seats.limit
  const pct = seats?.limit ? Math.min(100, (seats.used / seats.limit) * 100) : 0

  return (
    <>
      <PageHeader title="Team & seats" subtitle={`${session.org.name} · invite teammates by email with a role`} />
      {seats && seats.limit != null && (
        <div className={`mb-4 rounded-lg border bg-white p-4 ${full ? 'border-crit/40' : 'border-line'}`}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <div className="text-sm">
              <strong className="text-royal">{seats.used} of {seats.limit} seats used</strong>
              <span className="ml-2 text-xs text-ink-muted">{seats.users} user{seats.users === 1 ? '' : 's'} + {seats.pending} pending invite{seats.pending === 1 ? '' : 's'} · {session.plan?.name}</span>
            </div>
            {full && <a href={href('subscription')} className="text-xs font-bold text-crit hover:underline">Seat limit reached — upgrade →</a>}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-hover">
            <div className={`h-full rounded-full ${full ? 'bg-crit' : 'bg-royal'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
      <div className="mb-3 flex gap-1 border-b border-line">
        {TABS.map((t) => (
          <a
            key={t.key}
            href={href(`team/${t.key}`)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${t.key === tab.key ? 'border-gold text-royal' : 'border-transparent text-ink-soft hover:text-royal'}`}
          >
            {t.label}
          </a>
        ))}
      </div>
      <EntityPage key={tab.key} entity={tab.entity} basePath={`team/${tab.key}`} rest={more} linkTo={teamLink} ownOrgOnly embedded />
    </>
  )
}
