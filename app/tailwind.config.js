/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1F3864', 700: '#1F3864', 800: '#182c4f', 900: '#11203a' },
        brand: { DEFAULT: '#2E74B5', 50: '#eaf1fa', 100: '#dbeafe', 600: '#2E74B5', 700: '#245d92' },
        ink: { DEFAULT: '#1e2733', muted: '#64748b', soft: '#44546a' },
        line: '#e2e8f0',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
