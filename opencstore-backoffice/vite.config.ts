import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: 'app/renderer',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'app/renderer'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
