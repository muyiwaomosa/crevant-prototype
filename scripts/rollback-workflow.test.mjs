// Regression tests for the staging rollback workflow's two activation
// safeguards (node --test, run by npm test). Both read the workflow file
// itself, and fail if its structure can't be found, so they can't pass
// vacuously.
//
// 1. Who may run it: both jobs' conditions are evaluated for fresh runs and
//    re-runs. A re-run started by anyone but the owner must be rejected,
//    even though github.actor stays the original (owner) on a re-run.
// 2. Where the switch may live: GitHub merges organization, repository and
//    environment variables into one `vars` value, and gives environment
//    variables only to jobs that reference the environment. The scripts of
//    both jobs' switch steps are run with bash under that resolution, for
//    every placement of WAITLIST_ROLLBACK_ENABLED. Only a value of exactly
//    "true" in the staging environment, and nowhere else, may get through.
//    It must also fail closed if GitHub ever showed environment variables
//    to a job without the environment.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const WF = new URL('../.github/workflows/waitlist-rollback-staging.yml', import.meta.url)
const lines = readFileSync(WF, 'utf8').split('\n')

/** The jobs, by name, each with its own lines (two-space job keys under `jobs:`). */
function jobs() {
  const start = lines.indexOf('jobs:')
  assert.ok(start > 0, 'no jobs: section')
  const out = {}
  let name = null
  for (const line of lines.slice(start + 1)) {
    const m = /^ {2}([a-z0-9-]+):$/.exec(line)
    if (m) out[(name = m[1])] = []
    else if (name && (line.startsWith('   ') || line.trim() === '' || line.startsWith('  #'))) out[name].push(line)
    else if (name && /^\S/.test(line)) break
  }
  return out
}
const key = (job, k) => job.map((l) => new RegExp(`^ {4}${k}: (.*)$`).exec(l)).find(Boolean)?.[1]

/** Steps of a job: name, env (name -> expression) and run script. */
function steps(job) {
  const out = []
  let cur = null
  let section = null
  for (const line of job) {
    let m
    if ((m = /^ {6}- name: (.*)$/.exec(line))) out.push((cur = { name: m[1], env: {}, run: '' })), (section = null)
    else if (!cur) continue
    else if (/^ {8}env:$/.test(line)) section = 'env'
    else if ((m = /^ {8}run: \|$/.exec(line))) section = 'run'
    else if ((m = /^ {8}run: (.+)$/.exec(line))) (cur.run = m[1]), (section = null)
    else if (/^ {8}\S/.test(line)) section = null
    else if (section === 'env' && (m = /^ {10}([A-Z_]+): (.*)$/.exec(line))) cur.env[m[1]] = m[2]
    else if (section === 'run' && (line.startsWith('          ') || line.trim() === '')) cur.run += `${line.slice(10)}\n`
  }
  return out
}

/**
 * A strict evaluator for the only expression form these conditions may use:
 * clauses joined by &&, each `a == b` with a and b either github.<name> or
 * a quoted literal. Anything else throws, so a changed condition can't be
 * silently misread as passing.
 */
function evaluate(expr, github) {
  return expr.split('&&').every((clause) => {
    const m = /^\s*(github\.[a-z_]+|'[^']*')\s*==\s*(github\.[a-z_]+|'[^']*')\s*$/.exec(clause)
    if (!m) throw new Error(`unsupported condition: ${clause}`)
    const val = (t) => (t.startsWith("'") ? t.slice(1, -1) : github[t.slice('github.'.length)])
    const [a, b] = [val(m[1]), val(m[2])]
    if (a === undefined || b === undefined) throw new Error(`unknown context in: ${clause}`)
    return a === b
  })
}

const J = jobs()
const scope = J['switch-scope']
const rollback = J.rollback

test('the workflow has exactly the switch-scope job and the rollback job, in that order', () => {
  assert.deepEqual(Object.keys(J), ['switch-scope', 'rollback'])
  assert.equal(key(scope, 'environment'), undefined, 'the switch-scope job must not reference any environment')
  assert.equal(key(rollback, 'environment'), 'staging')
  assert.equal(key(rollback, 'needs'), 'switch-scope', 'the rollback job must wait for the switch-scope job')
})

test('only the owner may start or re-run either job, and only from main', () => {
  const OWNER = 'muyiwaomosa'
  const run = (over) => ({ ref: 'refs/heads/main', repository_owner: OWNER, actor: OWNER, triggering_actor: OWNER, ...over })
  const scenarios = [
    ['the owner starts it from main', run({}), true],
    ['the owner re-runs their own run', run({ actor: OWNER, triggering_actor: OWNER }), true],
    ["a collaborator re-runs the owner's run (actor stays the owner)", run({ actor: OWNER, triggering_actor: 'collaborator' }), false],
    ['a collaborator starts it', run({ actor: 'collaborator', triggering_actor: 'collaborator' }), false],
    ["the owner re-runs a collaborator's run", run({ actor: 'collaborator', triggering_actor: OWNER }), false],
    ['the owner starts it from another branch', run({ ref: 'refs/heads/claude/x' }), false],
    ['a bot re-runs it', run({ triggering_actor: 'github-actions[bot]' }), false],
  ]
  for (const [name, job] of [['switch-scope', scope], ['rollback', rollback]]) {
    const cond = key(job, 'if')
    assert.ok(cond, `${name} has no condition`)
    assert.match(cond, /github\.triggering_actor == github\.repository_owner/, `${name} must check who started this attempt`)
    assert.match(cond, /github\.actor == github\.repository_owner/, `${name} must check who started the run`)
    for (const [what, ctx, want] of scenarios) assert.equal(evaluate(cond, ctx), want, `${name}: ${what}`)
  }
})

/** Runs one step's script with its env expressions resolved from `vars`. */
function runStep(step, vars) {
  const env = { PATH: process.env.PATH }
  for (const [k, expr] of Object.entries(step.env)) {
    const m = /^\$\{\{ vars\.([A-Z_]+) \}\}$/.exec(expr)
    if (m) env[k] = vars[m[1]] ?? ''
  }
  return spawnSync('bash', ['-c', `set -euo pipefail\n${step.run}`], { env, encoding: 'utf8' }).status === 0
}

/** GitHub's documented resolution: environment > repository > organization, environment only for jobs that use it. */
function resolve({ org = {}, repo = {}, environment = {} }, jobUsesEnvironment, leaky = false) {
  return { ...org, ...repo, ...(jobUsesEnvironment || leaky ? environment : {}) }
}

test('only "true" in the staging environment, and nowhere else, can enable the rollback', () => {
  const scopeStep = steps(scope).find((s) => Object.values(s.env).includes('${{ vars.WAITLIST_ROLLBACK_ENABLED }}'))
  assert.ok(scopeStep, 'the switch-scope job must read WAITLIST_ROLLBACK_ENABLED')
  assert.equal(steps(scope).length, 1, 'the switch-scope job does nothing else')
  const rbSteps = steps(rollback)
  assert.ok(Object.values(rbSteps[0].env).includes('${{ vars.WAITLIST_ROLLBACK_ENABLED }}'), "the rollback job's first step must check the switch")

  const E = 'WAITLIST_ROLLBACK_ENABLED'
  const passes = (placement, leaky = false) =>
    runStep(scopeStep, resolve(placement, false, leaky)) && runStep(rbSteps[0], resolve(placement, true, leaky))
  const cases = [
    ['unset everywhere (the default)', {}, false],
    ['"true" in the staging environment only', { environment: { [E]: 'true' } }, true],
    ['"true" at repository level only', { repo: { [E]: 'true' } }, false],
    ['"true" at organization level only', { org: { [E]: 'true' } }, false],
    ['"true" in both the environment and the repository', { environment: { [E]: 'true' }, repo: { [E]: 'true' } }, false],
    ['"false" in the environment, "true" at repository level', { environment: { [E]: 'false' }, repo: { [E]: 'true' } }, false],
    ['"true" in the environment, "false" at repository level', { environment: { [E]: 'true' }, repo: { [E]: 'false' } }, false],
    ['"TRUE" in the environment', { environment: { [E]: 'TRUE' } }, false],
    ['"1" in the environment', { environment: { [E]: '1' } }, false],
    ['"yes" in the environment', { environment: { [E]: 'yes' } }, false],
  ]
  for (const [what, placement, want] of cases) assert.equal(passes(placement), want, what)
  // If GitHub ever gave environment variables to the job without one, the
  // switch-scope job would see the value and refuse: closed, not open.
  assert.equal(passes({ environment: { [E]: 'true' } }, true), false, 'fails closed if environment variables leaked to the switch-scope job')
})

test('no other workflow mentions the rollback switch', () => {
  const others = spawnSync('grep', ['-rl', 'WAITLIST_ROLLBACK_ENABLED', new URL('../.github/workflows/', import.meta.url).pathname], { encoding: 'utf8' })
  assert.deepEqual(others.stdout.trim().split('\n').map((p) => p.split('/').pop()), ['waitlist-rollback-staging.yml'])
})
