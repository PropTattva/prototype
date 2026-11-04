import { useState } from 'react'
import type { HealthArea, HealthIssue } from '../../lib/platformHealth'
import type { ActionSeverity } from '../../lib/actions'
import { href } from '../../state/router'

export const SEV: Record<ActionSeverity, { dot: string; text: string; label: string }> = {
  Critical: { dot: 'bg-crit', text: 'text-crit', label: 'Critical' },
  Warning: { dot: 'bg-warn', text: 'text-[#7a5300]', label: 'Warning' },
  Info: { dot: 'bg-royal', text: 'text-royal', label: 'Heads-up' },
}

/** Issues grouped by the check that raised them, each group collapsible, each item linking to its fix. */
export default function IssueGroups({ issues, orgName, showOrg = true, limit = 6 }: { issues: HealthIssue[]; orgName: (id: string | null) => string; showOrg?: boolean; limit?: number }) {
  const [open, setOpen] = useState<Record<string, boolean>>({})
  if (!issues.length) return <p className="py-8 text-center text-[13px] text-ok">No issues — all clear.</p>
  const groups: [string, HealthIssue[]][] = []
  for (const i of issues) {
    const g = groups.find(([k]) => k === i.check)
    if (g) g[1].push(i)
    else groups.push([i.check, [i]])
  }
  return (
    <div className="space-y-2.5">
      {groups.map(([check, list]) => {
        const sev = SEV[list[0].severity]
        const expanded = open[check]
        const shown = expanded ? list : list.slice(0, limit)
        return (
          <section key={check} className="rounded-lg border border-line bg-white">
            <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line-light px-3.5 py-2.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${sev.dot}`} aria-hidden="true" />
                <span className="text-[13px] font-bold text-ink">{check}</span>
                <span className="rounded-full bg-hover px-2 text-[11px] font-bold text-ink-soft">{list.length}</span>
              </div>
              <span className={`text-[10px] font-bold uppercase tracking-wider ${sev.text}`}>{sev.label} · {list[0].area}</span>
            </header>
            <ul className="divide-y divide-line-light">
              {shown.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2">
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold text-ink">{i.label}</div>
                    <div className="text-[11px] text-ink-muted">
                      {showOrg && i.org_id && orgName(i.org_id) !== i.label && <><a className="font-semibold text-royal hover:underline" href={href(`admin/organisations/${i.org_id}`)}>{orgName(i.org_id)}</a> · </>}
                      {showOrg && !i.org_id && <span className="font-semibold text-ink-soft">Master data · </span>}
                      {i.detail}
                    </div>
                  </div>
                  <a className="btn shrink-0 py-1 text-[11px]" href={href(i.link)}>{i.cta} →</a>
                </li>
              ))}
            </ul>
            {list.length > limit && (
              <button className="w-full border-t border-line-light py-1.5 text-[11px] font-semibold text-royal hover:bg-hover" onClick={() => setOpen({ ...open, [check]: !expanded })}>
                {expanded ? 'Show fewer' : `Show all ${list.length}`}
              </button>
            )}
          </section>
        )
      })}
    </div>
  )
}

export const AREAS: HealthArea[] = ['Billing', 'Account', 'Data']
