// Safe descriptions of HTTP replies and errors for e2e test output (CI logs).
//
// A test's failure detail must never print a reply's free text: an unexpected
// body could carry a token, a signed link, an email address or a stack trace.
// describe() prints only the status, time, content type and size, an error
// code if it is on the SAFE_CODES list (or a five-character PostgreSQL error
// class), and top-level number and true/false fields. scrub() masks
// connection-string passwords, JWTs and Supabase keys in error messages.
'use strict'
const { readFileSync } = require('node:fs')
const path = require('node:path')

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The post-media function's codes (handler.ts, image.ts, index.ts), the Edge
// runtime's, and the database's (raised as P0001, passed on by PostgREST).
const SAFE_CODES = new Set([
  'not_signed_in', 'no_pilot_access', 'profile_incomplete', 'rate_limited', 'not_moderator', 'not_found',
  'photos_unavailable', 'photo_limit', 'storage_full', 'upload_expired', 'too_many', 'invalid_request',
  'method_not_allowed', 'not_founder', 'storage_unavailable', 'too_large', 'unknown', 'unavailable',
  'not_jpeg', 'wrong_size', 'not_decodable',
  'WORKER_LIMIT', 'WORKER_ERROR', 'BOOT_ERROR', 'EARLY_DROP',
  'upload_not_ready',
  // Video posts (20261213000000).
  'videos_unavailable', 'not_tester', 'video_too_large', 'video_too_long', 'video_limit', 'video_quota',
  'video_codec', 'video_dimensions', 'video_size', 'video_missing', 'not_mp4', 'upload_missing',
])

function describe(r) {
  const j = r?.json
  const parts = [`${r?.status} in ${r?.ms ?? '?'} ms`]
  const type = r?.headers?.get?.('content-type')?.match(/^[a-z]+\/[a-z0-9.+-]+/)?.[0]
  if (type) parts.push(type)
  if (typeof r?.bytes === 'number') parts.push(`${r.bytes} bytes`)
  if (j && typeof j === 'object' && !Array.isArray(j)) {
    for (const k of ['error', 'code', 'message']) {
      const v = j[k]
      if (v === undefined || v === null) continue
      if (typeof v === 'string' && SAFE_CODES.has(v)) parts.push(`${k}=${v}`)
      else if (k === 'code' && typeof v === 'string' && /^[0-9A-Z]{5}$/.test(v)) parts.push(`code=${v}`)
      else parts.push(`${k} withheld`)
    }
    for (const [k, v] of Object.entries(j)) {
      if (['error', 'code', 'message'].includes(k)) continue
      if (/^[A-Za-z_]{1,32}$/.test(k) && ((typeof v === 'number' && Number.isFinite(v)) || typeof v === 'boolean')) parts.push(`${k}=${v}`)
    }
    if (typeof j.uploadId === 'string') parts.push(`uploadId ${UUID.test(j.uploadId) ? 'present' : 'malformed'}`)
  } else if (j !== null && j !== undefined && j !== '') {
    parts.push(typeof j === 'string' && UUID.test(j) ? 'an id' : 'body withheld')
  }
  return parts.join(', ')
}

function scrub(text) {
  return String(text)
    .replace(/(:\/\/[^:/@\s]+):[^@/\s]+@/g, '$1:***@')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '***')
    .replace(/sb_(secret|publishable)_[A-Za-z0-9_-]+/g, 'sb_$1_***')
    .replace(/([?&](token|apikey|key|sig|signature)=)[^&\s"']+/gi, '$1***')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/g, 'Bearer ***')
}

// Error codes in the post-media function's source that SAFE_CODES lacks.
function unlistedCodes(root = path.join(__dirname, '..', '..')) {
  const dir = path.join(root, 'supabase', 'functions', 'post-media')
  const found = new Set()
  for (const f of ['handler.ts', 'image.ts', 'index.ts']) {
    const src = readFileSync(path.join(dir, f), 'utf8')
    for (const m of src.matchAll(/(?:error|code): '([a-z_]+)'|ImageRejected\('([a-z_]+)'\)/g)) found.add(m[1] ?? m[2])
    const known = src.match(/const KNOWN = new Set\(\[([^\]]*)\]\)/)
    if (known) for (const m of known[1].matchAll(/'([a-z_]+)'/g)) found.add(m[1])
  }
  return [...found].filter((c) => !SAFE_CODES.has(c)).sort()
}

module.exports = { UUID, SAFE_CODES, describe, scrub, unlistedCodes }
