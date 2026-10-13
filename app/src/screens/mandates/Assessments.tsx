import { useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import { linkFor } from '../../lib/links'
import { href, navigate } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import EntityPage from '../../components/crud/EntityPage'
import { useErrorHandler } from '../../components/crud/RecordDrawer'
import Modal from '../../components/ui/Modal'

/** E1-S06 / E5-S07: AA physical assessments — a 14-day site audit scored into the building grade. */
export default function Assessments({ rest }: { rest: string[] }) {
  const session = useAuthed()
  const [open, setOpen] = useState(rest[0] === 'new')
  return (
    <>
      <EntityPage
        entity="assessment"
        basePath="assessments"
        rest={rest[0] === 'new' ? [] : rest}
        subtitle="33-item site audit within a 14-day window. Completing it stores the score and sets the building grade (AA-only)."
        linkTo={linkFor(session)}
        rowHref={(r) => href(`assessments/${r.assessment_id}`)}
        onNew={() => setOpen(true)}
        newLabel="Start site audit"
      />
      {open && <StartAudit onClose={() => { setOpen(false); if (rest[0] === 'new') navigate('assessments') }} />}
    </>
  )
}

function StartAudit({ onClose }: { onClose: () => void }) {
  const session = useAuthed()
  const { data: ctx } = useApi(() => api.getOptionCtx(session), [session.user.user_id])
  const { handle, dialog } = useErrorHandler(session)
  const [building, setBuilding] = useState('')
  const [assessor, setAssessor] = useState(session.actor.name)
  return (
    <Modal
      title="Start a site audit"
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className="btn btn-gold"
            disabled={!building || !assessor.trim()}
            onClick={async () => {
              try {
                const a = await api.startAssessment(building, assessor.trim(), session)
                navigate(`assessments/${a.assessment_id}`)
              } catch (e) {
                handle(e)
              }
            }}
          >
            Open 14-day audit
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label" htmlFor="a-b">Building (under your mandate)</label>
          <select id="a-b" className="input" value={building} onChange={(e) => setBuilding(e.target.value)}>
            <option value="">Select…</option>
            {(ctx?.buildings ?? []).filter((b) => b.status !== 'Pre-OC').map((b) => <option key={b.building_id} value={b.building_id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="a-a">Assessor</label>
          <input id="a-a" className="input" value={assessor} onChange={(e) => setAssessor(e.target.value)} />
        </div>
      </div>
      {dialog}
    </Modal>
  )
}
