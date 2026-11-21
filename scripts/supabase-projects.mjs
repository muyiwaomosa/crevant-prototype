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
