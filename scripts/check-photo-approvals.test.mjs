// Tests for the photo approval gate. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPhotoApprovals } from './check-photo-approvals.mjs'

const list = (photos) => ({ photos })

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

test('the real list holds every photo as pending today, so Production stays blocked until the founder approves them', () => {
  assert.equal(checkPhotoApprovals({ VERCEL_ENV: 'production' }).ok, false)
})
