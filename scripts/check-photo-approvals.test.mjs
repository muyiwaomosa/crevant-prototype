// Tests for the photo approval gate. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { approvalsSource, checkPhotoApprovals, runPhotoApprovalCheck } from './check-photo-approvals.mjs'

const list = (photos) => ({ photos })
const FIXTURE = 'scripts/e2e/fixtures/photo-approvals.all-approved.json'

test('fails a Production build while any photo is pending', () => {
  const r = checkPhotoApprovals({ VERCEL_ENV: 'production' }, list({ a: 'approved', b: 'pending' }))
  assert.equal(r.ok, false)
  assert.match(r.message, /\bb\b/)
})

test('passes a Production build once every photo is approved', () => {
  assert.equal(checkPhotoApprovals({ VERCEL_ENV: 'production' }, list({ a: 'approved', b: 'approved' })).ok, true)
})

test('lets Previews and local builds through, reporting what is pending', () => {
  for (const env of [{ VERCEL_ENV: 'preview' }, {}]) {
    const r = checkPhotoApprovals(env, list({ a: 'pending' }))
    assert.equal(r.ok, true)
    assert.match(r.message, /1 pending/)
  }
})

test('rejects any status other than pending or approved', () => {
  assert.equal(checkPhotoApprovals({}, list({ a: 'yes' })).ok, false)
})

test('the real registry holds every photo as pending today, so a real Production build is refused', () => {
  assert.equal(runPhotoApprovalCheck({ VERCEL_ENV: 'production' }).ok, false)
  assert.equal(runPhotoApprovalCheck({ VERCEL_ENV: 'production', VERCEL: '1' }).ok, false)
})

test('a test fixture can stand in for approval outside Vercel, and is named in the output', () => {
  const r = runPhotoApprovalCheck({ VERCEL_ENV: 'production', CREVANT_PHOTO_APPROVALS_FIXTURE: FIXTURE })
  assert.equal(r.ok, true)
  assert.match(r.message, /test fixture/)
})

test('a fixture is refused on Vercel, so it can never replace the founder-approved registry in a real deployment', () => {
  for (const env of ['production', 'preview']) {
    const r = runPhotoApprovalCheck({ VERCEL: '1', VERCEL_ENV: env, CREVANT_PHOTO_APPROVALS_FIXTURE: FIXTURE })
    assert.equal(r.ok, false, env)
  }
})

test('a fixture must live in scripts/e2e/fixtures/', () => {
  for (const path of ['src/public/landing/photo-approvals.json', '/tmp/approved.json', 'scripts/e2e/fixtures/../../../package.json']) {
    assert.equal(approvalsSource({ CREVANT_PHOTO_APPROVALS_FIXTURE: path }).ok, false, path)
  }
})

test('the fixture lists exactly the photos in the real registry', () => {
  const real = JSON.parse(readFileSync(new URL('../src/public/landing/photo-approvals.json', import.meta.url), 'utf8'))
  const fixture = JSON.parse(readFileSync(new URL(`../${FIXTURE}`, import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(fixture.photos).sort(), Object.keys(real.photos).sort())
})
