#!/usr/bin/env node
// Defence in depth for Vercel Production.
//
// Three Vercel projects build this repository:
//   * `crevant-prototype` (the demo project): Production tracks `demo`, the
//     frozen demo. The demo branch has its own package.json and never runs
//     this file, so nothing here can change or block the frozen demo.
//   * `splitpost` (the public site project): Production serves the public
//     landing page (splitpost.ca), built from `main`.
//   * `splitpost-app` (the member app project, pilot milestone M1):
//     Production serves the member app at app.splitpost.ca, built from
//     `main`, against the staging (pilot) Supabase project. Its project ID is
//     null in config/vercel-projects.json until the project exists, and while
//     it is null nothing is recognised as the member app (fail closed).
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
// The member app project has its own rule (memberAppProduction below). A
// build in it for Vercel Production is allowed only when ALL of these are
// true: it is the full app build (CREVANT_BUILD_MODE=app); the founder has
// approved it with CREVANT_MEMBER_APP_APPROVED=true in THAT project; the
// public site's approval variable is NOT set there (a sign of a project mix
// up); and Vercel built it from Git, muyiwaomosa/crevant-prototype@main.
// Which Supabase project it may use is checked separately, by
// scripts/check-supabase-target.mjs (staging only) and, after the build, by
// scripts/check-member-app-bundle.mjs. The public site and demo rules above
// are unchanged.
//
// It cannot stop "Promote to Production" on an existing preview, because that
// reuses a build without running it again. The runtime fallback in
// src/entry.ts covers that case for the full app. Never promote a preview.
//
// Removing or loosening this guard requires a reviewed pull request.
import { VERCEL_PROJECTS, identifyProject } from './vercel-project.mjs'

function gitProblem(env, projects) {
  const repo = projects.repository || {}
  const get = (k) => (env[k] || '').trim()
  if (!repo.owner || !repo.slug || !repo.productionBranch) return 'the repository is not recorded in config/vercel-projects.json.'
  if (get('VERCEL_GIT_REPO_OWNER') !== repo.owner || get('VERCEL_GIT_REPO_SLUG') !== repo.slug) {
    return `not a Git build of ${repo.owner}/${repo.slug}. Production deploys only from Git, never from an upload.`
  }
  if (get('VERCEL_GIT_COMMIT_REF') !== repo.productionBranch) {
    return `branch "${get('VERCEL_GIT_COMMIT_REF') || '(none)'}". Production builds only \`${repo.productionBranch}\`.`
  }
  return null
}

/** Vercel Production in the member app project (splitpost-app). Every condition must hold. */
function memberAppProduction(env, projects) {
  const fail = (why) => ({ ok: false, message: `Refusing to build the member app for Vercel Production: ${why}` })
  if ((env.CREVANT_BUILD_MODE || '').trim() !== 'app') return fail('this is not the member app (full app) build. npm run build chooses it in the member app project.')
  if ((env.CREVANT_PRODUCTION_SITE_APPROVED || '').trim() !== '') {
    return fail('CREVANT_PRODUCTION_SITE_APPROVED is set in the member app project. It belongs only to the splitpost project; remove it here.')
  }
  if ((env.CREVANT_MEMBER_APP_APPROVED || '').trim() !== 'true') {
    return fail('it has not been approved. Only after the founder approves go-live, set CREVANT_MEMBER_APP_APPROVED=true in this project\'s Production environment variables.')
  }
  const git = gitProblem(env, projects)
  if (git) return fail(git)
  const repo = projects.repository
  return { ok: true, message: `Build target: production, member app (approved), project ${projects.memberApp.name}, ${repo.owner}/${repo.slug}@${repo.productionBranch}.` }
}

export function checkBuildTarget(env, projects = VERCEL_PROJECTS) {
  const target = (env.VERCEL_ENV || '').trim().toLowerCase()
  if (target !== 'production') return { ok: true, message: `Build target: ${target || 'local'} (not production).` }
  if (identifyProject(env, projects) === 'memberApp') return memberAppProduction(env, projects)
  // Outside the member app project, the member app's approval never applies.
  if ((env.CREVANT_BUILD_MODE || '').trim() === 'site' && (env.CREVANT_MEMBER_APP_APPROVED || '').trim() !== '' && (env.CREVANT_PRODUCTION_SITE_APPROVED || '').trim() !== 'true') {
    return { ok: false, message: 'Refusing to build for Vercel Production: CREVANT_MEMBER_APP_APPROVED is set, but this is not the member app project. The public site needs its own approval (CREVANT_PRODUCTION_SITE_APPROVED).' }
  }
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
