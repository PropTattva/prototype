/** @type {import('tailwindcss').Config} */
// Palette mirrors PT_Demo_v6.html (royal + gold).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        royal: { DEFAULT: '#1e3a8a', dark: '#152a66', light: '#2d4ea8', soft: '#eaefff' },
        gold: { DEFAULT: '#c9a44a', dark: '#a8862f', light: '#f4ebd0' },
        ink: { DEFAULT: '#0f1b3d', soft: '#4a5578', muted: '#8a93af' },
        line: { DEFAULT: '#e4e8f3', light: '#eff1f8' },
        canvas: '#f7f8fc',
        hover: '#eef1f9',
        ok: { DEFAULT: '#216e4e', bg: '#e6f4ea' },
        warn: { DEFAULT: '#b57d00', bg: '#fdf4d8' },
        crit: { DEFAULT: '#a91e3f', bg: '#fdeef2' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}
