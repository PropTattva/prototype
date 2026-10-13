const DAY = 86_400_000

export const todayIso = () => new Date().toISOString().slice(0, 10)
export const addDays = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * DAY).toISOString().slice(0, 10)
export const addMonths = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
/** Whole days from a to b (b - a). */
export const daysBetween = (a: string, b: string) => Math.round((new Date(`${b.slice(0, 10)}T00:00:00Z`).getTime() - new Date(`${a.slice(0, 10)}T00:00:00Z`).getTime()) / DAY)
export const daysFromToday = (iso: string) => daysBetween(todayIso(), iso)

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export const quarterOf = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`)
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}

/** Expiry status shared by documents, certifications and reminders. */
export function expiryStatus(validity: string | null, warnDays = 90): 'Missing' | 'Expired' | 'Expiring' | 'Current' {
  if (!validity) return 'Missing'
  const d = daysFromToday(validity)
  if (d < 0) return 'Expired'
  if (d <= warnDays) return 'Expiring'
  return 'Current'
}
