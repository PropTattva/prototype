import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'

/** Building registry (E1-S01). Owners see their own, AA their mandated buildings, occupiers/brokers published ones. */
export default function Buildings({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const owner = session.role === 'Owner/Developer'
  const { data: quota } = useApi(() => (owner ? api.getBuildingQuota(session.org.org_id, session) : Promise.resolve(null)), [session.org.org_id])
  const over = quota?.limit != null && quota.used >= quota.limit
  const subtitle = {
    'Super Admin': 'Every building across all owner orgs.',
    AA: 'Buildings under an active AA mandate.',
    'Owner/Developer': `${session.org.name} · identity, floors, documents and ownership for each asset.`,
    Occupier: 'Published building profiles. Tenant names and commercials are not shared.',
    Enabler: 'Published listings you can introduce occupiers to.',
  }[session.role]

  return (
    <EntityPage
      entity="building"
      basePath="buildings"
      rest={rest}
      title={owner ? 'Buildings' : session.role === 'Occupier' || session.role === 'Enabler' ? 'Browse buildings' : 'Buildings'}
      subtitle={subtitle}
      linkTo={linkFor(session)}
      ownOrgOnly={owner}
      rowHref={(r) => href(`buildings/${r.building_id}`)}
      onNew={() => navigate('buildings/new')}
      newLabel="Register building"
      hideColumns={session.role === 'Occupier' || session.role === 'Enabler' ? ['published'] : []}
      banner={
        quota && quota.limit != null ? (
          <div className={`mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white px-4 py-2.5 text-sm ${over ? 'border-crit/40' : 'border-line'}`}>
            <span>
              <strong className={over ? 'text-crit' : 'text-royal'}>{quota.used} of {quota.limit} buildings</strong>
              <span className="ml-2 text-xs text-ink-muted">on {quota.planName}</span>
            </span>
            {over && (
              <a href={href('subscription')} className="text-xs font-bold text-crit hover:underline">
                {quota.used > quota.limit ? 'Over your plan limit — upgrade to add buildings →' : 'Limit reached — upgrade to add more →'}
              </a>
            )}
          </div>
        ) : null
      }
    />
  )
}
