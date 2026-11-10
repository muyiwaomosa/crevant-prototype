#!/usr/bin/env node
// The one build entry point (npm run build). Chooses what to build:
//
//   Vercel Production          always the public site build (and only once
//                              approved: see scripts/guard-build-target.mjs)
//   CREVANT_BUILD=site         the public site build (e.g. one Preview branch)
//   --site                     the public site build (npm run build:site)
//   anything else              the full app, exactly as before
//
// The public site build runs: the Production guard, the Supabase and
// waitlist checks, the launch checks, type checking, `vite build --mode
// site`, the bundle check and the secret scan. The full app build runs the
// guard, the Supabase check, type checking and `vite build`, as before.
//
// The demo branch (Vercel Production today) has its own package.json and
// never runs this file.

import { spawnSync } from 'node:child_process'

export function planBuild(env, argv = []) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  const site = argv.includes('--site') || target === 'production' || (env.CREVANT_BUILD || '').trim() === 'site'
  const steps = site
    ? [
        ['node', 'scripts/guard-build-target.mjs'],
        ['node', 'scripts/check-supabase-target.mjs'],
        ['node', 'scripts/check-waitlist-launch.mjs'],
        ['npx', 'tsc', '-b'],
        ['npx', 'vite', 'build', '--mode', 'site'],
        ['node', 'scripts/check-site-bundle.mjs', 'dist'],
        ['scripts/check-bundle-secrets.sh'],
      ]
    : [
        ['node', 'scripts/guard-build-target.mjs'],
        ['node', 'scripts/check-supabase-target.mjs'],
        ['npx', 'tsc', '-b'],
        ['npx', 'vite', 'build'],
      ]
  return { mode: site ? 'site' : 'app', target: target || 'local', steps }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const plan = planBuild(process.env, process.argv.slice(2))
  console.log(`Building the ${plan.mode === 'site' ? 'public site' : 'full app'} (target: ${plan.target}).`)
  const env = { ...process.env, CREVANT_BUILD_MODE: plan.mode }
  for (const [cmd, ...args] of plan.steps) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', env })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}
