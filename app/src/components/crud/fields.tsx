// Read and edit renderers for every FieldType in the entity registry.
import { featureLabel, QUOTA_KEYS, VISIBILITY_LABEL } from '../../access/policy'
import type { Partner } from '../../domain/assets'
import type { FieldDef, Option, OptionCtx, Rec } from '../../entities/types'
import { StatusBadge } from '../ui/Badge'

export function optionsFor(f: FieldDef, draft: Rec, ctx: OptionCtx): Option[] {
  if (!f.options) return []
  return typeof f.options === 'function' ? f.options(draft, ctx) : f.options.map((v) => ({ value: v, label: v }))
}

const fmtDateTime = (v: string) =>
  new Date(v).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const fmtDate = (v: string) => new Date(`${v.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
const quotaLabel = (k: string) => QUOTA_KEYS.find((q) => q.key === k)?.label ?? k
const num = (v: number) => Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export function relativeTime(v: string) {
  const d = (Date.now() - new Date(v).getTime()) / 86_400_000
  if (d < -1) return `in ${Math.round(-d)} days`
  if (d < 0) return 'within a day'
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  return `${Math.round(d)} days ago`
}

export function LockIcon({ className = 'h-3 w-3' }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`${className} fill-current`} aria-hidden>
      <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 0 0-3 0v2Z" />
    </svg>
  )
}

export function Hidden({ f }: { f: FieldDef }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-hover px-1.5 py-0.5 text-[11px] font-medium text-ink-muted" title="Removed from the response by the field visibility rule">
      <LockIcon />
      {f.visibility ? VISIBILITY_LABEL[f.visibility] : 'Hidden'}
    </span>
  )
}

export function FieldValue({ f, rec, ctx, compact }: { f: FieldDef; rec: Rec; ctx: OptionCtx; compact?: boolean }) {
  if (!(f.key in rec)) return <Hidden f={f} />
  const v = rec[f.key]
  if (f.type === 'bool') return <>{v ? 'Yes' : 'No'}</>
  if (v == null || v === '' || (Array.isArray(v) && !v.length)) {
    if (f.type === 'money' && f.key === 'price') return <span className="text-ink-soft">Custom</span>
    // A lease without rent hasn't had its commercials captured yet (see the rent roll).
    if (f.key === 'rent' && 'lease_id' in rec) return <span className="rounded bg-warn-bg px-1.5 py-0.5 text-[11px] font-semibold text-[#7a5300]">Pending capture</span>
    return <span className="text-ink-muted">—</span>
  }
  const unit = f.unit && !compact ? <span className="ml-1 text-ink-muted">{f.unit}</span> : null
  switch (f.type) {
    case 'enum':
      return f.key === 'status' || f.key === 'stage' ? <StatusBadge status={v} /> : <>{v}</>
    case 'ref': {
      // A reference the viewer cannot resolve (outside their scope) shows as a dash, never as a raw id.
      const label = optionsFor(f, rec, ctx).find((o) => o.value === v)?.label
      return label ? <>{label}</> : <span className="text-ink-muted" title="Not visible to you">—</span>
    }
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
    case 'partners': {
      const ps = v as Partner[]
      if (compact) return <>{ps.length} partners</>
      return (
        <table className="w-full text-xs">
          <tbody>
            {ps.map((p, i) => (
              <tr key={i} className="border-b border-line-light last:border-0">
                <td className="py-1 pr-2 font-semibold">{p.name}</td>
                <td className="py-1 pr-2 text-right">{p.pct}%</td>
                <td className="py-1 text-ink-soft">{p.decision_rights}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'money':
      return (
        <>
          ₹{num(v)}
          {f.unit && f.unit !== '₹' && !compact && <span className="ml-1 text-ink-muted">{f.unit.replace('₹', '')}</span>}
        </>
      )
    case 'percent':
      return <>{num(v)}%</>
    case 'int':
    case 'decimal':
      return <>{num(v)}{unit}</>
    case 'date':
      return <>{fmtDate(v)}</>
    case 'datetime':
      return compact ? <span title={fmtDateTime(v)}>{relativeTime(v)}</span> : <>{fmtDateTime(v)}</>
    case 'email':
      return <span className="break-all">{v}</span>
    case 'file':
      return (
        <span className="inline-flex items-center gap-1 break-all text-royal">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 fill-current" aria-hidden><path d="M4 1h5l4 4v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1Zm5 1.5V5h2.5L9 2.5Z" /></svg>
          {v}
        </span>
      )
    case 'image':
      return <img src={v} alt="" className="h-10 w-14 rounded object-cover" />
    default:
      return <>{String(v)}</>
  }
}

/** Downscale an uploaded image so it fits comfortably in localStorage. */
function downscale(file: File, max = 640): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.72))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

function PartnersInput({ value, onChange, disabled }: { value: Partner[]; onChange: (v: Partner[]) => void; disabled?: boolean }) {
  const rows = value ?? []
  const set = (i: number, patch: Partial<Partner>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const total = rows.reduce((s, r) => s + (Number(r.pct) || 0), 0)
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_70px_auto] gap-2 sm:grid-cols-[1.2fr_70px_1.5fr_auto]">
          <input className="input" placeholder="Partner" value={r.name} disabled={disabled} onChange={(e) => set(i, { name: e.target.value })} />
          <input className="input" type="number" min={0} max={100} placeholder="%" value={r.pct ?? ''} disabled={disabled} onChange={(e) => set(i, { pct: Number(e.target.value) })} />
          <input className="input col-span-2 sm:col-span-1" placeholder="Decision rights" value={r.decision_rights} disabled={disabled} onChange={(e) => set(i, { decision_rights: e.target.value })} />
          <button type="button" className="btn row-start-1 col-start-3 px-2 sm:col-start-4" disabled={disabled} onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove partner">✕</button>
        </div>
      ))}
      <div className="flex items-center justify-between">
        <button type="button" className="btn" disabled={disabled} onClick={() => onChange([...rows, { name: '', pct: Math.max(0, 100 - total), decision_rights: '' }])}>+ Add partner</button>
        {rows.length > 0 && <span className={`text-xs font-semibold ${Math.abs(total - 100) < 0.01 ? 'text-ok' : 'text-warn'}`}>Total {total}%</span>}
      </div>
    </div>
  )
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
    case 'partners':
      input = <PartnersInput value={v} onChange={onChange} disabled={disabled} />
      break
    case 'bool':
      input = (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm text-ink">
          <input id={id} type="checkbox" className="h-4 w-4 accent-royal" checked={!!v} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
          {v ? 'Yes' : 'No'}
        </label>
      )
      break
    case 'int':
    case 'money':
    case 'decimal':
    case 'percent':
      input = (
        <div className="relative">
          <input
            id={id}
            type="number"
            min={0}
            max={f.type === 'percent' ? 100 : undefined}
            step={f.type === 'int' ? 1 : 'any'}
            className={`${cls} ${f.unit || f.type === 'percent' ? 'pr-20' : ''}`}
            disabled={disabled}
            value={v ?? ''}
            placeholder={f.placeholder}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
          {(f.unit || f.type === 'percent') && (
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-ink-muted">{f.type === 'percent' ? '%' : f.unit}</span>
          )}
        </div>
      )
      break
    case 'date':
      input = <input id={id} type="date" className={cls} disabled={disabled} value={v ?? ''} onChange={(e) => onChange(e.target.value || null)} />
      break
    case 'textarea':
      input = <textarea id={id} rows={3} className={cls} disabled={disabled} value={v ?? ''} onChange={(e) => onChange(e.target.value)} />
      break
    case 'file':
      input = (
        <div className="flex flex-wrap items-center gap-2">
          <label className={`btn cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
            {v ? 'Replace file' : 'Choose file'}
            <input id={id} type="file" className="sr-only" disabled={disabled} onChange={(e) => onChange(e.target.files?.[0]?.name ?? v ?? null)} />
          </label>
          {v ? <span className="break-all text-xs text-ink-soft">{v}</span> : <span className="text-xs text-ink-muted">No file — the prototype keeps the file name only.</span>}
        </div>
      )
      break
    case 'image':
      input = (
        <div className="flex items-center gap-3">
          {v ? <img src={v} alt="" className="h-20 w-28 rounded border border-line object-cover" /> : <div className="flex h-20 w-28 items-center justify-center rounded border border-dashed border-line text-[11px] text-ink-muted">No image</div>}
          <label className={`btn cursor-pointer ${disabled ? 'pointer-events-none opacity-50' : ''}`}>
            {v ? 'Replace' : 'Upload image'}
            <input
              id={id}
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={disabled}
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (file) onChange(await downscale(file))
              }}
            />
          </label>
        </div>
      )
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
        {f.visibility && f.visibility !== 'public' && (
          <span className="ml-1.5 inline-flex items-center gap-0.5 font-medium normal-case tracking-normal text-ink-muted" title="Field visibility rule">
            <LockIcon className="h-2.5 w-2.5" /> {VISIBILITY_LABEL[f.visibility]}
          </span>
        )}
      </label>
      {input}
      {error ? <p className="mt-1 text-xs font-medium text-crit">{error}</p> : f.help && <p className="mt-1 text-[11px] text-ink-muted">{f.help}</p>}
    </div>
  )
}
