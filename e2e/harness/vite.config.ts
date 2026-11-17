// TEST ONLY: builds the waitlist journey harness into e2e-dist/ (never
// deployed; dist/ and the public site build are untouched).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  root: fileURLToPath(new URL('./waitlist', import.meta.url)),
  plugins: [react(), tailwindcss()],
  build: { outDir: fileURLToPath(new URL('../../e2e-dist/waitlist', import.meta.url)), emptyOutDir: true },
})
