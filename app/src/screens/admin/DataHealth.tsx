import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { ActionSeverity } from '../../lib/actions'
import type { HealthArea } from '../../lib/platformHealth'
import { useAuthed } from '../../state/SessionContext'
import KpiCard from '../../components/ui/KpiCard'
import PageHeader from '../../components/ui/PageHeader'
import IssueGroups, { AREAS } from './Issues'

/** Every account, billing and data-quality issue on the platform, filterable, each linking to its fix. */
export default function DataHealth() {
  const session = useAuthed()
  const { data } = useApi(async () => {
    const [issues, orgs] = await Promise.all([api.platformIssues(session), api.list('organisation', session)])
    return { issues, orgs }
  }, [session.user.user_id])
  const [area, setArea] = useState<HealthArea | ''>('')
  const [sev, setSev] = useState<ActionSeverity | ''>('')
  const [org, setOrg] = useState('')
  if (!data) return null
  const orgName = (id: string | null) => (data.orgs.find((o) => o.org_id === id)?.name as string) ?? 'Master data'
  const shown = data.issues.filter((i) => (!area || i.area === area) && (!sev || i.severity === sev) && (!org || (org === 'master' ? !i.org_id : i.org_id === org)))
  const count = (a: HealthArea) => data.issues.filter((i) => i.area === a && i.severity !== 'Info').length

  return (
    <>
      <PageHeader title="Data health" subtitle="Problems across every organisation — accounts, billing and data quality — each linked to where you fix it." />
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Critical" value={data.issues.filter((i) => i.severity === 'Critical').length} hint="Fix first" />
        {AREAS.map((a) => <KpiCard key={a} label={`${a} issues`} value={count(a)} hint="critical + warnings" />)}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select aria-label="Area" className="input w-auto py-1 text-xs" value={area} onChange={(e) => setArea(e.target.value as HealthArea | '')}>
          <option value="">Area: all</option>
          {AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select aria-label="Severity" className="input w-auto py-1 text-xs" value={sev} onChange={(e) => setSev(e.target.value as ActionSeverity | '')}>
          <option value="">Severity: all</option>
          <option value="Critical">Critical</option>
          <option value="Warning">Warning</option>
          <option value="Info">Heads-up</option>
        </select>
        <select aria-label="Organisation" className="input w-auto py-1 text-xs" value={org} onChange={(e) => setOrg(e.target.value)}>
          <option value="">Organisation: all</option>
          <option value="master">Master data (shared catalogues)</option>
          {data.orgs.map((o) => <option key={o.org_id as string} value={o.org_id as string}>{o.name as string}</option>)}
        </select>
        <span className="ml-auto text-[12px] text-ink-muted">{shown.length} issue{shown.length === 1 ? '' : 's'}</span>
      </div>
      <IssueGroups issues={shown} orgName={orgName} />
    </>
  )
}
