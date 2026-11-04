import { useState } from 'react'
import * as api from '../../data/api'
import type { PicklistKey } from '../../domain/crm'
import { DEFAULT_PICKLISTS, PICKLISTS } from '../../lib/crm'
import { href } from '../../state/router'
import Card from '../../components/ui/Card'
import PageHeader from '../../components/ui/PageHeader'
import { useToast } from '../../components/ui/Toast'
import type { CrmCtx } from './shared'

/** Where each dropdown's value is used, to show counts before renaming or retiring. */
function usage(c: CrmCtx, org: string, key: PicklistKey, value: string) {
  const accounts = c.book.accounts.filter((a) => a.org_id === org)
  const activities = c.book.activities.filter((a) => a.org_id === org)
  switch (key) {
    case 'record_type':
      return accounts.filter((a) => a.record_type === value).length + activities.filter((a) => a.record_type === value).length
    case 'relationship_type':
      return accounts.filter((a) => a.relationship_type === value).length
    case 'meeting_medium':
      return activities.filter((a) => a.medium === value).length
    case 'meeting_purpose':
      return activities.filter((a) => a.purpose === value).length
    case 'next_action':
      return activities.filter((a) => a.next_action === value).length
  }
}

/** The org's CRM dropdowns: add, rename (updates every record) or retire values. */
export default function Settings({ c }: { c: CrmCtx }) {
  const [org, setOrg] = useState(c.defaultOrg)
  return (
    <>
      <a href={href('crm/activities')} className="mb-2 inline-block text-[12px] font-semibold text-royal hover:underline">← CRM</a>
      <PageHeader title="Dropdown values" subtitle={`Values for ${c.orgName(org)}. Added values are offered to everyone in that organisation; other organisations keep their own lists.`} />
      {c.multiOrg && (
        <div className="mb-4 flex items-center gap-2">
          <label className="label mb-0" htmlFor="s-org">Organisation</label>
          <select id="s-org" className="input w-auto" value={org} onChange={(e) => setOrg(e.target.value)}>
            {c.book.orgs.map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {PICKLISTS.map((p) => <ListCard key={`${org}-${p.key}`} c={c} org={org} list={p.key} label={p.label} help={p.help} />)}
      </div>
    </>
  )
}

function ListCard({ c, org, list, label, help }: { c: CrmCtx; org: string; list: PicklistKey; label: string; help: string }) {
  const toast = useToast()
  const values = c.listsOf(org)[list]
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<{ from: string; to: string } | null>(null)
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try {
      await fn()
      toast('ok', ok)
      return true
    } catch (e) {
      toast('error', (e as Error).message)
      return false
    }
  }
  const add = async () => {
    if (await run(() => api.addPicklistValue(list, text, c.session, org), `“${text.trim()}” added to ${label}.`)) setText('')
  }

  return (
    <Card title={label} sub={help}>
      <ul className="divide-y divide-line-light">
        {values.map((v) => {
          const n = usage(c, org, list, v.value)
          const custom = !DEFAULT_PICKLISTS[list].includes(v.value)
          return (
            <li key={v.value} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
              {editing?.from === v.value ? (
                <form
                  className="flex flex-1 gap-1.5"
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (await run(() => api.renamePicklistValue(list, v.value, editing!.to, c.session, org), `Renamed to “${editing!.to.trim()}” on ${n} record${n === 1 ? '' : 's'}.`)) setEditing(null)
                  }}
                >
                  <input autoFocus aria-label={`Rename ${v.value}`} className="input py-1" value={editing.to} maxLength={40} onChange={(e) => setEditing({ ...editing, to: e.target.value })} />
                  <button className="btn btn-primary py-1 text-[11px]" disabled={!editing.to.trim()}>Save</button>
                  <button type="button" className="btn py-1 text-[11px]" onClick={() => setEditing(null)}>Cancel</button>
                </form>
              ) : (
                <>
                  <span className={`text-[13px] ${v.active ? 'font-semibold text-ink' : 'text-ink-muted line-through'}`}>
                    {v.value}
                    {custom && <span className="ml-1.5 rounded bg-gold-light px-1 text-[10px] font-bold text-gold-dark no-underline">added</span>}
                    <span className="ml-1.5 text-[11px] font-normal text-ink-muted">{n} in use</span>
                  </span>
                  {c.canWrite && (
                    <span className="flex gap-1.5">
                      {v.active && <button className="btn py-0.5 text-[11px]" onClick={() => setEditing({ from: v.value, to: v.value })}>Rename</button>}
                      <button
                        className="btn py-0.5 text-[11px]"
                        title={v.active ? 'Stop offering this value; existing records keep it' : 'Offer this value again'}
                        onClick={() => run(() => api.setPicklistValueActive(list, v.value, !v.active, c.session, org), v.active ? `“${v.value}” retired.` : `“${v.value}” restored.`)}
                      >
                        {v.active ? 'Retire' : 'Restore'}
                      </button>
                    </span>
                  )}
                </>
              )}
            </li>
          )
        })}
      </ul>
      {c.canWrite && (
        <form
          className="mt-3 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            if (text.trim()) add()
          }}
        >
          <input aria-label={`New ${label} value`} className="input" placeholder={`Add a ${label.toLowerCase()}`} value={text} maxLength={40} onChange={(e) => setText(e.target.value)} />
          <button className="btn btn-primary" disabled={!text.trim()}>Add</button>
        </form>
      )}
    </Card>
  )
}
