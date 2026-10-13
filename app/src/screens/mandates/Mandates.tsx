import { linkFor } from '../../lib/links'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'

/** E5-S01: mandate status per asset — the switch that lets AA act on a building. */
export default function Mandates({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const owner = session.role === 'Owner/Developer'
  return (
    <EntityPage
      entity="mandate"
      basePath="mandates"
      rest={rest}
      subtitle={
        owner
          ? 'AA engagements on your buildings. Choose how leasing is executed and set the threshold NOI; AA working papers stay with AA.'
          : 'An active mandate executed by AA (or hybrid) is what lets the AA team act on a building.'
      }
      linkTo={linkFor(session)}
      ownOrgOnly={owner}
      rowHref={(r) => href(`mandates/${r.mandate_id}`)}
    />
  )
}
