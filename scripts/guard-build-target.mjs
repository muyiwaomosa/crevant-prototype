#!/usr/bin/env node
// Defence in depth: refuse to build this branch for Vercel Production.
//
// The primary safeguard is Vercel's production branch setting, which is
// `demo` (Settings, Environments, Production, Branch Tracking). This guard is
// an extra layer: if that setting were ever changed to a branch containing
// this file, the production build fails instead of replacing the demo.
//
// It cannot stop "Promote to Production" on an existing preview, because that
// reuses a build without running it again. The runtime fallback in
// src/entry.ts covers that case. Never promote a preview of `main`.
//
// Removing or loosening this guard requires a reviewed pull request.

export function checkBuildTarget(env) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  if (target === 'production') {
    return {
      ok: false,
      message:
        'Refusing to build for Vercel Production. Production must be built from the `demo` branch. ' +
        'Check Vercel: Settings, Environments, Production, Branch Tracking.',
    }
  }
  return { ok: true, message: `Build target: ${target || 'local'} (not production).` }
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
