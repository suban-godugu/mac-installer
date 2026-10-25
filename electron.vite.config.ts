import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

const alias = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias },
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias },
    build: { externalizeDeps: true }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    resolve: { alias },
    plugins: [react()],
    build: {
      minify: 'esbuild',
      // CSP has no font-src data:, so font subsets must stay as files.
      assetsInlineLimit: 0,
      rollupOptions: { input: resolve(__dirname, 'src/renderer/index.html') }
    }
  }
})
