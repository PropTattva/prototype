import { useState } from 'react'
import type { Session } from '../../access/session'
import * as api from '../../data/api'
import type { PicklistKey, PicklistValue } from '../../domain/crm'
import { useToast } from '../ui/Toast'

const ADD = '__add__'

/** A CRM dropdown whose last option adds a new value to the org's list, right where it's needed. */
export default function PicklistSelect({ id, list, values, value, onChange, session, orgId, placeholder = 'Choose…', invalid, disabled }: {
  id: string
  list: PicklistKey
  values: PicklistValue[]
  value: string
  onChange: (v: string) => void
  session: Session
  /** Org whose list gets the new value (platform admin working in another org) */
  orgId?: string
  placeholder?: string
  invalid?: boolean
  disabled?: boolean
}) {
  const toast = useToast()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const active = values.filter((v) => v.active)
  const retired = value && !active.some((v) => v.value === value)

  const save = async () => {
    setBusy(true)
    try {
      const v = await api.addPicklistValue(list, text, session, orgId)
      onChange(v)
      setAdding(false)
      setText('')
      toast('ok', `“${v}” added — available to everyone in ${orgId && orgId !== session.org.org_id ? 'that' : 'your'} organisation.`)
    } catch (e) {
      toast('error', (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (adding)
    return (
      <div className="flex gap-1.5">
        <input
          id={id}
          autoFocus
          className="input"
          placeholder="New value"
          value={text}
          maxLength={40}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (text.trim()) save()
            }
            if (e.key === 'Escape') setAdding(false)
          }}
        />
        <button type="button" className="btn btn-primary" disabled={!text.trim() || busy} onClick={save}>Add</button>
        <button type="button" className="btn" onClick={() => setAdding(false)}>Cancel</button>
      </div>
    )

  return (
    <select
      id={id}
      className={`input ${invalid ? 'border-crit' : ''}`}
      value={value}
      disabled={disabled}
      onChange={(e) => (e.target.value === ADD ? setAdding(true) : onChange(e.target.value))}
    >
      <option value="">{placeholder}</option>
      {active.map((v) => <option key={v.value} value={v.value}>{v.value}</option>)}
      {retired && <option value={value}>{value} (retired)</option>}
      {!session.readOnly && <option value={ADD}>+ Add value…</option>}
    </select>
  )
}
