#!/usr/bin/env node
// Writes, or checks, supabase/functions/_shared/projects.ts: the Supabase
// project references the Edge Functions may serve, generated from
// config/supabase-projects.json (the one reviewed source). Functions have no
// runtime override for them, so changing a reference always needs a reviewed PR
// that changes config and regenerates this file in the same commit.
//
//   node scripts/functions/projects-sync.mjs --check   exit 1 if the file differs (CI)
//   node scripts/functions/projects-sync.mjs --write   regenerate it
import { readFileSync, writeFileSync } from 'node:fs'
import { loadProjectRefs, projectRefProblems } from '../supabase-projects.mjs'

const OUT = new URL('../../supabase/functions/_shared/projects.ts', import.meta.url)

export function render(refs) {
  const q = (v) => (v === null ? 'null' : `'${v}'`)
  return [
    '// GENERATED from config/supabase-projects.json by scripts/functions/projects-sync.mjs.',
    '// Do not edit by hand: change the config in a reviewed PR and regenerate this file.',
    '// The Edge Functions read these references only from here (no runtime override).',
    `export const STAGING_REF: string = ${q(refs.staging)}`,
    `export const WAITLIST_REF: string | null = ${q(refs.production)}`,
    '// null until member Production is provisioned: then no function serves it.',
    `export const MEMBER_PRODUCTION_REF: string | null = ${q(refs.memberProduction)}`,
    '',
  ].join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const refs = loadProjectRefs()
  const problems = projectRefProblems(refs)
  if (problems.length) {
    console.error(problems.join('\n'))
    process.exit(1)
  }
  const want = render(refs)
  const mode = process.argv[2]
  if (mode === '--write') {
    writeFileSync(OUT, want)
    console.log('Wrote supabase/functions/_shared/projects.ts')
  } else if (mode === '--check') {
    let have = ''
    try { have = readFileSync(OUT, 'utf8') } catch {}
    if (have !== want) {
      console.error('supabase/functions/_shared/projects.ts does not match config/supabase-projects.json. Run: node scripts/functions/projects-sync.mjs --write')
      process.exit(1)
    }
    console.log('supabase/functions/_shared/projects.ts matches config/supabase-projects.json')
  } else {
    console.error('usage: projects-sync.mjs --check | --write')
    process.exit(2)
  }
}
