export default function KpiCard({ value, unit, label, hint }: { value: string | number; unit?: string; label: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3.5">
      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="text-[22px] font-extrabold leading-tight text-royal">
        {value}
        {unit && <span className="ml-0.5 text-[11px] font-medium text-ink-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-[10px] text-ink-soft">{hint}</div>}
    </div>
  )
}
