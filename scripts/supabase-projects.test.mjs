// Tests for the project reference list (config/supabase-projects.json) and
// its one validator (scripts/supabase-projects.mjs). A broken list must fail
// every build. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loadProjectRefs, projectRefProblems } from './supabase-projects.mjs'

const STAGING = 'kpudeppgokpjhvaqrprn'
const WAITLIST = 'hmrliwoychnqrbbydorg'
const MEMBER = 'memberprodtestonly01' // a stand-in; never a real project

test('the committed list: staging and the waitlist project as before, and the member Production project still unset', () => {
  const raw = JSON.parse(readFileSync(new URL('../config/supabase-projects.json', import.meta.url), 'utf8'))
  assert.deepEqual(Object.keys(raw).filter((k) => !k.startsWith('_')), ['staging', 'production', 'memberProduction'])
  assert.deepEqual(loadProjectRefs(), { staging: STAGING, production: WAITLIST, memberProduction: null })
  assert.deepEqual(projectRefProblems(loadProjectRefs()), [])
  // Setting it is a reviewed change, made only once the project exists.
  assert.equal(raw.memberProduction.ref, null)
})

test('accepted: the member reference unset, or set, valid and different from the others', () => {
  assert.deepEqual(projectRefProblems({ staging: STAGING, production: WAITLIST, memberProduction: null }), [])
  assert.deepEqual(projectRefProblems({ staging: STAGING, production: WAITLIST, memberProduction: MEMBER }), [])
  assert.deepEqual(projectRefProblems({ staging: STAGING, production: WAITLIST }), [])
  // The waitlist project may be unset (its builds fail closed elsewhere).
  assert.deepEqual(projectRefProblems({ staging: STAGING, production: null, memberProduction: MEMBER }), [])
})

test('refused: missing staging; malformed references; any two the same', () => {
  const cases = [
    [{ staging: null, production: WAITLIST, memberProduction: null }, /staging project reference is not configured/],
    [{ staging: '', production: WAITLIST }, /staging project reference is not configured/],
    [{ staging: 'KPUDEPPGOKPJHVAQRPRN', production: WAITLIST }, /staging project reference is malformed/],
    [{ staging: STAGING, production: 'short', memberProduction: null }, /waitlist project\) project reference is malformed/],
    [{ staging: STAGING, production: WAITLIST, memberProduction: 'memberprodtestonly0' }, /memberProduction project reference is malformed/],
    [{ staging: STAGING, production: WAITLIST, memberProduction: 'memberprodtestonly012' }, /memberProduction project reference is malformed/],
    [{ staging: STAGING, production: WAITLIST, memberProduction: 'member-prod-test-001' }, /memberProduction project reference is malformed/],
    [{ staging: STAGING, production: WAITLIST, memberProduction: 12345 }, /memberProduction project reference is malformed/],
    [{ staging: STAGING, production: WAITLIST, memberProduction: STAGING }, /staging and memberProduction project references are the same/],
    [{ staging: STAGING, production: WAITLIST, memberProduction: WAITLIST }, /waitlist project\) and memberProduction project references are the same/],
    [{ staging: STAGING, production: STAGING, memberProduction: MEMBER }, /staging and production \(the waitlist project\) project references are the same/],
  ]
  for (const [refs, message] of cases) {
    const problems = projectRefProblems(refs)
    assert.ok(problems.some((p) => message.test(p)), `${JSON.stringify(refs)}: ${problems.join('; ')}`)
  }
})
