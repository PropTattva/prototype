const inr = new Intl.NumberFormat('en-IN')

export const fmtNum = (n: number | null | undefined) => (n == null ? '–' : inr.format(n))

/** 4269517 -> "4.27M", 81373 -> "81k" */
export function fmtSft(n: number | null | undefined) {
  if (!n) return '–'
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`
  return String(n)
}

export const fmtPct = (n: number | null | undefined) => (n == null ? '–' : `${n % 1 ? n.toFixed(1) : n}%`)

export const fmtRent = (n: number | null | undefined) => (n == null ? '–' : `₹${n}`)
