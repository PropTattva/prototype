import type { ReactNode } from 'react'
import { can } from '../../access/policy'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { entityDef } from '../../entities/registry'
import type { EntityKey } from '../../entities/types'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import PageHeader from '../ui/PageHeader'
import EntityTable from './EntityTable'
import RecordDrawer, { type DrawerMode } from './RecordDrawer'

interface Props {
  entity: EntityKey
  /** Route prefix, e.g. "admin/users"; the record id and "/edit" or "new" follow it */
  basePath: string
  /** Remaining route segments after basePath */
  rest: string[]
  title?: string
  subtitle?: ReactNode
  banner?: ReactNode
  linkTo: (entity: EntityKey, id: string) => string | null
  /** Customer views hide the org column/filter: everything is their own org */
  ownOrgOnly?: boolean
  embedded?: boolean
}

/** List + record drawer for one entity, driven entirely by the URL: base / base/new / base/:id / base/:id/edit. */
export default function EntityPage({ entity, basePath, rest, title, subtitle, banner, linkTo, ownOrgOnly, embedded }: Props) {
  const session = useAuthed()
  const def = entityDef(entity)
  const rows = useApi(() => api.list(entity, session), [entity, session.user.user_id])
  const ctx = useApi(() => api.getOptionCtx(session), [session.user.user_id])

  const [first, second] = rest
  const mode: DrawerMode | null = first === 'new' ? 'create' : first ? (second === 'edit' ? 'edit' : 'view') : null
  const recordId = first && first !== 'new' ? first : null
  const canCreate = can(def.capability, session.role, 'C') && !session.readOnly

  const hide = ownOrgOnly && def.orgKey ? [def.orgKey] : []

  return (
    <>
      {!embedded && (
        <PageHeader
          title={title ?? def.plural}
          subtitle={subtitle}
          right={canCreate && <button className="btn btn-gold" onClick={() => navigate(`${basePath}/new`)}>+ New {def.label.toLowerCase()}</button>}
        />
      )}
      {embedded && canCreate && (
        <div className="mb-3 flex justify-end">
          <button className="btn btn-gold" onClick={() => navigate(`${basePath}/new`)}>+ New {def.label.toLowerCase()}</button>
        </div>
      )}
      {banner}
      {rows.error ? (
        <p className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">{rows.error.message}</p>
      ) : rows.data && ctx.data ? (
        <EntityTable
          entity={entity}
          rows={rows.data}
          ctx={ctx.data}
          session={session}
          onOpen={(id) => navigate(`${basePath}/${encodeURIComponent(id)}`)}
          hideColumns={hide}
          hideFilters={hide}
        />
      ) : null}
      {mode && ctx.data && (
        <RecordDrawer
          entity={entity}
          id={recordId}
          mode={mode}
          session={session}
          ctx={ctx.data}
          linkTo={linkTo}
          defaultOrgId={ownOrgOnly ? session.org.org_id : null}
          hideFields={hide}
          onClose={() => navigate(basePath)}
          onMode={(m, id) => navigate(m === 'edit' ? `${basePath}/${encodeURIComponent(id!)}/edit` : `${basePath}/${encodeURIComponent(id!)}`)}
        />
      )}
    </>
  )
}
