// Tests for the production build guard. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { checkBuildTarget } from './guard-build-target.mjs'

const script = fileURLToPath(new URL('./guard-build-target.mjs', import.meta.url))
const run = (VERCEL_ENV) => {
  const env = { ...process.env }
  delete env.VERCEL_ENV
  if (VERCEL_ENV !== undefined) env.VERCEL_ENV = VERCEL_ENV
  try {
    execFileSync(process.execPath, [script], { env, stdio: 'pipe' })
    return 0
  } catch (e) {
    return e.status
  }
}

test('production is refused', () => {
  assert.equal(checkBuildTarget({ VERCEL_ENV: 'production' }).ok, false)
  assert.equal(checkBuildTarget({ VERCEL_ENV: ' Production ' }).ok, false)
  assert.equal(run('production'), 1)
})

test('preview, development and local builds are allowed', () => {
  for (const v of ['preview', 'development', '']) assert.equal(checkBuildTarget({ VERCEL_ENV: v }).ok, true)
  assert.equal(checkBuildTarget({}).ok, true)
  assert.equal(run('preview'), 0)
  assert.equal(run(undefined), 0)
})
