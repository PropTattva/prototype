/** @type {import('tailwindcss').Config} */
// Brand palette (Kaspian Partners guide): navy R16 G43 B78 as `royal`, copper R179 G102 B40 as `gold`.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        royal: { DEFAULT: '#102b4e', dark: '#0a1e38', light: '#1f4373', soft: '#e9eef5' },
        // `bright` is the light end of the copper gradient, for copper text on navy.
        gold: { DEFAULT: '#b36628', dark: '#8f4e1b', light: '#f7eadf', bright: '#e39a62' },
        ink: { DEFAULT: '#0e1d33', soft: '#4a5568', muted: '#8a93a6' },
        line: { DEFAULT: '#e4e8f3', light: '#eff1f8' },
        canvas: '#f7f8fc',
        hover: '#eef1f9',
        ok: { DEFAULT: '#216e4e', bg: '#e6f4ea' },
        warn: { DEFAULT: '#b57d00', bg: '#fdf4d8' },
        crit: { DEFAULT: '#a91e3f', bg: '#fdeef2' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        brand: ['Aileron', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
