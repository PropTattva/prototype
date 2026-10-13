import { useEffect, useMemo, useState } from 'react'
import * as api from '../../data/api'
import { useApi } from '../../data/useApi'
import type { AssessmentCriterion, BuildingAssessment } from '../../domain/mandates'
import { assessmentScore, gradeBand } from '../../lib/assessment'
import { daysFromToday, fmtDate } from '../../lib/dates'
import { href } from '../../state/router'
import { useAuthed } from '../../state/SessionContext'
import { useErrorHandler } from '../../components/crud/RecordDrawer'
import Badge from '../../components/ui/Badge'
import KpiCard from '../../components/ui/KpiCard'
import { useToast } from '../../components/ui/Toast'

const CATS: AssessmentCriterion['category'][] = ['Structural', 'NBC', 'MEP', 'LEED', 'WELL', 'Amenity', 'Other']

/** The 33-item checklist, scored 0–10 per item, with a live weighted score and grade band (E5-S03, S07). */
export default function AssessmentDetail({ id }: { id: string }) {
  const session = useAuthed()
  const toast = useToast()
  const { handle, dialog } = useErrorHandler(session)
  const { data, error } = useApi(async () => {
    const [a, crit, ctx] = await Promise.all([api.get('assessment', id, session), api.list('assessmentCriterion', session, { assessment_id: id }), api.getOptionCtx(session)])
    return { a: a as BuildingAssessment, crit: crit as AssessmentCriterion[], ctx }
  }, [id, session.user.user_id])
  const [scores, setScores] = useState<Record<string, number | null>>({})
  useEffect(() => setScores(Object.fromEntries((data?.crit ?? []).map((c) => [c.criterion_id, c.score]))), [data])
  const live = useMemo(() => (data ? data.crit.map((c) => ({ ...c, score: scores[c.criterion_id] ?? null })) : []), [data, scores])
  if (error) return <p className="rounded-lg border border-crit/30 bg-crit-bg px-4 py-3 text-sm text-crit">{error.message}</p>
  if (!data) return null
  const { a, ctx } = data
  const done = a.status === 'Completed'
  const editable = !done && !session.readOnly
  const scored = live.filter((c) => c.score != null).length
  const score = assessmentScore(live)
  const dirty = data.crit.some((c) => c.score !== scores[c.criterion_id])
  const left = daysFromToday(a.audit_due)
  const building = ctx.buildings.find((b) => b.building_id === a.building_id)

  const save = async () => {
    try {
      await api.scoreCriteria(id, scores, session)
      toast('ok', 'Scores saved.')
    } catch (e) {
      handle(e)
    }
  }

  return (
    <>
      <div className="mb-1 text-xs text-ink-muted">
        <a href={href('assessments')} className="font-semibold text-royal hover:underline">Assessments</a> / <a href={href(`buildings/${a.building_id}`)} className="hover:underline">{building?.name}</a>
      </div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold tracking-tight text-royal">Site audit — {building?.name}</h1>
          <p className="mt-0.5 text-[13px] text-ink-soft">{a.assessor} · opened {fmtDate(a.assessment_date)}</p>
          <div className="mt-2 flex gap-1.5"><Badge tone={done ? 'ok' : 'warn'}>{done ? 'Completed' : 'Audit in progress'}</Badge><Badge tone="muted">AA team only</Badge></div>
        </div>
        {editable && (
          <div className="flex gap-2">
            <button className="btn" disabled={!dirty} onClick={save}>Save scores</button>
            <button
              className="btn btn-gold"
              disabled={scored < live.length}
              title={scored < live.length ? 'Score every item first' : undefined}
              onClick={async () => {
                try {
                  if (dirty) await api.scoreCriteria(id, scores, session)
                  const r = await api.completeAssessment(id, session)
                  toast('ok', `Completed: ${r.score}/100 → grade ${r.grade}, applied to the building.`)
                } catch (e) {
                  handle(e)
                }
              }}
            >
              Complete & set grade
            </button>
          </div>
        )}
      </div>
      <div className="mb-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <KpiCard label="Score" value={done ? a.total_score ?? score : score} unit="/ 100" hint={done ? 'Stored with the assessment' : 'Live, unscored items count as 0'} />
        <KpiCard label="Grade band" value={done ? a.grade ?? '—' : gradeBand(score)} hint="A+ ≥ 85 · A ≥ 70 · B ≥ 55 · C" />
        <KpiCard label="Items scored" value={`${scored}/${live.length}`} hint={`${live.length - scored} remaining`} />
        <KpiCard label="Audit window" value={done ? 'Closed' : left >= 0 ? `${left} days left` : `${-left} days over`} hint={`Due ${fmtDate(a.audit_due)} (14 days)`} />
      </div>
      <div className="space-y-3">
        {CATS.map((cat) => {
          const rows = live.filter((c) => c.category === cat)
          if (!rows.length) return null
          const w = rows.reduce((s, c) => s + c.weight, 0)
          return (
            <section key={cat} className="overflow-hidden rounded-lg border border-line bg-white">
              <header className="flex items-center justify-between border-b-2 border-gold px-4 py-2.5">
                <h3 className="text-sm font-extrabold text-royal">{cat}</h3>
                <span className="text-[11px] text-ink-muted">weight {w} · {assessmentScore(rows)}%</span>
              </header>
              <ul className="divide-y divide-line-light">
                {rows.map((c) => (
                  <li key={c.criterion_id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-[13px]">
                    <span className="min-w-[200px] flex-1">{c.criterion_name}</span>
                    <span className="w-14 text-[11px] text-ink-muted">wt {c.weight}</span>
                    <div className="flex gap-0.5" role="radiogroup" aria-label={`Score for ${c.criterion_name}`}>
                      {Array.from({ length: 11 }, (_, n) => (
                        <button
                          key={n}
                          role="radio"
                          aria-checked={c.score === n}
                          disabled={!editable}
                          onClick={() => setScores((x) => ({ ...x, [c.criterion_id]: n }))}
                          className={`h-6 w-6 rounded text-[11px] font-semibold ${c.score === n ? 'bg-royal text-white' : c.score != null && n < c.score ? 'bg-royal-soft text-royal' : 'bg-canvas text-ink-muted hover:bg-hover'} disabled:cursor-default`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      {dialog}
    </>
  )
}
