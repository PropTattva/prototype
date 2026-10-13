import type { ReactNode } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { entityDef } from '../../entities/registry'
import type { EntityKey, Rec } from '../../entities/types'
import { navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import PageHeader from '../ui/PageHeader'
import UpgradeGate from '../ui/UpgradeGate'
import EntityTable from './EntityTable'
import RecordDrawer, { type DrawerMode, type LinkTo } from './RecordDrawer'

interface Props {
  entity: EntityKey
  /** Route prefix, e.g. "admin/users"; the record id and "/edit" or "new" follow it */
  basePath: string
  /** Remaining route segments after basePath */
  rest: string[]
  title?: string
  subtitle?: ReactNode
  banner?: ReactNode
  linkTo: LinkTo
  /** Customer views hide the org column/filter: everything is their own org */
  ownOrgOnly?: boolean
  /** Embedded in another page (no page header) */
  embedded?: boolean
  /** Parent filter, e.g. { building_id } on a building tab — also preset on create */
  where?: Record<string, string>
  /** Open a full page instead of the drawer for a row (e.g. buildings, leases) */
  rowHref?: (row: Rec) => string
  /** Custom create flow (e.g. a wizard) instead of the drawer form */
  onNew?: () => void
  newLabel?: string
  hideColumns?: string[]
  /** Client-side row filter applied after the api (e.g. category in the vault) */
  filter?: (row: Rec) => boolean
  emptyText?: string
}

/** List + record drawer for one entity, driven entirely by the URL: base / base/new / base/:id / base/:id/edit. */
export default function EntityPage(props: Props) {
  const { entity, basePath, rest, title, subtitle, banner, linkTo, ownOrgOnly, embedded, where, rowHref, onNew, newLabel, hideColumns = [], filter, emptyText } = props
  const session = useAuthed()
  const def = entityDef(entity)
  const perms = api.permissions(entity, session)
  const whereKey = JSON.stringify(where ?? {})
  const rows = useApi(() => api.list(entity, session, where), [entity, session.user.user_id, whereKey])
  const ctx = useApi(() => api.getOptionCtx(session), [session.user.user_id])

  if (def.feature && !api.hasFeature(session, def.feature)) return <UpgradeGate session={session} feature={def.feature} />

  const [first, second] = rest
  const mode: DrawerMode | null = first === 'new' ? 'create' : first ? (second === 'edit' ? 'edit' : 'view') : null
  const recordId = first && first !== 'new' ? first : null

  const hide = [...hideColumns, ...(ownOrgOnly && def.orgKey ? [def.orgKey] : []), ...Object.keys(where ?? {})]
  const newButton = perms.create && (
    <button className="btn btn-gold" onClick={() => (onNew ? onNew() : navigate(`${basePath}/new`))}>
      + {newLabel ?? `New ${def.label.toLowerCase()}`}
    </button>
  )
  const data = rows.data && filter ? rows.data.filter(filter) : rows.data

  return (
    <>
      {!embedded && <PageHeader title={title ?? def.plural} subtitle={subtitle} right={newButton} />}
      {embedded && newButton && <div className="mb-3 flex justify-end">{newButton}</div>}
      {banner}
      {rows.error ? (
        <p className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">{rows.error.message}</p>
      ) : data && ctx.data ? (
        <EntityTable
          entity={entity}
          rows={data}
          ctx={ctx.data}
          session={session}
          onOpen={(id) => {
            const row = data.find((r) => r[def.idKey] === id)!
            navigate(rowHref ? rowHref(row).replace(/^#\//, '') : `${basePath}/${encodeURIComponent(id)}`)
          }}
          hideColumns={hide}
          hideFilters={hide}
          emptyText={emptyText}
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
          presets={where}
          hideFields={ownOrgOnly && def.orgKey ? [def.orgKey] : []}
          onClose={() => navigate(basePath)}
          onMode={(m, id) => navigate(m === 'edit' ? `${basePath}/${encodeURIComponent(id!)}/edit` : `${basePath}/${encodeURIComponent(id!)}`)}
        />
      )}
    </>
  )
}
