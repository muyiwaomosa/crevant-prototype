// Which Vercel project a build is running in, from Vercel's own system
// variable VERCEL_PROJECT_ID (prj_..., set by Vercel for every build when
// "Automatically expose System Environment Variables" is on, the default).
// The known projects live in config/vercel-projects.json (reviewed PRs only).
//
// Three projects build this repository:
//   demo        crevant-prototype: Production is the frozen demo branch.
//   publicSite  splitpost: the public site (www.splitpost.ca).
//   memberApp   splitpost-app: the member app (app.splitpost.ca). Its ID is
//               null until the project exists; while null, nothing is
//               recognised as the member app (fail closed).
// If two recorded IDs are ever the same, nothing is recognised at all, so a
// copy-paste mistake can never turn one project into another.
import { readFileSync } from 'node:fs'

export const VERCEL_PROJECTS = JSON.parse(readFileSync(new URL('../config/vercel-projects.json', import.meta.url), 'utf8'))

const PROJECT_ID = /^prj_[A-Za-z0-9]{10,64}$/
const KNOWN = ['demo', 'publicSite', 'memberApp']

/** The valid project IDs recorded in the config, by name. */
export function recordedProjectIds(projects = VERCEL_PROJECTS) {
  const out = {}
  for (const name of KNOWN) {
    const id = projects[name]?.projectId
    if (typeof id === 'string' && PROJECT_ID.test(id)) out[name] = id
  }
  return out
}

/** True if two recorded projects share an ID: a configuration mistake. */
export function hasDuplicateProjectIds(projects = VERCEL_PROJECTS) {
  const ids = Object.values(recordedProjectIds(projects))
  return new Set(ids).size !== ids.length
}

/**
 * 'publicSite', 'demo', 'memberApp', 'unknown' (an ID we don't recognise, or
 * a config with duplicate IDs) or 'none' (no ID: not on Vercel, or the
 * variable isn't exposed).
 */
export function identifyProject(env, projects = VERCEL_PROJECTS) {
  const id = (env.VERCEL_PROJECT_ID || '').trim()
  if (!id) return 'none'
  if (!PROJECT_ID.test(id)) return 'unknown'
  if (hasDuplicateProjectIds(projects)) return 'unknown'
  // The demo keeps its original rule: its ID is recognised as written.
  if (projects.demo?.projectId && id === projects.demo.projectId) return 'demo'
  const recorded = recordedProjectIds(projects)
  if (recorded.publicSite && id === recorded.publicSite) return 'publicSite'
  if (recorded.memberApp && id === recorded.memberApp) return 'memberApp'
  return 'unknown'
}
