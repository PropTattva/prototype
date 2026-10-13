import { useMemo, useState } from 'react'
import type { Session } from '../../access/session'
import { exportCsv } from '../../data/api'
import { entityDef } from '../../entities/registry'
import type { EntityKey, OptionCtx, Rec } from '../../entities/types'
import { useToast } from '../ui/Toast'
import { FieldValue, optionsFor } from './fields'

const PAGE = 15

interface Props {
  entity: EntityKey
  rows: Rec[]
  ctx: OptionCtx
  session: Session
  onOpen: (id: string) => void
  hideColumns?: string[]
  /** Extra filter keys hidden for this viewer (e.g. org filter for customers) */
  hideFilters?: string[]
  emptyText?: string
}

/** Search + enum filters + sortable columns + paging + CSV export, all driven by the entity definition. */
export default function EntityTable({ entity, rows, ctx, session, onOpen, hideColumns = [], hideFilters = [], emptyText }: Props) {
  const def = entityDef(entity)
  const toast = useToast()
  const [q, setQ] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const [page, setPage] = useState(0)

  const columns = def.fields.filter((f) => f.column && !hideColumns.includes(f.key))
  const filterDefs = (def.filters ?? []).filter((k) => !hideFilters.includes(k)).map((k) => def.fields.find((f) => f.key === k)!)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    let out = rows.filter(
      (r) =>
        (!needle || def.searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(needle))) &&
        Object.entries(filters).every(([k, v]) => !v || r[k] === v),
    )
    if (sort) {
      out = [...out].sort((a, b) => {
        const x = a[sort.key] ?? ''
        const y = b[sort.key] ?? ''
        return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.dir
      })
    }
    return out
  }, [rows, q, filters, sort, def.searchKeys])

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE))
  const current = Math.min(page, pages - 1)
  const visible = filtered.slice(current * PAGE, current * PAGE + PAGE)

  const download = async () => {
    try {
      const csv = await exportCsv(entity, filtered, session)
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      a.download = `${def.plural.toLowerCase()}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      toast('info', `Exported ${filtered.length} ${def.plural.toLowerCase()} — logged in the audit trail.`)
    } catch (e) {
      toast('error', (e as Error).message)
    }
  }

  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
        <div className="relative min-w-[180px] flex-1">
          <svg viewBox="0 0 20 20" className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 fill-ink-muted" aria-hidden>
            <path d="M8.5 3a5.5 5.5 0 0 1 4.4 8.8l3.6 3.7-1 1-3.7-3.6A5.5 5.5 0 1 1 8.5 3Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
          </svg>
          <input
            className="input pl-8"
            placeholder={`Search ${def.searchKeys.map((k) => def.fields.find((f) => f.key === k)?.label.toLowerCase() ?? k).join(', ')}`}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setPage(0)
            }}
          />
        </div>
        {filterDefs.map((f) => {
          const opts = optionsFor(f, {}, ctx).filter((o) => rows.some((r) => r[f.key] === o.value))
          return (
            <select
              key={f.key}
              aria-label={f.label}
              className="input w-auto max-w-[200px]"
              value={filters[f.key] ?? ''}
              onChange={(e) => {
                setFilters((x) => ({ ...x, [f.key]: e.target.value }))
                setPage(0)
              }}
            >
              <option value="">Any {f.label.toLowerCase()}</option>
              {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )
        })}
        <button className="btn" onClick={download} title="Download as CSV (audited)">Export</button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-line bg-canvas text-left">
              {columns.map((c) => (
                <th key={c.key} className="px-3 py-2.5 first:pl-4">
                  <button
                    className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted hover:text-royal"
                    onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 1 ? { key: c.key, dir: -1 } : null) : { key: c.key, dir: 1 }))}
                  >
                    {c.label}
                    <span className="text-royal">{sort?.key === c.key ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr
                key={r[def.idKey]}
                tabIndex={0}
                onClick={() => onOpen(r[def.idKey])}
                onKeyDown={(e) => e.key === 'Enter' && onOpen(r[def.idKey])}
                className="cursor-pointer border-b border-line-light last:border-0 hover:bg-hover focus:bg-hover focus:outline-none"
              >
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-3 py-2.5 first:pl-4 ${i === 0 ? 'font-semibold text-ink' : 'text-ink-soft'}`}>
                    <FieldValue f={c} rec={r} ctx={ctx} compact />
                  </td>
                ))}
              </tr>
            ))}
            {!visible.length && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-ink-muted">
                  {rows.length ? 'No records match these filters.' : emptyText ?? `No ${def.plural.toLowerCase()} yet.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-line px-4 py-2 text-xs text-ink-muted">
        <span>
          {filtered.length} of {rows.length} {def.plural.toLowerCase()}
        </span>
        {pages > 1 && (
          <div className="flex items-center gap-2">
            <button className="btn px-2 py-1" disabled={current === 0} onClick={() => setPage(current - 1)}>‹</button>
            <span>{current + 1} / {pages}</span>
            <button className="btn px-2 py-1" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}>›</button>
          </div>
        )}
      </div>
    </div>
  )
}
