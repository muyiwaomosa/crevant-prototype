#!/usr/bin/env node
// Inspects a member app build (the full app, built in the splitpost-app
// project for app.splitpost.ca) and fails unless it can reach ONLY the
// staging (pilot) Supabase project:
//
//   * it must contain the staging project's address (the build really points
//     at the pilot database);
//   * it must never contain the Production project reference (the Production
//     waitlist database), anywhere, in any form;
//   * it must contain no other Supabase project address;
//   * it must contain no waitlist function address (members never use the
//     waitlist form);
//   * it must contain nothing that looks like a secret or service key;
//   * its index.html must carry the member app build marker, proving
//     member-only routing was compiled in (so its Previews and every other
//     address it is served from show only member pages, never the public site).
//
// It reads the built files, so it catches a wrong target however it got
// there. scripts/check-supabase-target.mjs checks the settings before the
// build; this checks the result after it. Both must pass.
//
// Usage: node scripts/check-member-app-bundle.mjs [dir]   (default: dist)
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const projects = JSON.parse(readFileSync(new URL('../config/supabase-projects.json', import.meta.url), 'utf8'))
const REF = /^[a-z0-9]{20}$/

/** Written into index.html by vite.config.ts in a member app build. */
export const MEMBER_APP_MARKER = '<meta name="crevant-build" content="member-app" />'

/** [label, pattern] pairs that must never appear in the member app. */
export const FORBIDDEN = [
  ['a waitlist function address', /functions\/v1\/join-waitlist/],
  ['a Supabase secret key', /sb_secret_[A-Za-z0-9_-]{8,}/],
  ['a database connection string', /postgres(ql)?:\/\/[^\s"'`]*@|pooler\.supabase\.(com|co)/],
  ['a secret', /service_role|sk_(live|test)_[A-Za-z0-9]|whsec_[A-Za-z0-9]|-----BEGIN [A-Z ]*PRIVATE KEY-----/],
]

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? files(p) : [p]
  })
}

/**
 * @param texts  { [path]: contents } of the built files
 * @param refs   { staging, production } project references (default: config)
 */
export function checkMemberAppBundle(texts, refs = { staging: projects.staging?.ref, production: projects.production?.ref }) {
  const problems = []
  if (!refs.staging || !REF.test(refs.staging)) return ['the staging project reference is not configured (config/supabase-projects.json)']
  if (refs.production && refs.production === refs.staging) return ['the staging and Production project references are the same (config/supabase-projects.json)']
  const stagingHost = `${refs.staging}.supabase.co`
  const html = Object.entries(texts).find(([p]) => p === 'index.html' || p.endsWith('/index.html'))
  if (!html) problems.push('index.html is missing')
  else if (!html[1].includes(MEMBER_APP_MARKER)) {
    problems.push('index.html: the member app build marker is missing, so member-only routing was not compiled in (Previews would show public pages)')
  }
  let sawStaging = false
  for (const [path, text] of Object.entries(texts)) {
    if (text.includes(stagingHost)) sawStaging = true
    if (refs.production && REF.test(refs.production) && text.includes(refs.production)) {
      problems.push(`${path}: the Production project reference (the Production waitlist database)`)
    }
    for (const m of text.matchAll(/([a-z0-9]{20})\.supabase\.(co|com)/g)) {
      if (m[1] !== refs.staging) problems.push(`${path}: a Supabase project other than staging (${m[1]})`)
    }
    for (const [label, re] of FORBIDDEN) if (re.test(text)) problems.push(`${path}: ${label}`)
  }
  if (!sawStaging) problems.push(`the build does not point at the staging (pilot) project (${stagingHost} not found)`)
  return [...new Set(problems)]
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const dir = process.argv[2] || 'dist'
  const texts = Object.fromEntries(
    files(dir)
      .filter((p) => /\.(js|mjs|css|html|json|txt|map|webmanifest)$/.test(p))
      .map((p) => [relative(dir, p), readFileSync(p, 'utf8')]),
  )
  const problems = checkMemberAppBundle(texts)
  if (problems.length) {
    console.error(`\n✖ The member app build is not safe to deploy:\n${problems.map((p) => `  - ${p}`).join('\n')}\n`)
    process.exit(1)
  }
  console.log(`Member app bundle check passed: staging (pilot) project only, ${Object.keys(texts).length} files checked.`)
}
