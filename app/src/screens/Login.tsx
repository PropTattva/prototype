import { useState } from 'react'
import type { OrgType } from '../domain/platform'
import { listSignInDirectory, resetDemoData } from '../data/api'
import { useApi } from '../data/useApi'
import PtMark from '../components/ui/PtMark'
import { useToast } from '../components/ui/Toast'
import { useSession } from '../state/SessionContext'

const PERSONAS: { type: OrgType; letter: string; name: string; sub: string }[] = [
  { type: 'Owner', letter: 'O', name: 'Owner', sub: 'You own one or more commercial buildings' },
  { type: 'Occupier', letter: 'C', name: 'Occupier', sub: 'Your company rents office space' },
  { type: 'Enabler', letter: 'D', name: 'Direct', sub: 'You are a broker, consultant, or fit-out partner' },
]

/** v6 "Who are you?" login. Each persona leads to the seeded users of that org type. */
export default function Login() {
  const { signInAs } = useSession()
  const toast = useToast()
  const [persona, setPersona] = useState<OrgType | null>(null)
  const { data: directory } = useApi(listSignInDirectory, [])

  const people = (directory ?? []).filter((d) => d.org.type === persona)
  const label = persona === 'PropTattva' ? 'Internal team' : PERSONAS.find((p) => p.type === persona)?.name

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-royal to-royal-dark p-4 sm:p-5">
      <div className="w-full max-w-[580px] rounded-[14px] border-t-4 border-gold bg-white p-6 shadow-[0_25px_70px_rgba(0,0,0,0.3)] sm:p-10">
        <div className="mb-1.5 flex items-center gap-3.5">
          <PtMark size="lg" />
          <h1 className="text-[26px] font-extrabold tracking-tight text-royal">Platform</h1>
        </div>
        <p className="mb-6 text-[13px] text-ink-muted sm:ml-[70px]">India commercial real estate · secure · simple</p>

        <div className="mb-4 rounded-[5px] border-l-[3px] border-gold bg-gold-light px-3.5 py-2.5 text-[11px] leading-relaxed text-royal-dark">
          <strong>Corporate email required.</strong> Login requires an email at your company domain (e.g. name@yourcompany.com). Personal emails (gmail, outlook) blocked unless approved by AA / N8 / PT admin.
        </div>

        {!persona ? (
          <>
            <div className="mb-3.5 text-[15px] font-bold text-ink">Who are you?</div>
            <div className="flex flex-col gap-2.5">
              {PERSONAS.map((p) => (
                <button
                  key={p.type}
                  onClick={() => setPersona(p.type)}
                  className="group flex items-center gap-4 rounded-[10px] border-[1.5px] border-line bg-white px-5 py-[18px] text-left transition hover:-translate-y-px hover:border-royal hover:shadow-[0_6px_20px_rgba(30,58,138,0.12)]"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-royal-soft text-base font-extrabold text-royal group-hover:bg-gold group-hover:text-royal-dark">
                    {p.letter}
                  </span>
                  <span>
                    <span className="block text-[15px] font-bold text-ink">{p.name}</span>
                    <span className="block text-xs text-ink-soft">{p.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mb-3.5 flex items-center justify-between">
              <div className="text-[15px] font-bold text-ink">Sign in as · {label}</div>
              <button className="text-xs font-semibold text-royal hover:underline" onClick={() => setPersona(null)}>← Back</button>
            </div>
            <ul className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
              {people.map(({ user, org, planName, blocker }) => (
                <li key={user.user_id}>
                  <button
                    disabled={!!blocker}
                    onClick={() => signInAs(user.user_id).catch((e) => toast('error', e.message))}
                    className="flex w-full items-center gap-3 rounded-lg border border-line px-4 py-3 text-left transition enabled:hover:border-royal enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-royal text-xs font-bold text-gold">
                      {user.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{user.name}</span>
                      <span className="block truncate text-[11px] text-ink-soft">
                        {user.role} · {org.name}
                        {planName && ` · ${planName}`}
                      </span>
                      <span className="block truncate font-mono text-[10px] text-ink-muted">{user.email}</span>
                    </span>
                    {blocker && <span className="shrink-0 rounded bg-crit-bg px-2 py-0.5 text-[10px] font-bold uppercase text-crit">{blocker}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-t border-line pt-[18px] text-center text-[11px] text-ink-muted">
          <span>Phase ALPHA pilot · Enterprise security from Day 1 ·</span>
          <button className="font-semibold text-royal hover:underline" onClick={() => setPersona('PropTattva')}>Internal team login</button>
          <span>·</span>
          <button
            className="font-semibold text-royal hover:underline"
            onClick={() => {
              if (confirm('Reset all demo data to the original seed? Your edits will be lost.')) {
                resetDemoData()
                toast('info', 'Demo data reset.')
              }
            }}
          >
            Reset demo data
          </button>
        </div>
      </div>
    </div>
  )
}
