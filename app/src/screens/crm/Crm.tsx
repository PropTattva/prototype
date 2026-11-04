import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { useAuthed } from '../../state/SessionContext'
import AccountDetail from './AccountDetail'
import Accounts from './Accounts'
import Activities from './Activities'
import ContactDetail from './ContactDetail'
import Contacts from './Contacts'
import LogMeeting from './LogMeeting'
import Pipeline from './Pipeline'
import { AccountForm, ContactForm } from './RecordForms'
import Settings from './Settings'
import { makeCtx, type Opener } from './shared'

const SCOPE_KEY = 'pt-crm-scope'
const readScope = () => {
  try {
    return localStorage.getItem(SCOPE_KEY) ?? 'all'
  } catch {
    return 'all'
  }
}

/** CRM section: #/crm/activities | accounts[/id] | contacts[/id] | pipeline | settings. One book load, shared drawers. */
export default function Crm({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const admin = session.role === 'Super Admin'
  // Platform owner: "All organisations" or one org's book. Everyone else always sees their own org.
  const [scope, setScope] = useState(() => (admin ? readScope() : session.org.org_id))
  const { data: book, error } = useApi(() => api.crmBook(session, admin ? scope : session.org.org_id), [session.user.user_id, scope])
  const { data: orgs } = useApi(async () => (admin ? (await api.list('organisation', session)).map((o) => ({ org_id: o.org_id as string, name: o.name as string })) : []), [admin])
  const [drawer, setDrawer] = useState<Opener | null>(null)
  const pickScope = (v: string) => {
    setScope(v)
    try {
      localStorage.setItem(SCOPE_KEY, v)
    } catch {
      // per-viewer convenience only
    }
  }
  if (error)
    return (
      <p className="text-sm text-crit">
        {error.message} {admin && <button className="ml-2 font-semibold text-royal underline" onClick={() => pickScope('all')}>Show all organisations</button>}
      </p>
    )
  if (!book) return null
  const c = makeCtx(session, book, setDrawer)
  const [tab = 'activities', id] = rest
  const close = () => setDrawer(null)

  let page
  switch (tab) {
    case 'accounts':
      page = id ? <AccountDetail key={id} c={c} id={id} /> : <Accounts c={c} />
      break
    case 'contacts':
      page = id ? <ContactDetail key={id} c={c} id={id} /> : <Contacts c={c} />
      break
    case 'pipeline':
      page = <Pipeline c={c} />
      break
    case 'settings':
      page = <Settings c={c} />
      break
    default:
      page = <Activities c={c} />
  }

  return (
    <>
      {admin && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-royal/30 bg-royal-soft/60 px-3.5 py-2.5 text-[12px] text-royal-dark">
          <strong>Platform admin</strong>
          <span className="text-ink-soft">— you can view and change any organisation’s CRM. Every change is audited.</span>
          <label className="ml-auto flex items-center gap-2">
            <span className="font-semibold">Organisation</span>
            <select aria-label="CRM organisation" className="input w-auto py-1 text-xs" value={scope} onChange={(e) => pickScope(e.target.value)}>
              <option value="all">All organisations</option>
              {(orgs ?? []).map((o) => <option key={o.org_id} value={o.org_id}>{o.name}</option>)}
            </select>
          </label>
        </div>
      )}
      {page}
      {drawer?.kind === 'meeting' && <LogMeeting c={c} accountId={drawer.accountId} contactId={drawer.contactId} activityId={drawer.activityId} onClose={close} />}
      {drawer?.kind === 'account' && <AccountForm c={c} id={drawer.id} onClose={close} />}
      {drawer?.kind === 'contact' && <ContactForm c={c} id={drawer.id} accountId={drawer.accountId} onClose={close} />}
    </>
  )
}
