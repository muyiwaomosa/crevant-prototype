// Which Vercel project a build is running in, from Vercel's own system
// variable VERCEL_PROJECT_ID (prj_..., set by Vercel for every build when
// "Automatically expose System Environment Variables" is on, the default).
// The known projects live in config/vercel-projects.json (reviewed PRs only).
import { readFileSync } from 'node:fs'

export const VERCEL_PROJECTS = JSON.parse(readFileSync(new URL('../config/vercel-projects.json', import.meta.url), 'utf8'))

const PROJECT_ID = /^prj_[A-Za-z0-9]{10,64}$/

/** 'publicSite', 'demo', 'unknown' (an ID we don't recognise) or 'none' (no ID: not on Vercel, or the variable isn't exposed). */
export function identifyProject(env, projects = VERCEL_PROJECTS) {
  const id = (env.VERCEL_PROJECT_ID || '').trim()
  if (!id) return 'none'
  if (!PROJECT_ID.test(id)) return 'unknown'
  if (projects.demo?.projectId && id === projects.demo.projectId) return 'demo'
  if (projects.publicSite?.projectId && PROJECT_ID.test(projects.publicSite.projectId) && id === projects.publicSite.projectId) return 'publicSite'
  return 'unknown'
}
