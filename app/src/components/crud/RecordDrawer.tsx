import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import { ApiError } from '../../data/api'
import { useApi } from '../../data/useApi'
import { entityDef } from '../../entities/registry'
import type { EntityKey, OptionCtx, Rec } from '../../entities/types'
import { href } from '../../state/router'
import Drawer from '../ui/Drawer'
import Modal from '../ui/Modal'
import { useToast } from '../ui/Toast'
import { FieldInput, FieldValue } from './fields'

export type DrawerMode = 'view' | 'edit' | 'create'

export type LinkTo = (entity: EntityKey, id: string) => string | null

interface Props {
  entity: EntityKey
  id: string | null
  mode: DrawerMode
  session: Session
  ctx: OptionCtx
  onClose: () => void
  onMode: (mode: DrawerMode, id?: string) => void
  /** Where related records link to, or null if the viewer has no page for them */
  linkTo: LinkTo
  /** Org to pre-fill on create (customers are always forced to their own org by the api) */
  defaultOrgId: string | null
  /** Values fixed by the context (e.g. building_id on a building tab): prefilled and not shown in the form */
  presets?: Rec
  hideFields?: string[]
  /** Extra content under the fields in view mode */
  extra?: (rec: Rec) => ReactNode
}

/** Shared handler: plan / quota problems open an upgrade dialog, validation highlights fields, the rest toast. */
export function useErrorHandler(session: Session) {
  const toast = useToast()
  const [dialog, setDialog] = useState<ReactNode>(null)
  const handle = (e: unknown, setErrors?: (e: Record<string, string>) => void) => {
    if (e instanceof ApiError && (e.code === 'QUOTA' || e.code === 'PLAN')) {
      setDialog(
        <Modal
          tone="crit"
          title={e.code === 'PLAN' ? 'Not in your plan' : 'Upgrade needed'}
          onClose={() => setDialog(null)}
          actions={
            <>
              <button className="btn" onClick={() => setDialog(null)}>Close</button>
              {session.role !== 'Super Admin' && <a className="btn btn-gold" href={href('subscription')}>View plans</a>}
            </>
          }
        >
          {e.message}
        </Modal>,
      )
    } else if (e instanceof ApiError && e.code === 'VALIDATION' && setErrors) {
      setErrors(e.fieldErrors)
      toast('error', e.message)
    } else {
      toast('error', (e as Error).message)
    }
  }
  return { dialog, setDialog, handle }
}

export default function RecordDrawer(props: Props) {
  const { entity, id, mode, session, ctx, onClose, onMode, linkTo, defaultOrgId, presets = {}, hideFields = [], extra } = props
  const def = entityDef(entity)
  const toast = useToast()
  const perms = api.permissions(entity, session)
  const record = useApi(() => (id ? api.get(entity, id, session) : Promise.resolve(null)), [entity, id, session.user.user_id])
  const { dialog, setDialog, handle } = useErrorHandler(session)

  const [draft, setDraft] = useState<Rec>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setErrors({})
    if (mode === 'create') setDraft({ ...(def.defaults?.({ ...ctx, orgId: defaultOrgId }) ?? {}), ...presets })
    else if (record.data) setDraft(structuredClone(record.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, record.data, entity])

  const rec = mode === 'create' ? draft : record.data
  if (mode !== 'create' && record.error) {
    return (
      <Drawer open onClose={onClose} title={`${def.label} not available`}>
        <p className="text-sm text-ink-soft">{record.error.message}</p>
      </Drawer>
    )
  }
  if (!rec) return null

  const hidden = new Set([...hideFields, ...Object.keys(presets)])
  const fields = def.fields.filter((f) => !hidden.has(f.key) && (!f.showIf || f.showIf(mode === 'view' ? rec : draft)))

  const save = async () => {
    setSaving(true)
    setErrors({})
    try {
      if (mode === 'create') {
        const created = await api.create(entity, draft, session)
        toast('ok', `${def.label} created.`)
        onMode('view', created[def.idKey])
      } else {
        await api.update(entity, id!, draft, session)
        toast('ok', 'Changes saved.')
        onMode('view', id!)
      }
    } catch (e) {
      handle(e, setErrors)
    } finally {
      setSaving(false)
    }
  }

  const askDelete = async () => {
    const blockers = await api.deleteBlockers(entity, id!, session)
    if (blockers.length) {
      setDialog(
        <Modal tone="crit" title={`Can’t delete this ${def.label.toLowerCase()}`} onClose={() => setDialog(null)} actions={<button className="btn btn-primary" onClick={() => setDialog(null)}>Got it</button>}>
          It is still referenced by <strong className="text-ink">{blockers.join(', ')}</strong>.
          {def.deleteHint && <div className="mt-3 rounded-md bg-royal-soft px-3 py-2 text-royal">{def.deleteHint}</div>}
        </Modal>,
      )
      return
    }
    setDialog(
      <Modal
        tone="crit"
        title={`Delete ${def.title(rec, ctx)}?`}
        onClose={() => setDialog(null)}
        actions={
          <>
            <button className="btn" onClick={() => setDialog(null)}>Cancel</button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                try {
                  await api.remove(entity, id!, session)
                  toast('ok', `${def.label} deleted.`)
                  setDialog(null)
                  onClose()
                } catch (e) {
                  setDialog(null)
                  handle(e)
                }
              }}
            >
              Delete
            </button>
          </>
        }
      >
        This permanently removes the record. The deletion is kept in the audit log with the full record.
      </Modal>,
    )
  }

  const run = (fn: () => Promise<unknown>, okText: string) => async () => {
    try {
      await fn()
      toast('ok', okText)
    } catch (e) {
      handle(e)
    }
  }

  const inviteActions = entity === 'invite' && mode === 'view' && perms.update && (
    <>
      {rec.status === 'Pending' && (
        <>
          <button className="btn" onClick={run(() => api.revokeInvite(id!, session), 'Invite revoked.')}>Revoke</button>
          <button
            className="btn"
            onClick={() =>
              setDialog(
                <AcceptDialog
                  email={rec.email}
                  onClose={() => setDialog(null)}
                  onAccept={async (name) => {
                    try {
                      await api.acceptInvite(id!, session, name)
                      toast('ok', `${name} joined — seat consumed.`)
                      setDialog(null)
                    } catch (e) {
                      handle(e)
                    }
                  }}
                />,
              )
            }
          >
            Simulate accept
          </button>
        </>
      )}
      {(rec.status === 'Pending' || rec.status === 'Expired' || rec.status === 'Revoked') && (
        <button className="btn" onClick={run(() => api.resendInvite(id!, session), 'Invite re-sent with a fresh 7-day link.')}>Resend</button>
      )}
    </>
  )

  const footer =
    mode === 'view' ? (
      <>
        {inviteActions}
        {perms.remove && <button className="btn mr-auto text-crit hover:border-crit hover:text-crit" onClick={askDelete}>Delete</button>}
        {perms.update && entity !== 'invite' && <button className="btn btn-primary" onClick={() => onMode('edit', id!)}>Edit</button>}
        {def.immutable && <span className="mr-auto text-[11px] text-ink-muted">Immutable record — cannot be edited or deleted.</span>}
      </>
    ) : (
      <>
        <button className="btn" onClick={() => (mode === 'create' ? onClose() : onMode('view', id!))}>Cancel</button>
        <button className="btn btn-gold" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : mode === 'create' ? `Create ${def.label.toLowerCase()}` : 'Save changes'}
        </button>
      </>
    )

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        title={mode === 'create' ? `New ${def.label.toLowerCase()}` : def.title(rec, ctx)}
        sub={mode === 'create' ? null : def.subtitle?.(rec, ctx)}
        footer={footer}
      >
        {session.readOnly && mode === 'view' && <p className="mb-4 rounded-md bg-gold-light px-3 py-2 text-xs text-royal-dark">Read-only: you are using View as.</p>}
        {mode === 'view' ? (
          <>
            {rec.data_url && <img src={rec.data_url} alt={rec.caption ?? ''} className="mb-4 max-h-64 w-full rounded-md border border-line object-cover" />}
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {fields
                .filter((f) => !f.hideInDetail)
                .map((f) => (
                  <div key={f.key} className={['multienum', 'quotas', 'partners', 'textarea'].includes(f.type) ? 'sm:col-span-2' : ''}>
                    <dt className="label">{f.label}</dt>
                    <dd className="whitespace-pre-line text-sm text-ink">
                      <FieldValue f={f} rec={rec} ctx={ctx} />
                    </dd>
                  </div>
                ))}
            </dl>
            {extra?.(rec)}
            {def.related?.map((r) => <Related key={r.entity + r.foreignKey} {...r} value={rec[def.idKey]} session={session} ctx={ctx} linkTo={linkTo} />)}
          </>
        ) : (
          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            {fields
              .filter((f) => !f.system)
              .map((f) => (
                <FieldInput
                  key={f.key}
                  f={f}
                  draft={draft}
                  ctx={ctx}
                  error={errors[f.key]}
                  disabled={(f.createOnly && mode === 'edit') || (f.adminOnly && session.role !== 'Super Admin')}
                  onChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                />
              ))}
            <button type="submit" className="hidden" />
          </form>
        )}
      </Drawer>
      {dialog}
    </>
  )
}

function Related({ entity, foreignKey, title, value, session, ctx, linkTo }: {
  entity: EntityKey
  foreignKey: string
  title: string
  value: string
  session: Session
  ctx: OptionCtx
  linkTo: LinkTo
}) {
  const def = entityDef(entity)
  const perms = api.permissions(entity, session)
  const { data } = useApi(() => (perms.read ? api.list(entity, session, { [foreignKey]: value }) : Promise.resolve([])), [entity, value, session.user.user_id])
  if (!perms.read) return null
  const rows = data ?? []
  const statusField = def.fields.find((f) => f.key === 'status' || f.key === 'stage')
  return (
    <section className="mt-6">
      <h4 className="mb-2 flex items-center justify-between border-b border-line pb-1.5 text-xs font-extrabold uppercase tracking-wider text-royal">
        {title}
        <span className="rounded-full bg-royal-soft px-2 text-[10px]">{rows.length}</span>
      </h4>
      {rows.length ? (
        <ul className="divide-y divide-line-light">
          {rows.slice(0, 50).map((r) => {
            const to = linkTo(entity, r[def.idKey])
            const body = (
              <>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{def.title(r, ctx)}</span>
                  {def.subtitle && <span className="block truncate text-[11px] text-ink-muted">{def.subtitle(r, ctx)}</span>}
                </span>
                {statusField && <FieldValue f={statusField} rec={r} ctx={ctx} />}
              </>
            )
            return (
              <li key={r[def.idKey]}>
                {to ? (
                  <a href={to} className="flex items-center justify-between gap-3 px-1 py-2 text-[13px] hover:bg-hover">{body}</a>
                ) : (
                  <div className="flex items-center justify-between gap-3 px-1 py-2 text-[13px]">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="py-2 text-xs text-ink-muted">None.</p>
      )}
    </section>
  )
}

function AcceptDialog({ email, onClose, onAccept }: { email: string; onClose: () => void; onAccept: (name: string) => void }) {
  const [name, setName] = useState('')
  return (
    <Modal
      title="Simulate invite acceptance"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-gold" disabled={!name.trim()} onClick={() => onAccept(name)}>Accept invite</button>
        </>
      }
    >
      <p className="mb-3">
        Stands in for <strong className="text-ink">{email}</strong> clicking the emailed link. Accepting creates the user with the invited role.
      </p>
      <label className="label" htmlFor="accept-name">Full name</label>
      <input id="accept-name" className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
    </Modal>
  )
}
