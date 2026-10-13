import { linkFor } from '../../lib/links'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'

/** v6 Sharing & Access: share a document, a category or a building folder by email — revocable any time. */
export default function Sharing({ rest }: { rest: string[] }) {
  const session = useAuthed()
  return (
    <EntityPage
      entity="documentShare"
      basePath="sharing"
      rest={rest}
      title="Sharing & Access"
      subtitle="Share by email · 3 permission levels · expiry dates · revocable any time"
      newLabel="Share documents"
      linkTo={linkFor(session)}
      ownOrgOnly={session.role === 'Owner/Developer'}
      banner={
        <div className="mb-3 rounded-[5px] border-l-[3px] border-gold bg-gold-light px-3.5 py-2.5 text-xs leading-relaxed text-royal-dark">
          Shares are separate from a document’s <strong>sharing scope</strong>: the scope decides what occupiers and brokers see on the platform; a share grants a named outsider (lawyer, auditor, lender) access to specific files.
        </div>
      }
    />
  )
}
