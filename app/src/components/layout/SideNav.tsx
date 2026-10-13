import { useApp, type View } from '../../state/AppContext'

const ITEMS: { view: View; label: string; adminOnly?: boolean; icon: string }[] = [
  { view: 'dashboard', label: 'Portfolio', icon: 'M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z' },
  { view: 'parks', label: 'Parks', icon: 'M4 21V5l8-3 8 3v16h-6v-5h-4v5H4Zm4-12h2V7H8v2Zm6 0h2V7h-2v2Zm-6 4h2v-2H8v2Zm6 0h2v-2h-2v2Z' },
  { view: 'availability', label: 'Availability', icon: 'M10 18a8 8 0 1 1 5.3-2l5.4 5.3-1.4 1.4-5.3-5.4A8 8 0 0 1 10 18Zm0-2a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z' },
  { view: 'organisations', label: 'Organisations', adminOnly: true, icon: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-7 2-7 4.5V20h14v-2.5C16 15 13 13 9 13Zm7.5-2a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM18 13.2c1.8.7 3 2 3 3.8V20h-3v-2.5c0-1.7-.8-3.1-2.1-4.2.7-.1 1.4 0 2.1-.1Z' },
]

export default function SideNav() {
  const { scope, view, navigate } = useApp()
  const items = ITEMS.filter((i) => !i.adminOnly || scope.role === 'admin')

  return (
    <nav className="sticky top-[52px] z-20 border-b border-line bg-white md:top-[60px] md:h-[calc(100vh-60px)] md:w-52 md:shrink-0 md:border-b-0 md:border-r md:bg-transparent md:py-5">
      <ul className="flex gap-1 overflow-x-auto px-3 py-2 md:flex-col md:px-3 md:py-0">
        {items.map((i) => {
          const active = view === i.view
          return (
            <li key={i.view}>
              <button
                onClick={() => navigate(i.view)}
                className={`flex w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-brand-50 text-navy' : 'text-ink-soft hover:bg-slate-100 hover:text-navy'
                }`}
              >
                <svg viewBox="0 0 24 24" className={`h-4 w-4 fill-current ${active ? 'text-brand' : 'text-slate-400'}`} aria-hidden>
                  <path d={i.icon} />
                </svg>
                {i.label}
                {i.adminOnly && <span className="ml-auto rounded bg-navy/10 px-1.5 text-[10px] font-semibold text-navy">ADMIN</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
