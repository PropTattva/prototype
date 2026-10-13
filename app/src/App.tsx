import type { ReactNode } from 'react'
import EntityPage from './components/crud/EntityPage'
import AppShell from './components/layout/AppShell'
import { allowedSections, homePath } from './components/layout/nav'
import { ToastProvider } from './components/ui/Toast'
import PtMark from './components/ui/PtMark'
import type { Session } from './access/session'
import type { EntityKey } from './entities/types'
import { linkFor } from './lib/links'
import AuditLog from './screens/admin/AuditLog'
import Overview from './screens/admin/Overview'
import ViewAs from './screens/admin/ViewAs'
import Availability from './screens/assets/Availability'
import BuildingDetail from './screens/assets/BuildingDetail'
import Buildings from './screens/assets/Buildings'
import BuildingWizard from './screens/assets/BuildingWizard'
import Stacking from './screens/assets/Stacking'
import Dashboard from './screens/Dashboard'
import Home from './screens/Home'
import BrokerLog from './screens/leasing/BrokerLog'
import Comparables from './screens/leasing/Comparables'
import LeaseDetail from './screens/leasing/LeaseDetail'
import Leases from './screens/leasing/Leases'
import LeaseWizard from './screens/leasing/LeaseWizard'
import Ledger from './screens/leasing/Ledger'
import Renewals from './screens/leasing/Renewals'
import Login from './screens/Login'
import AssessmentDetail from './screens/mandates/AssessmentDetail'
import Assessments from './screens/mandates/Assessments'
import MandateDetail from './screens/mandates/MandateDetail'
import Mandates from './screens/mandates/Mandates'
import Pipeline from './screens/mandates/Pipeline'
import Parking from './screens/Parking'
import RevenueAtRisk from './screens/RevenueAtRisk'
import Subscription from './screens/Subscription'
import Team from './screens/Team'
import Reminders from './screens/vault/Reminders'
import Sharing from './screens/vault/Sharing'
import Vault from './screens/vault/Vault'
import { href, navigate, useRoute } from './state/router'
import { SessionProvider, useSession } from './state/SessionContext'

const ADMIN_ENTITIES: Record<string, { entity: EntityKey; subtitle: string }> = {
  organisations: { entity: 'organisation', subtitle: 'Every customer is an isolated tenant (EP-A-S02). Suspend to block sign-in without losing data.' },
  users: { entity: 'user', subtitle: 'One role per user (EP-A-S04); role options follow the org type.' },
  invites: { entity: 'invite', subtitle: 'Pending invites reserve a seat and expire after 7 days (EP-A-S03).' },
  plans: { entity: 'plan', subtitle: 'The plan catalogue: features, quotas and default seats (§7.3). Edits apply immediately.' },
  subscriptions: { entity: 'subscription', subtitle: 'The plan each org holds. Assigned manually in Alpha — no billing.' },
}

function NotFound({ session }: { session: Session }) {
  return (
    <div className="mx-auto max-w-md rounded-lg border border-line bg-white px-6 py-12 text-center">
      <div className="mb-4 flex justify-center"><PtMark size="lg" /></div>
      <h2 className="text-[15px] font-bold text-royal">Page not available</h2>
      <p className="mt-2 text-[13px] text-ink-soft">This page doesn’t exist or isn’t available to {session.role}.</p>
      <a href={href(homePath(session))} className="btn btn-primary mt-5">Go to home</a>
    </div>
  )
}

/** Simple list pages that are just an EntityPage. */
function SimplePage({ session, section, rest }: { session: Session; section: string; rest: string[] }) {
  const owner = session.role === 'Owner/Developer'
  const cfg: Record<string, { entity: EntityKey; subtitle: string }> = {
    campuses: { entity: 'campus', subtitle: 'Multi-building estates and tech parks, with shared amenities and the campus management company (E1-S16, S21).' },
    occupiers: { entity: 'occupier', subtitle: 'Tenants and prospects, tagged by sector, GCC status and ultimate parent (E3-S07–S09). Shared across the platform.' },
    owners: { entity: 'owner', subtitle: 'The owning party and its sub-type, with contacts, committee members and strata owners (E1-S08–S15).' },
    vendors: { entity: 'vendor', subtitle: 'Agencies and vendors engaged on mandates and campuses (E5-S02, E1-S16).' },
    targets: { entity: 'targetOccupier', subtitle: 'Pre-identified outreach targets per mandated building — AA-only, never shared externally (E5-S08).' },
  }
  const c = cfg[section]
  return <EntityPage key={section} entity={c.entity} basePath={section} rest={rest} subtitle={c.subtitle} linkTo={linkFor(session)} ownOrgOnly={owner && c.entity !== 'occupier'} />
}

function Screen({ session }: { session: Session }) {
  const [section, ...rest] = useRoute()
  const sa = session.role === 'Super Admin'
  let page: ReactNode = null

  if (!section) {
    navigate(homePath(session))
    return null
  }
  if (section === 'admin' && sa) {
    const [sub, ...more] = rest
    if (!sub) page = <Overview />
    else if (sub === 'audit') page = <AuditLog />
    else if (sub === 'view-as') page = <ViewAs />
    else if (ADMIN_ENTITIES[sub]) {
      const cfg = ADMIN_ENTITIES[sub]
      page = <EntityPage key={sub} entity={cfg.entity} basePath={`admin/${sub}`} rest={more} subtitle={cfg.subtitle} linkTo={linkFor(session)} />
    }
  } else if (section === 'audit' && session.role === 'AA') page = <AuditLog />
  else if (allowedSections(session).has(section)) {
    switch (section) {
      case 'portfolio':
        page = <Dashboard />
        break
      case 'home':
        page = <Home />
        break
      case 'team':
        page = <Team rest={rest} />
        break
      case 'subscription':
        page = <Subscription />
        break
      case 'buildings':
        page = rest[0] === 'new' ? <BuildingWizard /> : rest[0] ? <BuildingDetail key={rest[0]} id={rest[0]} rest={rest.slice(1)} /> : <Buildings rest={[]} />
        break
      case 'stacking':
        page = <Stacking />
        break
      case 'availability':
        page = <Availability />
        break
      case 'leases':
        page = rest[0] === 'new' ? <LeaseWizard buildingId={rest[1]} /> : rest[0] ? <LeaseDetail key={rest[0]} id={rest[0]} rest={rest.slice(1)} /> : <Leases rest={[]} />
        break
      case 'renewals':
        page = <Renewals rest={rest} />
        break
      case 'ledger':
        page = <Ledger rest={rest} />
        break
      case 'broker-log':
        page = <BrokerLog rest={rest} />
        break
      case 'comparables':
        page = <Comparables />
        break
      case 'vault':
        page = <Vault key={rest[0] ?? 'grid'} rest={rest} />
        break
      case 'reminders':
        page = <Reminders />
        break
      case 'sharing':
        page = <Sharing rest={rest} />
        break
      case 'mandates':
        page = rest[0] && rest[0] !== 'new' ? <MandateDetail key={rest[0]} id={rest[0]} rest={rest.slice(1)} /> : <Mandates rest={rest} />
        break
      case 'assessments':
        page = rest[0] && rest[0] !== 'new' ? <AssessmentDetail key={rest[0]} id={rest[0]} /> : <Assessments rest={rest} />
        break
      case 'pipeline':
        page = <Pipeline rest={rest} />
        break
      case 'parking':
        page = <Parking rest={rest} />
        break
      case 'revenue-at-risk':
        page = <RevenueAtRisk />
        break
      case 'campuses':
      case 'occupiers':
      case 'owners':
      case 'vendors':
      case 'targets':
        page = <SimplePage session={session} section={section} rest={rest} />
        break
    }
  }

  return <AppShell>{page ?? <NotFound session={session} />}</AppShell>
}

function Root() {
  const { session } = useSession()
  return session ? <Screen session={session} /> : <Login />
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Root />
      </SessionProvider>
    </ToastProvider>
  )
}
