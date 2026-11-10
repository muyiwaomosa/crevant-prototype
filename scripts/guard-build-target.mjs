#!/usr/bin/env node
// Defence in depth for Vercel Production.
//
// The primary safeguard is Vercel's production branch setting, which is
// `demo` (Settings, Environments, Production, Branch Tracking). The demo
// branch has its own package.json and never runs this file, so nothing here
// can change or block the frozen demo.
//
// If a build of THIS branch ever runs for Vercel Production, it is allowed
// only when BOTH are true:
//   1. it is the public site build (CREVANT_BUILD_MODE=site, set by
//      scripts/build.mjs, which always builds the site for Production), and
//   2. the founder has approved the switch, by setting
//      CREVANT_PRODUCTION_SITE_APPROVED=true in Vercel's Production
//      environment variables.
// Anything else fails the build, so an accidental branch change, a full app
// build or a missing approval can never reach Production.
//
// It cannot stop "Promote to Production" on an existing preview, because that
// reuses a build without running it again. The runtime fallback in
// src/entry.ts covers that case for the full app. Never promote a preview.
//
// Removing or loosening this guard requires a reviewed pull request.
export function checkBuildTarget(env) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  if (target !== 'production') return { ok: true, message: `Build target: ${target || 'local'} (not production).` }
  if ((env.CREVANT_BUILD_MODE || '').trim() !== 'site') {
    return {
      ok: false,
      message:
        'Refusing to build the full app for Vercel Production. Production may only ever build the public site build (npm run build chooses it). ' +
        'Check Vercel: Settings, Environments, Production, Branch Tracking (it should be `demo` until the approved switch).',
    }
  }
  if ((env.CREVANT_PRODUCTION_SITE_APPROVED || '').trim() !== 'true') {
    return {
      ok: false,
      message:
        'Refusing to build the public site for Vercel Production: the switch from the demo has not been approved. ' +
        'Only after approval, set CREVANT_PRODUCTION_SITE_APPROVED=true in Vercel Production environment variables.',
    }
  }
  return { ok: true, message: 'Build target: production, public site build (approved).' }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const result = checkBuildTarget(process.env)
  if (!result.ok) {
    console.error(`\n✖ ${result.message}\n`)
    process.exit(1)
  }
  console.log(result.message)
}
