// Stand-in for a geocoding service (E1-S01): validates an Indian PIN code and derives stable coordinates.

const CENTRES: Record<string, [number, number]> = {
  '560': [12.97, 77.59], // Bengaluru
  '411': [18.52, 73.86], // Pune
  '500': [17.39, 78.49], // Hyderabad
  '400': [19.08, 72.88], // Mumbai
  '110': [28.61, 77.21], // Delhi
  '122': [28.46, 77.03], // Gurugram
  '600': [13.08, 80.27], // Chennai
}

export const isValidPincode = (p: string) => /^[1-9]\d{5}$/.test(p)

export function geocode(pincode: string): { lat: number; long: number } | null {
  if (!isValidPincode(pincode)) return null
  const n = Number(pincode)
  const centre = CENTRES[pincode.slice(0, 3)] ?? [20 + ((n % 900) / 100), 75 + ((n % 700) / 100)]
  const jitter = (k: number) => (((n * k) % 1000) / 1000 - 0.5) * 0.12
  return { lat: +(centre[0] + jitter(7)).toFixed(5), long: +(centre[1] + jitter(13)).toFixed(5) }
}
