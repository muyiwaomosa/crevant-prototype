// The browser code reads its build settings one by one, never the whole
// import.meta.env object: Vite copies every VITE_ variable of the build
// environment into the bundle wherever the whole object is used (the cause of
// the failed splitpost Preview builds on PRs #41 and #43).
// Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = fileURLToPath(new URL('../src', import.meta.url))
const files = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : []
  })
// Code only: comments are stripped first, so explaining the rule is allowed.
const code = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

test('no browser code uses the whole import.meta.env object', () => {
  const whole = files(SRC).filter((f) => /import\.meta\.env(?![.\w])/.test(code(readFileSync(f, 'utf8'))))
  assert.deepEqual(whole.map((f) => f.slice(SRC.length + 1)), [])
})

test('the waitlist reads exactly its five settings', () => {
  const config = readFileSync(join(SRC, 'public', 'waitlist', 'config.ts'), 'utf8')
  const used = [...new Set([...code(config).matchAll(/import\.meta\.env\.(VITE_[A-Z_]+)/g)].map((m) => m[1]))].sort()
  assert.deepEqual(used, ['VITE_PRIVACY_NOTICE_URL', 'VITE_PRIVACY_NOTICE_VERSION', 'VITE_TURNSTILE_SITE_KEY', 'VITE_WAITLIST_ENDPOINT', 'VITE_WAITLIST_FORM_ENABLED'])
})
