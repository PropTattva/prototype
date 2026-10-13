import type { ReactNode } from 'react'
import EntityPage from './components/crud/EntityPage'
import AppShell from './components/layout/AppShell'
import { homePath } from './components/layout/nav'
import { ToastProvider } from './components/ui/Toast'
import PtMark from './components/ui/PtMark'
import type { Session } from './access/session'
import type { EntityKey } from './entities/types'
import AuditLog from './screens/admin/AuditLog'
import Overview from './screens/admin/Overview'
import ViewAs from './screens/admin/ViewAs'
import Dashboard from './screens/Dashboard'
import Home from './screens/Home'
import Login from './screens/Login'
import Subscription from './screens/Subscription'
import Team from './screens/Team'
import { href, navigate, useRoute } from './state/router'
import { SessionProvider, useSession } from './state/SessionContext'

const ADMIN_ENTITIES: Record<string, { entity: EntityKey; subtitle: string }> = {
  organisations: { entity: 'organisation', subtitle: 'Every customer is an isolated tenant (EP-A-S02). Suspend to block sign-in without losing data.' },
  users: { entity: 'user', subtitle: 'One role per user (EP-A-S04); role options follow the org type.' },
  invites: { entity: 'invite', subtitle: 'Pending invites reserve a seat and expire after 7 days (EP-A-S03).' },
  plans: { entity: 'plan', subtitle: 'The plan catalogue: features, quotas and default seats (§7.3). Edits apply immediately.' },
  subscriptions: { entity: 'subscription', subtitle: 'The plan each org holds. Assigned manually in Alpha — no billing.' },
}
const SLUG: Record<EntityKey, string> = { organisation: 'organisations', user: 'users', invite: 'invites', plan: 'plans', subscription: 'subscriptions' }
const adminLink = (entity: EntityKey, id: string) => href(`admin/${SLUG[entity]}/${id}`)

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

function Screen({ session }: { session: Session }) {
  const [section, ...rest] = useRoute()
  const sa = session.role === 'Super Admin'
  const external = !sa && session.role !== 'AA'
  let page: ReactNode = null

  if (!section) {
    navigate(homePath(session))
    return null
  }
  if (section === 'portfolio' && session.role !== 'Occupier' && session.role !== 'Enabler') page = <Dashboard />
  else if (section === 'admin' && sa) {
    const [sub, ...more] = rest
    if (!sub) page = <Overview />
    else if (sub === 'audit') page = <AuditLog />
    else if (sub === 'view-as') page = <ViewAs />
    else if (ADMIN_ENTITIES[sub]) {
      const cfg = ADMIN_ENTITIES[sub]
      page = <EntityPage key={sub} entity={cfg.entity} basePath={`admin/${sub}`} rest={more} subtitle={cfg.subtitle} linkTo={adminLink} />
    }
  } else if (section === 'audit' && session.role === 'AA') page = <AuditLog />
  else if (section === 'team' && external) page = <Team rest={rest} />
  else if (section === 'subscription' && external) page = <Subscription />
  else if (section === 'home' && external) page = <Home />

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
