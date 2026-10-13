import type { ReactNode } from 'react'

/** Centered dialog in the v6 lock-modal style; tone sets the top rule colour. */
export default function Modal({ title, tone = 'royal', children, actions, onClose }: {
  title: ReactNode
  tone?: 'royal' | 'crit' | 'ok'
  children: ReactNode
  actions: ReactNode
  onClose: () => void
}) {
  const rule = { royal: 'border-t-royal', crit: 'border-t-crit', ok: 'border-t-ok' }[tone]
  const color = { royal: 'text-royal', crit: 'text-crit', ok: 'text-ok' }[tone]
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <button aria-label="Close" className="absolute inset-0 bg-royal-dark/60" onClick={onClose} />
      <div role="alertdialog" className={`relative w-full max-w-md rounded-xl border-t-4 bg-white p-6 shadow-2xl ${rule}`}>
        <h3 className={`mb-2 text-lg font-extrabold ${color}`}>{title}</h3>
        <div className="text-[13px] leading-relaxed text-ink-soft">{children}</div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">{actions}</div>
      </div>
    </div>
  )
}
