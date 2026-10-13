import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' so the build can be dropped into any GitHub Pages sub-path
export default defineConfig({ plugins: [react()], base: './' })
