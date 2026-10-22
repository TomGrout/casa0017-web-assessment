import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        triggers: resolve(import.meta.dirname, 'triggers.html'),
        tide: resolve(import.meta.dirname, 'tide.html'),
        method: resolve(import.meta.dirname, 'method.html'),
      },
    },
  },
  server: {
    port: 3000,
    open: true,
  },
})
