#!/usr/bin/env node
// Defence in depth for Vercel Production.
//
// Two Vercel projects build this repository:
//   * `crevant-prototype` (the demo project): Production tracks `demo`, the
//     frozen demo. The demo branch has its own package.json and never runs
//     this file, so nothing here can change or block the frozen demo.
//   * `splitpost` (the public site project): Production serves the public
//     landing page (splitpost.ca), built from `main`.
//
// A build of THIS branch for Vercel Production is allowed only when ALL of
// these are true:
//   1. it is the public site build (CREVANT_BUILD_MODE=site, set by
//      scripts/build.mjs, which always builds the site for Production);
//   2. the founder has approved it, with CREVANT_PRODUCTION_SITE_APPROVED=true
//      in that project's Production environment variables;
//   3. it runs in the public site project: Vercel's VERCEL_PROJECT_ID equals
//      publicSite.projectId in config/vercel-projects.json, and is never the
//      demo project's ID (scripts/vercel-project.mjs);
//   4. Vercel built it from Git: repository muyiwaomosa/crevant-prototype,
//      branch main (VERCEL_GIT_REPO_OWNER, VERCEL_GIT_REPO_SLUG,
//      VERCEL_GIT_COMMIT_REF).
// Anything missing or unexpected fails the build. So the approval variable
// set in the wrong project, the demo project switched to `main`, a full app
// build, another branch or a CLI upload can never reach Production.
//
// It cannot stop "Promote to Production" on an existing preview, because that
// reuses a build without running it again. The runtime fallback in
// src/entry.ts covers that case for the full app. Never promote a preview.
//
// Removing or loosening this guard requires a reviewed pull request.
import { VERCEL_PROJECTS, identifyProject } from './vercel-project.mjs'

export function checkBuildTarget(env, projects = VERCEL_PROJECTS) {
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
  const project = identifyProject(env, projects)
  if (project === 'demo') {
    return { ok: false, message: 'Refusing to build the public site in the demo project (crevant-prototype). Its Production must stay on the `demo` branch. The public site deploys only from the splitpost project.' }
  }
  if (project === 'none') {
    return {
      ok: false,
      message:
        'Refusing to build for Vercel Production: VERCEL_PROJECT_ID is missing, so the project cannot be identified. ' +
        'In the splitpost project, turn on Settings, Environment Variables, "Automatically expose System Environment Variables".',
    }
  }
  if (project !== 'publicSite') {
    return {
      ok: false,
      message: projects.publicSite?.projectId
        ? 'Refusing to build for Vercel Production: this is not the splitpost project (VERCEL_PROJECT_ID does not match config/vercel-projects.json).'
        : 'Refusing to build for Vercel Production: the splitpost project ID is not recorded yet (config/vercel-projects.json, publicSite.projectId). Add it in a reviewed pull request.',
    }
  }
  const repo = projects.repository || {}
  const get = (k) => (env[k] || '').trim()
  if (get('VERCEL_GIT_REPO_OWNER') !== repo.owner || get('VERCEL_GIT_REPO_SLUG') !== repo.slug) {
    return { ok: false, message: `Refusing to build for Vercel Production: not a Git build of ${repo.owner}/${repo.slug}. Production deploys only from Git, never from an upload.` }
  }
  if (get('VERCEL_GIT_COMMIT_REF') !== repo.productionBranch) {
    return { ok: false, message: `Refusing to build for Vercel Production from branch "${get('VERCEL_GIT_COMMIT_REF') || '(none)'}". Production builds only \`${repo.productionBranch}\`.` }
  }
  return { ok: true, message: `Build target: production, public site build (approved), project ${projects.publicSite.name}, ${repo.owner}/${repo.slug}@${repo.productionBranch}.` }
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
