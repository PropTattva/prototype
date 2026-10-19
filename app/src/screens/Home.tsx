import { featureLabel } from '../access/policy'
import { href } from '../state/router'
import { useAuthed } from '../state/SessionContext'
import Card from '../components/ui/Card'
import PageHeader from '../components/ui/PageHeader'

/** Occupier / Direct landing until their discovery screens arrive in a later phase. */
export default function Home() {
  const session = useAuthed()
  return (
    <>
      <PageHeader title={`Welcome, ${session.user.name.split(' ')[0]}`} subtitle={`${session.org.name} · ${session.role} · ${session.plan?.name ?? 'No plan'}`} />
      <div className="grid gap-3.5 md:grid-cols-2">
        <Card title="Your plan includes">
          <ul className="space-y-1 text-[13px] text-ink-soft">
            {session.plan?.feature_flags.map((f) => <li key={f}>✓ {featureLabel(f)}</li>)}
          </ul>
          <a href={href('subscription')} className="mt-3 inline-block text-xs font-semibold text-royal hover:underline">Compare plans →</a>
        </Card>
        <Card title="Coming in the next phases">
          <p className="text-[13px] text-ink-soft">
            {session.role === 'Occupier'
              ? 'Browse published building profiles, stacking plans with tenant names masked, availability and anonymised rent comparables.'
              : 'Browse public listings and register occupier introductions — duplicate registrations are detected and first registration wins.'}
          </p>
          <a href={href('team')} className="mt-3 inline-block text-xs font-semibold text-royal hover:underline">Manage your team →</a>
        </Card>
      </div>
    </>
  )
}
