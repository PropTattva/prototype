import type { ReactNode } from 'react'
import type { Building } from '../../domain/assets'
import type { OptionCtx } from '../../entities/types'
import { href, navigate } from '../../state/router'
import PageHeader from '../ui/PageHeader'

export interface DrillStat {
  label: string
  value: ReactNode
  /** highlight as a risk (e.g. aged vacancy, expiring leases) */
  alert?: boolean
}

/** Share of leasable area by state, drawn as a thin stacked bar on each card. */
export interface DrillMix {
  occupied: number
  self: number
  vacant: number
}

interface Props {
  /** route segment, e.g. 'stacking' */
  module: string
  title: string
  subtitle?: ReactNode
  /** segments after the module: [] | ['in', city] | ['in', city, buildingId] */
  rest: string[]
  ctx: OptionCtx
  /** buildings worth showing in this module (e.g. those with floors, or with space on the market) */
  include?: (b: Building) => boolean
  stats: (buildingIds: string[]) => DrillStat[]
  mix?: (buildingIds: string[]) => DrillMix
  /** what to show once a building is chosen; omit to open the building page instead */
  renderBuilding?: (b: Building) => ReactNode
  /** content above the cards at every level (e.g. filter pills) */
  toolbar?: ReactNode
  right?: ReactNode
  emptyText?: string
}

/** V2 navigation: All cities → city (buildings grouped by campus) → one building's data. */
export default function Drill({ module, title, subtitle, rest, ctx, include = () => true, stats, mix, renderBuilding, toolbar, right, emptyText = 'Nothing to show here yet.' }: Props) {
  const buildings = ctx.buildings.filter(include)
  const cities = [...new Set(buildings.map((b) => b.city))].sort()
  // A single-city portfolio skips the city step.
  const city = rest[0] === 'in' && rest[1] ? rest[1] : cities.length === 1 ? cities[0] : null
  // Look the building up in the full scoped list so a filter that hides its card doesn't bounce the viewer out.
  const building = city && rest[2] ? ctx.buildings.find((b) => b.building_id === rest[2]) ?? null : null
  const base = (...p: string[]) => [module, ...p].map(encodeURIComponent).join('/')

  const crumbs: { label: string; to?: string }[] = []
  if (cities.length > 1) crumbs.push({ label: 'All cities', to: city ? base() : undefined })
  if (city) crumbs.push({ label: city, to: building ? base('in', city) : undefined })
  if (building) crumbs.push({ label: building.name })

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} right={<div className="flex flex-wrap items-center gap-2">{right}<ViewToggle module={module} v2 /></div>} />
      {crumbs.length > 0 && (
        <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-sm" aria-label="Breadcrumb">
          {crumbs.map((c, i) => (
            <span key={c.label} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-muted">›</span>}
              {c.to ? <a href={href(c.to)} className="font-semibold text-royal hover:underline">{c.label}</a> : <span className="font-bold text-ink">{c.label}</span>}
            </span>
          ))}
        </nav>
      )}
      {toolbar}
      {!buildings.length && !building ? (
        <Empty text={emptyText} />
      ) : building ? (
        renderBuilding?.(building)
      ) : city && !buildings.some((b) => b.city === city) ? (
        <Empty text={emptyText} />
      ) : city ? (
        <CityLevel ctx={ctx} buildings={buildings.filter((b) => b.city === city)} stats={stats} mix={mix} open={(b) => navigate(renderBuilding ? base('in', city, b.building_id) : `buildings/${b.building_id}`)} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cities.map((c) => {
            const bs = buildings.filter((b) => b.city === c)
            const ids = bs.map((b) => b.building_id)
            const campusCount = new Set(bs.map((b) => b.campus_id)).size
            return (
              <DrillCard
                key={c}
                title={c}
                meta={`${campusCount} ${campusCount === 1 ? 'campus' : 'campuses'} · ${bs.length} ${bs.length === 1 ? 'building' : 'buildings'}`}
                stats={stats(ids)}
                mix={mix?.(ids)}
                onClick={() => navigate(base('in', c))}
                large
              />
            )
          })}
        </div>
      )}
    </>
  )
}

function CityLevel({ ctx, buildings, stats, mix, open }: { ctx: OptionCtx; buildings: Building[]; stats: Props['stats']; mix: Props['mix']; open: (b: Building) => void }) {
  const groups = [...new Set(buildings.map((b) => b.campus_id ?? ''))]
    .map((id) => ({ id, name: ctx.campuses.find((c) => c.campus_id === id)?.name ?? 'Standalone buildings', items: buildings.filter((b) => (b.campus_id ?? '') === id) }))
    .sort((a, b) => a.name.localeCompare(b.name))
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <section key={g.id}>
          <h3 className="mb-2 flex items-baseline gap-2 text-sm font-extrabold text-royal">
            {g.name}
            <span className="text-[11px] font-medium text-ink-muted">{g.items.length} {g.items.length === 1 ? 'building' : 'buildings'}</span>
          </h3>
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.items.map((b) => (
              <DrillCard key={b.building_id} title={b.name} meta={b.status === 'Active' ? undefined : b.status} stats={stats([b.building_id])} mix={mix?.([b.building_id])} onClick={() => open(b)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function DrillCard({ title, meta, stats, mix, onClick, large }: { title: string; meta?: string; stats: DrillStat[]; mix?: DrillMix; onClick: () => void; large?: boolean }) {
  const total = mix ? mix.occupied + mix.self + mix.vacant : 0
  return (
    <button onClick={onClick} className={`group w-full rounded-lg border border-line bg-white text-left transition hover:border-royal hover:shadow-md ${large ? 'p-4' : 'p-3.5'}`}>
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`truncate font-extrabold text-royal ${large ? 'text-base' : 'text-sm'}`}>{title}</div>
          {meta && <div className="mt-0.5 text-[11px] text-ink-muted">{meta}</div>}
        </div>
        <span className="text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-royal">→</span>
      </div>
      <dl className="grid grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="min-w-0">
            <dt className="truncate text-[10px] font-bold uppercase tracking-wider text-ink-muted">{s.label}</dt>
            <dd className={`mt-0.5 truncate font-extrabold ${large ? 'text-lg' : 'text-[15px]'} ${s.alert ? 'text-crit' : 'text-ink'}`}>{s.value}</dd>
          </div>
        ))}
      </dl>
      {mix && total > 0 && (
        <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full" title={`Occupied ${pct(mix.occupied, total)} · Self-use ${pct(mix.self, total)} · Vacant ${pct(mix.vacant, total)}`}>
          {mix.occupied > 0 && <span className="bg-royal" style={{ width: pct(mix.occupied, total) }} />}
          {mix.self > 0 && <span className="bg-[#7a52b3]" style={{ width: pct(mix.self, total) }} />}
          {mix.vacant > 0 && <span className="bg-ok" style={{ width: pct(mix.vacant, total) }} />}
        </div>
      )}
    </button>
  )
}

const pct = (n: number, d: number) => `${((n / d) * 100).toFixed(0)}%`

/** Legend for the stacked bar on the cards. */
export function MixLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-ink-muted">
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-royal" />Occupied</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#7a52b3]" />Self-use</span>
      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-ok" />Vacant</span>
    </div>
  )
}

/** Switch between the V2 drill-down and the V1 full table. */
export function ViewToggle({ module, v2 }: { module: string; v2: boolean }) {
  const cls = (on: boolean) => `px-3 py-1.5 text-xs font-semibold ${on ? 'bg-royal text-white' : 'bg-white text-ink-soft hover:text-royal'}`
  return (
    <div className="flex overflow-hidden rounded-md border border-line" role="group" aria-label="View">
      <a href={href(module)} className={cls(v2)}>Drill-down</a>
      <a href={href(`${module}/table`)} className={`${cls(!v2)} border-l border-line`}>Full table</a>
    </div>
  )
}

export function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-line bg-white px-4 py-10 text-center text-sm text-ink-muted">{text}</p>
}
