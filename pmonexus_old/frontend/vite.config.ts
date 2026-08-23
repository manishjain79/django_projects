import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds straight into Django's static tree with stable filenames,
// so the template can reference planner.js / planner.css directly.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../static/pmo/planner',
    emptyOutDir: false,
    rollupOptions: {
      input: 'src/main.tsx',
      output: {
        entryFileNames: 'planner.js',
        assetFileNames: 'planner.[ext]',
      },
    },
  },
})
