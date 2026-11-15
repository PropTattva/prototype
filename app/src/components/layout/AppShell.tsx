import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { hasFeature, listSignInDirectory, resetDemoData } from '../../data/api'
import { useApi } from '../../data/useApi'
import { href, useRoute } from '../../state/router'
import { useAuthed, useSession } from '../../state/SessionContext'
import PtMark from '../ui/PtMark'
import NeedsAction from '../NeedsAction'
import { LockIcon } from '../crud/fields'
import { useToast } from '../ui/Toast'
import { navFor } from './nav'

const TAG: Record<string, string> = {
  'Super Admin': 'INTERNAL · ADMIN',
  AA: 'INTERNAL · AA',
  'Owner/Developer': 'OWNER',
  Occupier: 'OCCUPIER',
  Enabler: 'DIRECT',
}
const initials = (name: string) => name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()

export default function AppShell({ children }: { children: ReactNode }) {
  const session = useAuthed()
  const { exitViewAs } = useSession()
  const route = useRoute().join('/')
  const sections = navFor(session)
  const active = (path: string) => route === path || (route.startsWith(`${path}/`) && path !== 'admin')
  // The menu item this page belongs to; a new one opens at the top (record drawers keep the list's scroll).
  const section = sections.flatMap((s) => s.items).filter((i) => active(i.path)).sort((a, b) => b.path.length - a.path.length)[0]?.path ?? route
  useEffect(() => {
    window.scrollTo(0, 0)
    // Bring the highlighted menu item into view if it is hidden (e.g. after a reload or a shared link);
    // a click from the menu leaves the sidebar where it is.
    const item = document.querySelector('aside [aria-current="page"]')
    const box = item?.closest('aside')?.getBoundingClientRect()
    const r = item?.getBoundingClientRect()
    if (item && box && r && (r.top < box.top || r.bottom > box.bottom)) item.scrollIntoView({ block: 'center' })
  }, [section])
  // The sidebar sticks below the top bar, whose height grows with the View-as banner.
  const top = useRef<HTMLDivElement>(null)
  const [topH, setTopH] = useState(56)
  useEffect(() => {
    if (!top.current) return
    const ro = new ResizeObserver(([e]) => setTopH(e.target.getBoundingClientRect().height))
    ro.observe(top.current)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="min-h-screen" style={{ '--shell-top': `${topH}px` } as CSSProperties}>
      <div ref={top} className="sticky top-0 z-40">
        {session.readOnly && (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-gold px-4 py-1.5 text-center text-xs font-semibold text-white">
            <span>
              Viewing as <strong>{session.user.name}</strong> ({session.role}, {session.org.name}) — read-only. Signed in as {session.actor.name}.
            </span>
            <button onClick={exitViewAs} className="rounded bg-royal-dark px-2 py-0.5 text-[11px] text-white hover:bg-royal">Exit View as</button>
          </div>
        )}
        <header className="flex items-center justify-between gap-3 border-b-2 border-gold bg-white px-4 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <PtMark />
            <span className="hidden border-l border-line pl-3 text-[13px] font-semibold text-ink-muted sm:inline">Platform</span>
            <span className="hidden rounded-[3px] bg-royal px-2 py-[3px] font-mono text-[10px] font-semibold text-white sm:inline">{TAG[session.role]}</span>
            {session.plan && <span className="hidden rounded-[3px] bg-gold px-2 py-[3px] text-[10px] font-bold text-white md:inline">{session.plan.name}</span>}
          </div>
          <UserMenu />
        </header>
      </div>

      <div className="grid md:grid-cols-[220px_1fr]">
        <aside className="min-w-0 border-b border-line bg-white md:sticky md:top-[var(--shell-top)] md:h-[calc(100vh-var(--shell-top))] md:self-start md:overflow-y-auto md:overscroll-contain md:border-b-0 md:border-r md:px-3 md:py-5">
          <nav className="flex gap-1 overflow-x-auto px-3 py-2 md:block md:px-0 md:py-0">
            {sections.map((s) => (
              <div key={s.title} className="contents md:block">
                <div className="hidden px-3 pb-2 pt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-ink-muted md:mt-3.5 md:block md:first:mt-0">{s.title}</div>
                {s.items.map((i) => (
                  <a
                    key={i.path}
                    href={href(i.path)}
                    onClick={() => window.scrollTo(0, 0)}
                    aria-current={i.path === section ? 'page' : undefined}
                    className={`mb-0.5 flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-[13px] font-medium ${
                      active(i.path) ? 'bg-royal text-white' : 'text-ink-soft hover:bg-royal-soft hover:text-royal'
                    }`}
                  >
                    <span className={`inline-flex w-4 justify-center text-sm ${active(i.path) ? 'text-gold-bright' : ''}`}>{i.icon}</span>
                    {i.label}
                    {i.feature && !hasFeature(session, i.feature) && (
                      <span className="ml-auto text-ink-muted" title="Not in your plan">
                        <LockIcon />
                      </span>
                    )}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 px-4 py-5 sm:px-7 sm:pr-12">{children}</main>
      </div>
      <NeedsAction session={session} refreshKey={route} />
    </div>
  )
}

/** v6 user chip, extended with a persona quick-switch (no logout needed between demos). */
function UserMenu() {
  const session = useAuthed()
  const { signInAs, signOut } = useSession()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data: directory } = useApi(listSignInDirectory, [])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const me = session.actor
  const groups: { label: string; match: (d: { user: { role: string }; org: { type: string } }) => boolean }[] = [
    { label: 'Platform admin', match: (d) => d.user.role === 'Super Admin' },
    { label: 'AA – Internal team', match: (d) => d.user.role === 'AA' },
    { label: 'Owner', match: (d) => d.org.type === 'Owner' },
    { label: 'Occupier', match: (d) => d.org.type === 'Occupier' },
    { label: 'Direct', match: (d) => d.org.type === 'Enabler' },
  ]

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-line bg-canvas py-1 pl-1 pr-3 text-xs hover:border-royal"
        aria-expanded={open}
      >
        <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-royal text-[11px] font-bold text-gold-bright">{initials(me.name)}</span>
        <span className="hidden text-left sm:block">
          <span className="block font-semibold leading-tight text-ink">{me.name}</span>
          <span className="block text-[11px] leading-tight text-ink-muted">{me.role} · {session.readOnly ? 'PropTattva' : session.org.name}</span>
        </span>
        <span className="text-ink-muted">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-50 mt-2 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-lg border border-line bg-white shadow-xl">
          <div className="border-b border-line px-4 py-2.5 text-[10px] font-bold uppercase tracking-wider text-ink-muted">Switch persona</div>
          <div className="max-h-[50vh] overflow-y-auto py-1">
            {groups.map((g) => {
              const people = (directory ?? []).filter((d) => g.match(d) && !d.blocker)
              if (!people.length) return null
              return (
                <div key={g.label}>
                  <div className="px-4 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-gold-dark">{g.label}</div>
                  {people.map(({ user, org }) => (
                    <button
                      key={user.user_id}
                      onClick={() => {
                        setOpen(false)
                        signInAs(user.user_id).catch((e) => toast('error', e.message))
                      }}
                      className={`flex w-full items-center justify-between gap-2 px-4 py-1.5 text-left text-[13px] hover:bg-hover ${user.user_id === me.user_id && !session.readOnly ? 'font-bold text-royal' : 'text-ink'}`}
                    >
                      <span className="truncate">{user.name}</span>
                      <span className="shrink-0 truncate text-[11px] text-ink-muted">{org.name}</span>
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
          <div className="flex justify-between border-t border-line bg-canvas px-4 py-2">
            <button
              className="text-xs font-semibold text-ink-soft hover:text-crit"
              onClick={() => {
                if (confirm('Reset all demo data to the original seed? Your edits will be lost.')) {
                  resetDemoData()
                  toast('info', 'Demo data reset.')
                }
              }}
            >
              Reset demo data
            </button>
            <button className="text-xs font-semibold text-royal hover:underline" onClick={signOut}>Logout</button>
          </div>
        </div>
      )}
    </div>
  )
}
