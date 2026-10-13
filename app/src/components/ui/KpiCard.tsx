export default function KpiCard({ value, label, hint }: { value: string | number; label: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3.5 shadow-sm">
      <div className="text-2xl font-bold leading-tight text-navy">{value}</div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wide text-ink-muted">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-soft">{hint}</div>}
    </div>
  )
}
