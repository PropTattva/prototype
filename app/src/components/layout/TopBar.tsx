import { getOwnerOrgs } from '../../data/api'
import { useApp } from '../../state/AppContext'
import type { Role } from '../../types'

const ROLES: { id: Role; label: string }[] = [
  { id: 'admin', label: 'PT Admin' },
  { id: 'owner', label: 'Owner / Developer' },
]

export default function TopBar() {
  const { scope, setRole, setOwnerId, publicLens, setPublicLens } = useApp()
  const owners = getOwnerOrgs()

  return (
    <header className="sticky top-0 z-30 bg-navy text-white shadow">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <div className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-wide">PropTattva</span>
          <span className="hidden text-xs text-white/60 sm:inline">Office space platform · prototype</span>
        </div>
        <div className="flex-1" />

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-wider text-white/60">View as</span>
          <div className="flex rounded-lg bg-white/10 p-0.5" role="radiogroup" aria-label="Role">
            {ROLES.map((r) => (
              <button
                key={r.id}
                role="radio"
                aria-checked={scope.role === r.id}
                onClick={() => setRole(r.id)}
                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition ${
                  scope.role === r.id ? 'bg-white text-navy shadow-sm' : 'text-white/80 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {scope.role === 'owner' && (
            <select
              value={scope.ownerId}
              onChange={(e) => setOwnerId(e.target.value)}
              aria-label="Owner organisation"
              className="rounded-md border-0 bg-white py-1 pl-2 pr-7 text-xs font-semibold text-navy focus:ring-2 focus:ring-brand"
            >
              {owners.map((o) => (
                <option key={o.orgId} value={o.orgId}>{o.name}</option>
              ))}
            </select>
          )}
          <label className="ml-1 flex cursor-pointer items-center gap-2 rounded-lg bg-white/10 px-2.5 py-1 text-xs font-medium">
            <input
              type="checkbox"
              checked={publicLens}
              onChange={(e) => setPublicLens(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-white/40 bg-transparent text-amber-400 focus:ring-0"
            />
            Public lens
          </label>
        </div>
      </div>
    </header>
  )
}
