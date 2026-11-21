// Guards for the CI workflow's local Supabase jobs (node --test, run by npm
// test): the Integration and Scheduler jobs run every integration suite
// exactly once, on the same pinned CLI and start-up script, and the local
// runner (scripts/ci/local-integration.sh) runs the same suites in the same
// order. They read the files themselves and fail if the structure can't be
// found, so they can't pass vacuously.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const ci = read('.github/workflows/ci.yml')
const local = read('scripts/ci/local-integration.sh')

/** The jobs, by name, each with its own lines (two-space job keys under `jobs:`). */
function jobs() {
  const lines = ci.split('\n')
  const start = lines.indexOf('jobs:')
  assert.ok(start > 0, 'no jobs: section')
  const out = {}
  let name = null
  for (const line of lines.slice(start + 1)) {
    const m = /^ {2}([a-z0-9-]+):$/.exec(line)
    if (m) out[(name = m[1])] = []
    else if (name) out[name].push(line)
  }
  return out
}
const J = jobs()
const runs = (job) => J[job].map((l) => /^ {8}run: (scripts\/\S+)$/.exec(l)?.[1]).filter(Boolean)
const SUITE = /^scripts\/(db|e2e)\/.*\.sh$/

// The integration suites, in CI order, as they were in one job before the split.
const INTEGRATION = [
  'scripts/db/integration.sh',
  'scripts/e2e/waitlist-edge.sh',
  'scripts/e2e/waitlist-tls.sh',
  'scripts/db/rollback-test.sh',
  'scripts/db/request-ids-fallback-test.sh',
  'scripts/e2e/avatar-edge.sh',
  'scripts/e2e/post-media-edge.sh',
]
const SCHEDULER = ['scripts/db/schedule-media-drain-test.sh', 'scripts/db/staging-schedule-check-test.sh', 'scripts/db/staging-photo-cleanup-test.sh']

test('the Integration and Scheduler jobs run every integration suite, each exactly once', () => {
  assert.ok(J.integration && J.scheduler, 'both jobs exist')
  assert.deepEqual(runs('integration').filter((r) => SUITE.test(r)), INTEGRATION)
  assert.deepEqual(runs('scheduler').filter((r) => SUITE.test(r)), SCHEDULER)
  const all = Object.keys(J).flatMap((j) => runs(j))
  for (const s of [...INTEGRATION, ...SCHEDULER]) assert.equal(all.filter((r) => r === s).length, 1, `${s} runs once`)
})

test('both jobs use the same pinned Supabase CLI and start-up, and stop the stack', () => {
  const pin = (job) => J[job].map((l) => /^ {6}SUPABASE_CLI_VERSION: (\S+)$/.exec(l)?.[1]).find(Boolean)
  const staging = /^ {2}SUPABASE_CLI_VERSION: (\S+)$/m.exec(read('.github/workflows/deploy-db-staging.yml'))?.[1]
  assert.ok(staging, 'the staging workflow pins a CLI version')
  for (const job of ['integration', 'scheduler']) {
    const text = J[job].join('\n')
    assert.equal(pin(job), staging, `${job} pins the staging workflow's CLI version`)
    assert.match(text, /npm install --no-save --no-audit --no-fund --prefix "\$RUNNER_TEMP\/supabase-cli" "supabase@\$\{SUPABASE_CLI_VERSION\}"/)
    assert.match(text, /if \[ "\$installed" != "\$SUPABASE_CLI_VERSION" \]; then/, `${job} confirms the installed version`)
    assert.ok(runs(job).includes('scripts/ci/start-local-supabase.sh'), `${job} starts local Supabase the same way`)
    assert.match(text, /- name: Stop local Supabase\n {8}if: always\(\)\n {8}run: supabase stop --no-backup \|\| true/)
    assert.ok(!/continue-on-error|secrets\./.test(text), `${job}: nothing allowed to fail, no secrets`)
    // Start-up comes before every suite.
    const r = runs(job)
    assert.ok(r.indexOf('scripts/ci/start-local-supabase.sh') < r.findIndex((x) => SUITE.test(x)))
  }
})

test('the local runner runs the same suites in the same order as CI, then npm test', () => {
  const block = /^SUITES=\(\n([\s\S]*?)^\)$/m.exec(local)?.[1]
  assert.ok(block, 'no SUITES list in scripts/ci/local-integration.sh')
  const listed = [...block.matchAll(/^ {2}"[a-z-]+\|(.+)"$/gm)].map((m) => m[1])
  assert.deepEqual(listed, [...INTEGRATION, ...SCHEDULER, 'npm test'])
})

test('the local runner refuses anything but a local stack, and clears hosted connection strings', () => {
  assert.match(local, /case "\$API_URL" in http:\/\/127\.0\.0\.1:\*\|http:\/\/localhost:\*\) ;; \*\) echo "Refusing/)
  assert.match(local, /case "\$LOCAL_DB_URL" in \*@127\.0\.0\.1:\*\|\*@localhost:\*\) ;; \*\) echo "Refusing/)
  assert.match(local, /^unset STAGING_DATABASE_URL PRODUCTION_DATABASE_URL DATABASE_URL /m)
  assert.match(local, /^export DB_URL="\$LOCAL_DB_URL"$/m)
  // The checks come before the first suite runs.
  assert.ok(local.indexOf('Refusing: the database is not local') < local.indexOf('$cmd; code=$?'))
})
