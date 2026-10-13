import type { ReactNode } from 'react'

export type Tone = 'ok' | 'warn' | 'crit' | 'royal' | 'gold' | 'muted'

const TONES: Record<Tone, string> = {
  ok: 'bg-ok-bg text-ok',
  warn: 'bg-warn-bg text-warn',
  crit: 'bg-crit-bg text-crit',
  royal: 'bg-royal-soft text-royal',
  gold: 'bg-gold-light text-gold-dark',
  muted: 'bg-hover text-ink-soft',
}

export default function Badge({ tone = 'royal', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** Shared status → tone mapping for every entity status field. */
export function statusTone(status: string): Tone {
  if (/^(active|accepted|operational)$/i.test(status)) return 'ok'
  if (/^(pending|trial|invited)$/i.test(status) || /u\.c|operational \//i.test(status)) return 'warn'
  if (/^(suspended|disabled|expired|revoked|retired)$/i.test(status)) return 'crit'
  return 'muted'
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status}</Badge>
}
