import { useState } from 'react'
import type { Session } from '../access/session'
import * as api from '../data/api'
import { useApi } from '../data/useApi'
import type { ActionItem, ActionKind, ActionSeverity } from '../lib/actions'
import { daysBetween, fmtDate, todayIso } from '../lib/dates'
import { navigate } from '../state/router'
import Drawer from './ui/Drawer'

const KINDS: { key: ActionKind | 'All'; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Renewal', label: 'Renewals' },
  { key: 'Expiry', label: 'Expiries' },
  { key: 'Break', label: 'Breaks' },
  { key: 'Rent', label: 'Overdue rent' },
  { key: 'Deposit', label: 'Deposits' },
  { key: 'Escalation', label: 'Escalations' },
]

const SEVERITY: Record<ActionSeverity, { dot: string; text: string; icon: string }> = {
  Critical: { dot: 'bg-crit', text: 'text-crit', icon: '!' },
  Warning: { dot: 'bg-warn', text: 'text-[#7a5300]', icon: '◆' },
  Info: { dot: 'bg-royal', text: 'text-royal', icon: 'i' },
}

/** Right-edge "Needs action" tab: every lease follow-up in the viewer's scope, most urgent first. */
export default function NeedsAction({ session, refreshKey }: { session: Session; refreshKey: string }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<ActionKind | 'All'>('All')
  const { data } = useApi(() => api.needsAction(session), [session.user.user_id, refreshKey])
  const items = data ?? []
  if (!items.length) return null
  const critical = items.filter((i) => i.severity === 'Critical').length
  const shown = items.filter((i) => kind === 'All' || i.kind === kind)
  const leases = new Set(items.map((i) => i.link.split('/')[1])).size

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-lg border border-r-0 border-royal-dark bg-royal px-2 py-3 text-white shadow-lg transition hover:bg-royal-dark"
        aria-label={`Needs action: ${items.length} items, ${critical} critical`}
      >
        <span className="rounded-full bg-crit px-1.5 py-0.5 text-[11px] font-extrabold leading-none">{critical || items.length}</span>
        <span className="text-[12px] font-bold tracking-wide [writing-mode:vertical-rl] rotate-180">Needs action</span>
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Needs action"
        sub={`${items.length} actions across ${leases} leases · ${critical} critical`}
      >
        <div className="mb-4 flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const n = k.key === 'All' ? items.length : items.filter((i) => i.kind === k.key).length
            if (!n) return null
            const on = kind === k.key
            return (
              <button key={k.key} onClick={() => setKind(k.key)} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${on ? 'border-royal bg-royal text-white' : 'border-line bg-white text-ink-soft hover:border-royal hover:text-royal'}`}>
                {k.label}
                <span className={on ? 'text-gold' : 'text-ink-muted'}>{n}</span>
              </button>
            )
          })}
        </div>
        {(['Critical', 'Warning', 'Info'] as ActionSeverity[]).map((sev) => {
          const group = shown.filter((i) => i.severity === sev)
          if (!group.length) return null
          return (
            <section key={sev} className="mb-5">
              <h3 className={`mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider ${SEVERITY[sev].text}`}>
                <span className={`h-2 w-2 rounded-full ${SEVERITY[sev].dot}`} />
                {sev === 'Info' ? 'Heads-up' : sev} · {group.length}
              </h3>
              <ul className="space-y-2">
                {group.map((a) => (
                  <ActionRow key={a.id} a={a} go={(to) => { setOpen(false); navigate(to) }} />
                ))}
              </ul>
            </section>
          )
        })}
      </Drawer>
    </>
  )
}

function ActionRow({ a, go }: { a: ActionItem; go: (to: string) => void }) {
  const n = daysBetween(todayIso(), a.due)
  const s = SEVERITY[a.severity]
  return (
    <li className="rounded-lg border border-line bg-white p-3 hover:border-royal/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white ${s.dot}`} aria-label={a.severity}>{s.icon}</span>
            <span className="text-[13px] font-bold text-ink">{a.title}</span>
          </div>
          <div className="mt-0.5 truncate pl-6 text-[11px] font-semibold text-royal">{a.context}</div>
          <p className="mt-1 pl-6 text-[12px] text-ink-soft">{a.detail}</p>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${n < 0 ? 'bg-crit/10 text-crit' : 'bg-hover text-ink-soft'}`} title={fmtDate(a.due)}>
          {n < 0 ? `${-n}d overdue` : n === 0 ? 'Today' : `${n}d`}
        </span>
      </div>
      <div className="mt-2 pl-6">
        <button onClick={() => go(a.link)} className="btn btn-primary">{a.cta} →</button>
      </div>
    </li>
  )
}
