// Read and edit renderers for every FieldType in the entity registry.
import { featureLabel, QUOTA_KEYS, VISIBILITY_LABEL } from '../../access/policy'
import type { FieldDef, Option, OptionCtx, Rec } from '../../entities/types'
import { StatusBadge } from '../ui/Badge'

export function optionsFor(f: FieldDef, draft: Rec, ctx: OptionCtx): Option[] {
  if (!f.options) return []
  return typeof f.options === 'function' ? f.options(draft, ctx) : f.options.map((v) => ({ value: v, label: v }))
}

const fmtDateTime = (v: string) =>
  new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDate = (v: string) => new Date(`${v}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const quotaLabel = (k: string) => QUOTA_KEYS.find((q) => q.key === k)?.label ?? k

export function relativeTime(v: string) {
  const d = (Date.now() - new Date(v).getTime()) / 86_400_000
  if (d < -1) return `in ${Math.round(-d)} days`
  if (d < 0) return 'within a day'
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  return `${Math.round(d)} days ago`
}

export function Hidden({ f }: { f: FieldDef }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-hover px-1.5 py-0.5 text-[11px] font-medium text-ink-muted" title="Removed from the response by the field visibility rule">
      <svg viewBox="0 0 16 16" className="h-3 w-3 fill-current" aria-hidden>
        <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
      </svg>
      {f.visibility ? VISIBILITY_LABEL[f.visibility] : 'Hidden'}
    </span>
  )
}

export function FieldValue({ f, rec, ctx, compact }: { f: FieldDef; rec: Rec; ctx: OptionCtx; compact?: boolean }) {
  if (!(f.key in rec)) return <Hidden f={f} />
  const v = rec[f.key]
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) {
    if (f.type === 'money') return <span className="text-ink-soft">Custom</span>
    return <span className="text-ink-muted">—</span>
  }
  switch (f.type) {
    case 'enum':
      return f.key === 'status' ? <StatusBadge status={v} /> : <>{v}</>
    case 'ref':
      return <>{optionsFor(f, rec, ctx).find((o) => o.value === v)?.label ?? v}</>
    case 'multienum':
      if (compact) return <>{v.length} selected</>
      return (
        <div className="flex flex-wrap gap-1">
          {v.map((x: string) => (
            <span key={x} className="rounded bg-royal-soft px-1.5 py-0.5 text-[11px] font-medium text-royal">{featureLabel(x)}</span>
          ))}
        </div>
      )
    case 'quotas': {
      const entries = Object.entries(v as Record<string, number | null>)
      if (!entries.length) return <span className="text-ink-muted">Unlimited</span>
      return <>{entries.map(([k, n]) => `${quotaLabel(k)}: ${n ?? 'Unlimited'}`).join(' · ')}</>
    }
    case 'money':
      return <>₹{Number(v).toLocaleString('en-IN')}</>
    case 'int':
      return <>{Number(v).toLocaleString('en-IN')}</>
    case 'date':
      return <>{fmtDate(v)}</>
    case 'datetime':
      return compact ? <span title={fmtDateTime(v)}>{relativeTime(v)}</span> : <>{fmtDateTime(v)}</>
    case 'email':
      return <span className="break-all">{v}</span>
    default:
      return <>{String(v)}</>
  }
}

export function FieldInput({ f, draft, ctx, error, disabled, onChange }: {
  f: FieldDef
  draft: Rec
  ctx: OptionCtx
  error?: string
  disabled?: boolean
  onChange: (value: unknown) => void
}) {
  const id = `f-${f.key}`
  const v = draft[f.key]
  const cls = `input ${error ? 'border-crit focus:border-crit focus:ring-crit/15' : ''}`
  let input
  switch (f.type) {
    case 'enum':
    case 'ref': {
      const opts = optionsFor(f, draft, ctx)
      const groups = [...new Set(opts.map((o) => o.group).filter(Boolean))] as string[]
      input = (
        <select id={id} className={cls} value={v ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">Select…</option>
          {groups.length
            ? groups.map((g) => (
                <optgroup key={g} label={g}>
                  {opts.filter((o) => o.group === g).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </optgroup>
              ))
            : opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )
      break
    }
    case 'multienum': {
      const opts = optionsFor(f, draft, ctx)
      const set = new Set<string>(v ?? [])
      input = (
        <div className="grid gap-1.5 sm:grid-cols-2">
          {opts.map((o) => (
            <label key={o.value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${set.has(o.value) ? 'border-royal bg-royal-soft text-royal' : 'border-line text-ink-soft'}`}>
              <input
                type="checkbox"
                className="accent-royal"
                disabled={disabled}
                checked={set.has(o.value)}
                onChange={(e) => {
                  const next = new Set(set)
                  if (e.target.checked) next.add(o.value)
                  else next.delete(o.value)
                  onChange(opts.map((x) => x.value).filter((x) => next.has(x)))
                }}
              />
              {o.label}
            </label>
          ))}
          {!opts.length && <p className="text-xs text-ink-muted">No options for this selection.</p>}
        </div>
      )
      break
    }
    case 'quotas': {
      const q: Record<string, number | null> = v ?? {}
      const keys = (f.options as readonly string[]) ?? []
      input = (
        <div className="grid gap-2 sm:grid-cols-3">
          {keys.map((k) => (
            <div key={k}>
              <span className="mb-0.5 block text-[11px] text-ink-soft">{quotaLabel(k)}</span>
              <input
                type="number"
                min={0}
                className="input"
                placeholder="Unlimited"
                disabled={disabled}
                value={q[k] ?? ''}
                onChange={(e) => {
                  const next = { ...q }
                  if (e.target.value === '') delete next[k]
                  else next[k] = Number(e.target.value)
                  onChange(next)
                }}
              />
            </div>
          ))}
        </div>
      )
      break
    }
    case 'int':
    case 'money':
      input = (
        <input
          id={id}
          type="number"
          min={0}
          step={f.type === 'int' ? 1 : 'any'}
          className={cls}
          disabled={disabled}
          value={v ?? ''}
          placeholder={f.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        />
      )
      break
    case 'date':
      input = <input id={id} type="date" className={cls} disabled={disabled} value={v ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      break
    case 'textarea':
      input = <textarea id={id} rows={3} className={cls} disabled={disabled} value={v ?? ''} onChange={(e) => onChange(e.target.value)} />
      break
    default:
      input = (
        <input
          id={id}
          type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
          className={cls}
          disabled={disabled}
          value={v ?? ''}
          placeholder={f.placeholder}
          onChange={(e) => onChange(f.key === 'plan_code' ? e.target.value.toUpperCase() : e.target.value)}
        />
      )
  }
  return (
    <div>
      <label htmlFor={id} className="label">
        {f.label}
        {f.required && <span className="text-crit"> *</span>}
      </label>
      {input}
      {error ? <p className="mt-1 text-xs font-medium text-crit">{error}</p> : f.help && <p className="mt-1 text-[11px] text-ink-muted">{f.help}</p>}
    </div>
  )
}
