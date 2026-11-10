#!/usr/bin/env node
// Runs in every public site build (scripts/build.mjs). Fails the build if:
//
//   - a Vercel Production build turns the waitlist form on without an
//     APPROVED privacy notice (src/public/privacy/approved-notice.json) whose
//     version is exactly VITE_PRIVACY_NOTICE_VERSION, published at /privacy,
//     or with a test notice;
//   - search indexing is requested anywhere except an approved Production
//     build of the public site.
//
// (The browser code refuses to show the form without an approved notice in
// every build; this makes a misconfigured Production build fail loudly too.)

import { readFileSync } from 'node:fs'

const approved = JSON.parse(readFileSync(new URL('../src/public/privacy/approved-notice.json', import.meta.url), 'utf8'))

export function checkWaitlistLaunch(env, notice = approved) {
  const get = (k) => (typeof env[k] === 'string' ? env[k].trim() : '')
  const production = get('VERCEL_ENV').toLowerCase() === 'production'
  const fail = (message) => ({ ok: false, message })

  if (get('CREVANT_ALLOW_INDEXING') === 'true' && !(production && get('CREVANT_PRODUCTION_SITE_APPROVED') === 'true')) {
    return fail('CREVANT_ALLOW_INDEXING may only be set for an approved Vercel Production build of the public site.')
  }
  if (production && get('VITE_WAITLIST_FORM_ENABLED') === 'true') {
    const version = typeof notice.version === 'string' ? notice.version : null
    if (!version || typeof notice.effectiveDate !== 'string') return fail('The waitlist form is on, but no privacy notice has been approved (src/public/privacy/approved-notice.json).')
    if (/test/i.test(version)) return fail('The waitlist form is on with a test privacy notice. Production needs the approved notice.')
    if (get('VITE_PRIVACY_NOTICE_VERSION') !== version) return fail(`VITE_PRIVACY_NOTICE_VERSION must be the approved notice version (${version}).`)
    if (get('VITE_PRIVACY_NOTICE_URL') !== '/privacy') return fail('VITE_PRIVACY_NOTICE_URL must be /privacy, where the approved notice is published.')
  }
  return { ok: true, message: `Waitlist launch checks passed (form ${get('VITE_WAITLIST_FORM_ENABLED') === 'true' ? 'on' : 'off'}, indexing ${get('CREVANT_ALLOW_INDEXING') === 'true' ? 'requested' : 'off'}).` }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const result = checkWaitlistLaunch(process.env)
  if (!result.ok) {
    console.error(`\n✖ ${result.message}\n`)
    process.exit(1)
  }
  console.log(result.message)
}
