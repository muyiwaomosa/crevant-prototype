// The Supabase project references every build check uses, from
// config/supabase-projects.json, and the one validator for them. A broken
// list fails every build (fail closed):
//
//   staging           required, a valid reference (development, testing,
//                     and the member app's Previews)
//   production        the WAITLIST project: optional (the waitlist fails
//                     closed while it is unset), valid if set
//   memberProduction  the member app's Production project: null until it is
//                     provisioned and recorded in a reviewed PR; valid if set
//
// Every reference that is set must be different from the others. The member
// Production reference only ever comes from this reviewed file, never from
// a build's environment variables.
import { readFileSync } from 'node:fs'

export const REF = /^[a-z0-9]{20}$/

/** { staging, production, memberProduction }, each a reference or null. */
export function loadProjectRefs(raw = JSON.parse(readFileSync(new URL('../config/supabase-projects.json', import.meta.url), 'utf8'))) {
  return {
    staging: raw?.staging?.ref ?? null,
    production: raw?.production?.ref ?? null,
    memberProduction: raw?.memberProduction?.ref ?? null,
  }
}

/** Problems with a set of references; [] when they are sound. */
export function projectRefProblems(refs) {
  const problems = []
  const where = 'config/supabase-projects.json'
  const named = [
    ['staging', refs?.staging, true],
    ['production (the waitlist project)', refs?.production, false],
    ['memberProduction', refs?.memberProduction, false],
  ]
  for (const [name, ref, required] of named) {
    if (ref === null || ref === undefined || ref === '') {
      if (required) problems.push(`the ${name} project reference is not configured (${where})`)
    } else if (typeof ref !== 'string' || !REF.test(ref)) {
      problems.push(`the ${name} project reference is malformed (${where}): it must be 20 lowercase letters and digits`)
    }
  }
  const set = named.filter(([, ref]) => typeof ref === 'string' && REF.test(ref))
  for (let i = 0; i < set.length; i++) {
    for (let j = i + 1; j < set.length; j++) {
      if (set[i][1] === set[j][1]) problems.push(`the ${set[i][0]} and ${set[j][0]} project references are the same (${where})`)
    }
  }
  return problems
}

export const NAME = /^[a-z0-9][a-z0-9-]{0,62}$/
export const REGION = /^[a-z]{2}-[a-z]+-[0-9]$/

/** The member Production project's { ref, name, region } (each may be null). */
export function loadMemberProduction(raw = JSON.parse(readFileSync(new URL('../config/supabase-projects.json', import.meta.url), 'utf8'))) {
  const m = raw?.memberProduction ?? {}
  return { ref: m.ref ?? null, name: m.name ?? null, region: m.region ?? null }
}

/**
 * Problems with the member Production identity; [] when sound. While the
 * reference is null the project isn't provisioned: name and region may be
 * null too (deployments refuse anyway). Once anything is set, all three must
 * be set, valid and consistent.
 */
export function memberProductionProblems(m) {
  const where = 'config/supabase-projects.json memberProduction'
  const set = [m?.ref, m?.name, m?.region].filter((v) => v !== null && v !== undefined && v !== '')
  if (set.length === 0) return []
  const problems = []
  if (set.length !== 3) problems.push(`${where}: ref, name and region must be set together`)
  if (m.ref && !REF.test(m.ref)) problems.push(`${where}: the ref is malformed`)
  if (m.name && !NAME.test(m.name)) problems.push(`${where}: the name is malformed`)
  if (m.region && !REGION.test(m.region)) problems.push(`${where}: the region is malformed`)
  return problems
}
