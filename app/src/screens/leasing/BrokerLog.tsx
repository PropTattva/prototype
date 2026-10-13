import { linkFor } from '../../lib/links'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'

/** E3-S06 / S12: immutable, time-stamped broker introductions; the first registration wins. */
export default function BrokerLog({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const broker = session.role === 'Enabler'
  return (
    <EntityPage
      entity="brokerLog"
      basePath="broker-log"
      rest={rest}
      title={broker ? 'My introductions' : 'Broker introductions'}
      subtitle={
        broker
          ? 'Register an occupier introduction to a published building. The first broker to register an occupier for a building is protected for 180 days.'
          : 'Time-stamped and immutable, so commission disputes can be settled from the record (E3-S06).'
      }
      newLabel="Register introduction"
      linkTo={linkFor(session)}
      hideColumns={broker ? ['broker_org_id'] : []}
      banner={
        <div className="mb-3 rounded-[5px] border-l-[3px] border-royal bg-royal-soft px-3.5 py-2.5 text-xs leading-relaxed text-royal-dark">
          <strong>Duplicate protection.</strong> A later registration of the same occupier for the same building is stored as <em>Duplicate</em> and does not earn the introduction. Entries can never be edited or deleted.
        </div>
      }
    />
  )
}
