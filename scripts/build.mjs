#!/usr/bin/env node
// The one build entry point (npm run build). Chooses what to build:
//
//   the splitpost-app project  always the member app (the full app), Previews
//   (memberApp)                and Production alike; Production only once
//                              approved, from main, against the staging
//                              (pilot) Supabase project (guard-build-target,
//                              check-supabase-target, check-member-app-bundle)
//   Vercel Production          otherwise always the public site build (and
//                              only once approved, in the splitpost project,
//                              from main: see scripts/guard-build-target.mjs)
//   the splitpost project      always the public site build, Previews too:
//                              that project serves only the landing page
//   CREVANT_BUILD=site         the public site build (e.g. one Preview branch)
//   --site                     the public site build (npm run build:site)
//   anything else              the full app, exactly as before
//
// The public site build runs: the Production guard, the Supabase and
// waitlist checks, the launch checks, the photo approval check, type checking, `vite build --mode
// site`, the bundle check and the secret scan. The full app build runs the
// guard, the Supabase check, type checking and `vite build`, as before. The
// member app build runs the same, then a bundle check that it can reach only
// the staging (pilot) project, never the Production waitlist project.
//
// The demo branch (Vercel Production today) has its own package.json and
// never runs this file.

import { spawnSync } from 'node:child_process'
import { VERCEL_PROJECTS, identifyProject } from './vercel-project.mjs'

export function planBuild(env, argv = [], projects = VERCEL_PROJECTS) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  const project = identifyProject(env, projects)
  // The member app project builds only the member app, whatever else is set.
  if (project === 'memberApp') {
    return {
      mode: 'app',
      target: target || 'local',
      memberApp: true,
      steps: [
        ['node', 'scripts/guard-build-target.mjs'],
        ['node', 'scripts/check-supabase-target.mjs'],
        ['npx', 'tsc', '-b'],
        ['npx', 'vite', 'build'],
        ['node', 'scripts/check-member-app-bundle.mjs', 'dist'],
        ['scripts/check-bundle-secrets.sh'],
      ],
    }
  }
  const site = argv.includes('--site') || target === 'production' || (env.CREVANT_BUILD || '').trim() === 'site' || project === 'publicSite'
  const steps = site
    ? [
        ['node', 'scripts/guard-build-target.mjs'],
        ['node', 'scripts/check-supabase-target.mjs'],
        ['node', 'scripts/check-waitlist-launch.mjs'],
        ['node', 'scripts/check-photo-approvals.mjs'],
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

/**
 * The environment every build step runs with. CREVANT_MEMBER_APP_BUILD is
 * always set here, never taken from the project's settings: "true" only for
 * the member app build, so member-only routing is compiled in on every
 * address it serves (vite.config.ts), and "" for every other build.
 */
export function stepEnv(plan, env) {
  return { ...env, CREVANT_BUILD_MODE: plan.mode, CREVANT_MEMBER_APP_BUILD: plan.memberApp ? 'true' : '' }
}

const isMain = import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  const plan = planBuild(process.env, process.argv.slice(2))
  console.log(`Building the ${plan.memberApp ? 'member app' : plan.mode === 'site' ? 'public site' : 'full app'} (target: ${plan.target}).`)
  const env = stepEnv(plan, process.env)
  for (const [cmd, ...args] of plan.steps) {
    const r = spawnSync(cmd, args, { stdio: 'inherit', env })
    if (r.status !== 0) process.exit(r.status ?? 1)
  }
}
