import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      // Script tests (scripts/*.test.mjs) use Node's own runner: see `npm test`.
      include: ['src/**/*.test.{ts,tsx}'],
    },
  }),
)
