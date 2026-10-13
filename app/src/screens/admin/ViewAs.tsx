import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { useSession } from '../../state/SessionContext'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'

/** EP-C-S03: read-only impersonation to check exactly what a role and tier sees. */
export default function ViewAs() {
  const { session, viewAs } = useSession()
  const toast = useToast()
  const { data } = useApi(api.listSignInDirectory, [])
  const [q, setQ] = useState('')
  if (!data || !session) return null
  const people = data.filter((d) => d.user.user_id !== session.actor.user_id && `${d.user.name} ${d.org.name} ${d.user.role}`.toLowerCase().includes(q.toLowerCase()))
  const groups = [...new Set(people.map((p) => p.org.name))]

  return (
    <>
      <PageHeader title="View as" subtitle="See the platform exactly as another user does — same role, plan and field visibility. Read-only, and every session is audited." />
      <input className="input mb-3 max-w-sm" placeholder="Search people, orgs or roles" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
        {groups.map((g) => {
          const members = people.filter((p) => p.org.name === g)
          return (
            <Card key={g} title={g} sub={`${members[0].org.type}${members[0].planName ? ` · ${members[0].planName}` : ''}`}>
              <ul className="divide-y divide-line-light">
                {members.map(({ user }) => (
                  <li key={user.user_id} className="flex items-center justify-between gap-2 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold text-ink">{user.name}</span>
                      <span className="block text-[11px] text-ink-muted">{user.role} · {user.status}</span>
                    </span>
                    <button className="btn shrink-0" onClick={() => viewAs(user.user_id).catch((e) => toast('error', e.message))}>View as</button>
                  </li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    </>
  )
}
