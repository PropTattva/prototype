import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { Lease } from '../../domain/leasing'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'
import { ViewToggle } from '../../components/drill/Drill'
import { leaseFilter, LeaseViewPills, type LeaseView } from './LeaseViews'

/** E3-S01: the lease register per asset, with the expiry and break views that drive renewals. */
export default function Leases({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const [view, setView] = useState<LeaseView>('all')
  const { data: all } = useApi(() => api.list('lease', session), [session.user.user_id])
  const leases = (all as Lease[] | undefined) ?? []
  const active = leases.filter((l) => l.status === 'Active')
  const rentRoll = active.filter((l) => l.rent != null).reduce((s, l) => s + l.rent! * l.area * 12, 0)

  return (
    <EntityPage
      entity="lease"
      basePath="leases"
      rest={rest}
      title="Leases"
      subtitle={rentRoll ? `Annual rent roll ₹${(rentRoll / 1e7).toFixed(1)} Cr across ${active.length} active leases` : 'The lease register across your assets'}
      linkTo={linkFor(session)}
      ownOrgOnly={session.role === 'Owner/Developer'}
      rowHref={(r) => href(`leases/${r.lease_id}`)}
      onNew={() => navigate('leases/new')}
      filter={(r) => leaseFilter(view)(r as Lease)}
      banner={
        <>
          <div className="mb-3 flex justify-end"><ViewToggle module="leases" v2={false} /></div>
          <LeaseViewPills leases={leases} view={view} onChange={setView} />
        </>
      }
    />
  )
}
