function tone(status: string) {
  if (/^operational$/i.test(status)) return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20'
  if (/operational|u\.c/i.test(status)) return 'bg-amber-50 text-amber-800 ring-amber-600/20'
  return 'bg-slate-100 text-slate-600 ring-slate-500/20'
}

export default function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${tone(status)}`}>
      {status}
    </span>
  )
}
