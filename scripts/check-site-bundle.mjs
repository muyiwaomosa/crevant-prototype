#!/usr/bin/env node
// Inspects a public site build (npm run build:site) and fails if it contains
// anything beyond the landing page, /join and the sample tour: sign in or
// account code, the Supabase client, member routes, Supabase project
// addresses or keys, or anything that looks like a secret.
//
// This is the check a future Production build must pass. It reads the built
// files, so it catches member code however it got there.
//
// Usage: node scripts/check-site-bundle.mjs [dir]   (default: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/** [label, pattern] pairs that must never appear in the public site. */
export const FORBIDDEN = [
  // Supabase client and its services
  ['Supabase client library', /supabase-js|GoTrueClient/],
  ['Supabase Auth API', /auth\/v1/],
  ['Supabase Data API', /rest\/v1/],
  ['Supabase Storage or Realtime', /(storage|realtime)\/v1/],
  ['sign in or password code', /signInWithPassword|signInWithOtp|resetPasswordForEmail|verifyOtp|updateUser\(/],
  // Member pages
  ['a member route', /["'`]\/?(sign-in|forgot-password|auth\/confirm|auth\/set-password|app\/account)["'`/]/],
  ['the members area route', /["'`]\/app["'`]/],
  ['member page text', /Your profile is ready|Sign out of all devices|Set your password/],
  // Project addresses and keys
  ['a Supabase project address', /[a-z0-9]{20}\.supabase\.(co|com)/],
  ['a Supabase key', /sb_(publishable|secret)_[A-Za-z0-9_-]{8,}/],
  ['a JSON Web Token', /eyJhbGciOi[A-Za-z0-9_-]{10,}\./],
  ['a secret', /service_role|sk_(live|test)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

const TEXT = /\.(js|mjs|css|html|json|map|txt|svg)$/

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

/** Returns a list of problems; empty means the build is a clean public site. */
export function checkSiteBundle(dir) {
  const problems = []
  let all
  try {
    all = files(dir)
  } catch {
    return [`${dir} not found; run npm run build:site first`]
  }
  const indexPath = join(dir, 'index.html')
  const index = all.includes(indexPath) ? readFileSync(indexPath, 'utf8') : ''
  if (!/<meta name="crevant-build" content="public-site"/.test(index)) {
    problems.push('index.html is not a public site build (missing the crevant-build marker)')
  }
  if (/\/src\//.test(index)) problems.push('index.html still points at source files')
  if (all.some((f) => f.endsWith('.map'))) problems.push('the build includes source maps')
  for (const f of all.filter((p) => TEXT.test(p))) {
    const text = readFileSync(f, 'utf8')
    for (const [label, re] of FORBIDDEN) {
      const m = text.match(re)
      if (m) problems.push(`${relative(dir, f)}: ${label} (${JSON.stringify(m[0].slice(0, 40))})`)
    }
  }
  return problems
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const dir = process.argv[2] || 'dist'
  const problems = checkSiteBundle(dir)
  if (problems.length) {
    console.error(`\n✖ ${dir} is not a clean public site build:`)
    for (const p of problems) console.error(`  ${p}`)
    process.exit(1)
  }
  console.log(`Public site build is clean: no member pages, sign in code, Supabase client, project addresses, keys or secrets (${dir}).`)
}
