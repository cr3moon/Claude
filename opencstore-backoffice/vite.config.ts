import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  // Renderer root is /src — index.html lives at src/index.html
  root: resolve(__dirname, 'src'),
  // Electron loads the built index.html via file://, not from a server root,
  // so asset URLs must be relative ("./assets/...") rather than root-absolute
  // ("/assets/...") — otherwise they resolve to the filesystem root and the
  // renderer never loads (blank window, no console error).
  base: './',
  // publicDir: no public/ folder needed for the MVP; add later for icons/fonts
  build: {
    outDir: resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, 'src/index.html'),
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
