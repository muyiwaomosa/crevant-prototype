// Unit tests for the A3 proxy diagnostic only (temporary branch). The main
// vitest.config.ts doesn't include diagnostics/, by design.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  test: { include: ['diagnostics/**/*.test.ts'] },
})
