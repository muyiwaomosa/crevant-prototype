#!/usr/bin/env node
// Founder-run, commit-pinned Edge Function deployment (Phase 1B-2).
// Runs on the founder's own computer with their `supabase login` (no access
// token is stored in GitHub) and `gh` signed in. docs/FUNCTIONS-DEPLOYMENT.md.
//
//   node scripts/functions/deploy.mjs deploy   --target <t> --function <f> --commit <sha> --confirm "DEPLOY <f> TO <ref>" --operator <label> [--db-check-run <id>]
//   node scripts/functions/deploy.mjs rollback --target <t> --function <f> --commit <sha> --confirm "ROLL BACK <f> ON <ref> TO <sha12>" --operator <label> --reason <text> [--db-check-run <id>]
//   node scripts/functions/deploy.mjs delete   --target <t> --function <f> --confirm "DELETE <f> FROM <ref>" --operator <label> --reason <text>
//
// Targets: staging, member-production (never the waitlist project).
// Functions: avatar, post-media. On member Production, avatar only, unless
// postMediaFunctionApproved is true in config/member-production.json on main.
// join-waitlist is never deployed here; it may only be DELETED, and only from
// member Production (the accident this guards against).
//
// deploy and rollback refuse, calling nothing, unless every check passes:
//   * the reference, and for member Production its name and region, come from
//     config on origin/main, are valid and consistent, are not the waitlist
//     project, and `supabase projects list` shows exactly that project with
//     that name and region;
//   * the typed phrase names the action, function, project (and commit);
//   * the commit is on origin/main; deploy: it is HEAD and the tree is clean;
//     rollback: it has a founder-approved entry on main in
//     config/function-deployments.json AND that entry's verification run
//     succeeded and matches it exactly (a verification alone authorizes nothing);
//   * member Production: --db-check-run is your successful member database
//     check run (identity marker step included), at the deploy commit (deploy)
//     or at current main (rollback), finished within 24 hours;
//   * the pinned Supabase CLI; the project holds no unexpected function.
// The deployed code is a `git archive` export of the commit, with only
// _shared/build-info.ts stamped '<commit>.<digest>'. The CLI is always called
// with one named function, --no-verify-jwt, --use-api, never --prune.
// Afterwards it checks the function list, records the version and bundle
// hash, and tries a source download comparison (reported, never assumed).
// The result is "deployed, unverified" until verify-functions.yml passes.
//
// delete needs only the exact target, function, phrase, operator and reason
// (no commit, no database run), records them in the evidence log BEFORE
// deleting, and confirms the function is gone. Redeploying needs a normal deploy.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { memberProductionProblems, NAME, REF, REGION } from '../supabase-projects.mjs'
import { importClosure, sourceDigest } from './source-digest.mjs'
import { approvedDeployment, ledgerProblems } from './ledger.mjs'

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const EVIDENCE = 'docs/function-evidence-log.md'
const DB_WORKFLOW = '.github/workflows/deploy-db-members-production.yml'
const VERIFY_WORKFLOW = '.github/workflows/verify-functions.yml'
const DB_STEP = 'Verify the database identity marker (the first connection; read only)'
const DAY_MS = 24 * 3600 * 1000

class Refused extends Error {}
const refuse = (m) => { throw new Refused(m) }

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
  } catch (e) {
    if (opts.allowFail) return null
    refuse(`${cmd} ${args[0] ?? ''} failed: ${String(e.stderr || e.message).trim().split('\n').slice(-2).join(' ')}`)
  }
}
const git = (...a) => run('git', a).trim()
const json = (text, what) => { try { return JSON.parse(text) } catch { refuse(`could not read ${what}`) } }
const sha256 = (b) => createHash('sha256').update(b).digest('hex')

export function parseArgs(argv) {
  const [action, ...rest] = argv
  const allowed = ['--target', '--function', '--commit', '--confirm', '--operator', '--reason', '--db-check-run']
  const o = { action }
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i]
    if (!allowed.includes(k)) refuse(`unknown option ${k} (only ${allowed.join(', ')}; nothing else is ever passed to the Supabase CLI, --prune least of all)`)
    const v = rest[++i]
    if (v === undefined) refuse(`${k} needs a value`)
    o[k.slice(2)] = v
  }
  if (!['deploy', 'rollback', 'delete'].includes(action)) refuse('the action must be deploy, rollback or delete')
  return o
}

/** The exact confirmation phrase for an action. */
export function phraseFor(action, fn, ref, commit) {
  if (action === 'deploy') return `DEPLOY ${fn} TO ${ref}`
  if (action === 'rollback') return `ROLL BACK ${fn} ON ${ref} TO ${commit.slice(0, 12)}`
  return `DELETE ${fn} FROM ${ref}`
}

/** The project a target names, from config on main. */
export function targetProject(target, projects) {
  const waitlist = projects?.production?.ref ?? null
  if (target === 'staging') {
    const s = projects?.staging ?? {}
    if (typeof s.ref !== 'string' || !REF.test(s.ref)) refuse('the staging reference in config is missing or malformed')
    if (s.ref === waitlist) refuse('the staging reference is the waitlist project')
    if (s.name != null && !NAME.test(s.name)) refuse('the staging name in config is malformed')
    if (s.region != null && !REGION.test(s.region)) refuse('the staging region in config is malformed')
    return { ref: s.ref, name: s.name ?? null, region: s.region ?? null }
  }
  if (target === 'member-production') {
    const m = projects?.memberProduction ?? {}
    if (m.ref == null) refuse('memberProduction.ref is null: member Production is not provisioned, so nothing can be deployed there')
    const problems = memberProductionProblems({ ref: m.ref, name: m.name ?? null, region: m.region ?? null })
    if (problems.length || m.name == null || m.region == null) refuse(`member Production's ref, name and region must all be valid and consistent: ${problems.join('; ') || 'name or region missing'}`)
    if (m.ref === projects?.staging?.ref) refuse('memberProduction.ref is the staging project')
    if (m.ref === waitlist) refuse('memberProduction.ref is the waitlist project')
    return { ref: m.ref, name: m.name, region: m.region }
  }
  refuse('the target must be staging or member-production (never the waitlist project)')
}

/** The functions a target may hold, and which may be deployed. */
export function allowedFunctions(target, memberApprovals) {
  if (target === 'staging') return { deployable: ['avatar', 'post-media'], expected: ['avatar', 'post-media', 'join-waitlist'] }
  const deployable = memberApprovals?.postMediaFunctionApproved === true ? ['avatar', 'post-media'] : ['avatar']
  return { deployable, expected: deployable }
}

/** Exactly one project with this reference, name and region. */
export function checkProjectIdentity(list, p) {
  if (!Array.isArray(list)) refuse('`supabase projects list` did not return a list')
  const hits = list.filter((x) => (x.ref ?? x.id) === p.ref)
  if (hits.length !== 1) refuse(`\`supabase projects list\` shows ${hits.length} project(s) with reference ${p.ref} (exactly one expected)`)
  const h = hits[0]
  if (p.name !== null && h.name !== p.name) refuse(`project ${p.ref} is named "${h.name}", not "${p.name}"`)
  if (p.region !== null && h.region !== p.region) refuse(`project ${p.ref} is in ${h.region}, not ${p.region}`)
  return h
}

const fnName = (f) => f.slug ?? f.name
/** Checks a function list: nothing outside the expected set. */
export function unexpectedFunctions(list, expected) {
  if (!Array.isArray(list)) refuse('`supabase functions list` did not return a list')
  return list.map(fnName).filter((n) => !expected.includes(n))
}

/** The member database identity check run: yours, check mode, at the commit, identity step passed, recent. */
export function checkDbRun(run, jobs, { owner, commit, now = Date.now() }) {
  if (!run || run.path !== DB_WORKFLOW) refuse('--db-check-run is not a run of the member Production database workflow')
  if (run.event !== 'workflow_dispatch' || run.head_branch !== 'rehearsal/members-disposable') refuse('--db-check-run was not started by hand on rehearsal/members-disposable')
  if (run.display_title !== `member database check at ${commit}`) refuse(`--db-check-run is not a check-mode run at ${commit.slice(0, 12)} (its title: "${run.display_title}")`)
  if (run.head_sha !== commit) refuse('--db-check-run ran at another commit')
  if (run.actor?.login !== owner || run.triggering_actor?.login !== owner) refuse('--db-check-run was not started (and re-run) by the repository owner')
  if (run.status !== 'completed' || run.conclusion !== 'success') refuse('--db-check-run did not succeed')
  if (!(now - Date.parse(run.updated_at) <= DAY_MS)) refuse('--db-check-run is older than 24 hours; run the member database check again')
  const steps = (jobs?.jobs ?? []).flatMap((j) => j.steps ?? [])
  const step = steps.find((s) => s.name === DB_STEP)
  if (!step || step.conclusion !== 'success') refuse('--db-check-run did not pass the database identity marker step')
}

/** The verification run recorded in a ledger entry: yours, on main, passed, for exactly this deployment. */
export function checkVerifyRun(run, entry, target, { owner }) {
  if (!run || run.path !== VERIFY_WORKFLOW) refuse('the recorded verification run is not a verify-functions run')
  if (run.id !== entry.verifyRunId) refuse('the recorded verification run id does not match')
  if (run.event !== 'workflow_dispatch' || run.head_branch !== 'rehearsal/members-disposable') refuse('the recorded verification run was not started by hand on rehearsal/members-disposable')
  if (run.actor?.login !== owner || run.triggering_actor?.login !== owner) refuse('the recorded verification run was not started by the repository owner')
  if (run.status !== 'completed' || run.conclusion !== 'success') refuse('the recorded verification run did not succeed')
  const title = `verify ${target} ${entry.function} deployed ${entry.commit} v${entry.version}`
  if (run.display_title !== title) refuse(`the recorded verification run does not match the deployment (expected "${title}", found "${run.display_title}")`)
}

function walk(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}
/**
 * Exact source comparison (C1). The expected files are exactly the ones the
 * deployed function is built from: its index.ts and every file it imports,
 * transitively (importClosure), as exported and stamped. Every one must be in
 * the download, byte for byte; any other downloaded file must be byte-identical
 * to the export too. Returns { result: 'match' | 'differs' | 'unavailable', problems }.
 */
export function compareSource(exportRoot, downloadRoot, fn) {
  const base = (root) => join(root, 'supabase', 'functions')
  const got = {}
  for (const p of walk(base(downloadRoot))) got[relative(base(downloadRoot), p).split(sep).join('/')] = sha256(readFileSync(p))
  if (Object.keys(got).length === 0) return { result: 'unavailable', problems: ['the download returned no files'] }
  const hashOf = (rel) => { try { return sha256(readFileSync(join(base(exportRoot), rel))) } catch { return null } }
  const problems = []
  for (const rel of importClosure(exportRoot, fn)) {
    if (!(rel in got)) problems.push(`missing from the deployment: ${rel}`)
    else if (got[rel] !== hashOf(rel)) problems.push(`differs from the approved commit: ${rel}`)
  }
  for (const rel of Object.keys(got)) {
    const want = hashOf(rel)
    if (want === null) problems.push(`not in the approved commit: ${rel}`)
    else if (got[rel] !== want && !problems.some((x) => x.endsWith(rel))) problems.push(`differs from the approved commit: ${rel}`)
  }
  return { result: problems.length ? 'differs' : 'match', problems }
}

/**
 * Waits until the public endpoint serves this build (X-Splitpost-Build), so the
 * recorded deployment is the one actually answering, not only what the CLI
 * reported. An unauthenticated POST: refused (401), changes nothing.
 */
export async function servedBuild(baseUrl, fn, route, build, { tries = 30, waitMs = 3000, fetchImpl = fetch } = {}) {
  let last = null
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetchImpl(`${baseUrl}/${fn}/${route}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      await r.body?.cancel?.()
      last = r.headers.get('x-splitpost-build')
      if (last === build) return { ok: true, served: last }
    } catch {
      last = null
    }
    if (i + 1 < tries) await new Promise((res) => setTimeout(res, waitMs))
  }
  return { ok: false, served: last }
}

/** The runner-observed evidence a verification run recorded (its "Verified deployment" annotation). */
export function checkVerifyEvidence(annotations, entry, target) {
  if (!Array.isArray(annotations)) refuse('the verification run\'s evidence could not be read')
  const notes = annotations.filter((a) => a.title === 'Verified deployment' && a.annotation_level === 'notice')
  if (notes.length !== 1) refuse(`the verification run has ${notes.length} "Verified deployment" record(s) (exactly one expected)`)
  const kv = Object.fromEntries(String(notes[0].message).trim().split(/\s+/).map((x) => x.split('=')).filter((x) => x.length === 2))
  const want = { target, ref: entry.ref, function: entry.function, mode: 'deployed', commit: entry.commit, observed_build: entry.build }
  for (const [k, v] of Object.entries(want)) {
    if (kv[k] !== v) refuse(`the verification run observed ${k}=${kv[k] ?? 'nothing'}, not ${v}: it is not evidence for this deployment`)
  }
}

function evidence(row) {
  const path = join(ROOT, EVIDENCE)
  const clean = (v) => String(v ?? '').replace(/[|\n\r]/g, ' ').slice(0, 300)
  const line = `| ${new Date().toISOString()} | ${row.map(clean).join(' | ')} |\n`
  appendFileSync(path, line)
  return line
}

// The public functions address. Only the script's own tests (origin not GitHub) may point it at a local stand-in.
function baseUrl(ref) {
  const test = process.env.FUNCTIONS_TEST_BASE_URL
  if (test) {
    if (/github\.com/.test(git('remote', 'get-url', 'origin')) || !/^http:\/\/127\.0\.0\.1:\d+$/.test(test)) refuse('FUNCTIONS_TEST_BASE_URL is for the script\'s own tests only')
    return test
  }
  return `https://${ref}.supabase.co/functions/v1`
}

function repoSlug() {
  const url = git('remote', 'get-url', 'origin')
  const m = /github\.com[:/]([^/]+)\/([^/.]+?)(\.git)?$/.exec(url)
  if (m) return `${m[1]}/${m[2]}`
  // Only when origin is not GitHub (the script's own tests): a fixed slug for the fake gh.
  if (process.env.FUNCTIONS_TEST_GITHUB_REPO && !/github\.com/.test(url)) return process.env.FUNCTIONS_TEST_GITHUB_REPO
  refuse('origin is not a GitHub repository')
}

function pinnedCli() {
  const wf = readFileSync(join(ROOT, '.github/workflows/deploy-db-staging.yml'), 'utf8')
  const m = /^ {2}SUPABASE_CLI_VERSION: (\S+)$/m.exec(wf)
  if (!m) refuse('could not read the pinned Supabase CLI version')
  return m[1]
}

function label(v, what) {
  if (typeof v !== 'string' || !/^[A-Za-z0-9 ._-]{1,60}$/.test(v) || v.includes('@')) refuse(`${what} must be a label of up to 60 letters, digits, spaces, dots, dashes or underscores (not an email)`)
  return v
}

export async function main(argv) {
  const o = parseArgs(argv)
  const operator = label(o.operator, '--operator')
  if (o.action !== 'deploy' && (typeof o.reason !== 'string' || o.reason.trim().length < 5 || o.reason.length > 300)) refuse('--reason (5 to 300 characters) is required')
  const fn = o.function
  if (!['avatar', 'post-media', 'join-waitlist'].includes(fn)) refuse('--function must be avatar or post-media (join-waitlist: delete from member Production only)')
  if (fn === 'join-waitlist' && !(o.action === 'delete' && o.target === 'member-production')) refuse('join-waitlist is never deployed or rolled back by this script; it may only be deleted from member Production')

  const cli = pinnedCli()
  const v = run('supabase', ['--version']).trim()
  if (v !== cli) refuse(`expected Supabase CLI ${cli}, found ${v}`)
  git('fetch', '--quiet', 'origin', 'rehearsal/members-disposable')
  const main = git('rev-parse', 'origin/rehearsal/members-disposable')
  const atMain = (p) => json(git('show', `origin/rehearsal/members-disposable:${p}`), p)
  const projects = atMain('config/supabase-projects.json')
  const approvals = atMain('config/member-production.json')
  const p = targetProject(o.target, projects)
  const allowed = allowedFunctions(o.target, approvals)

  const commit = o.action === 'delete' ? null : o.commit
  if (o.action !== 'delete') {
    if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) refuse('--commit must be a full 40 character commit SHA')
    if (!allowed.deployable.includes(fn)) refuse(fn === 'post-media' ? 'post-media may not be deployed to member Production: postMediaFunctionApproved is false on main (a separate founder approval)' : `${fn} may not be deployed to ${o.target}`)
  }
  const phrase = phraseFor(o.action, fn, p.ref, commit ?? '')
  if (o.confirm !== phrase) refuse(`the confirmation phrase must be exactly: ${phrase}`)

  const owner = (() => {
    const slug = repoSlug()
    return { slug, login: json(run('gh', ['api', `repos/${slug}`]), 'the repository').owner?.login }
  })()

  // The project's identity, from the Supabase account itself.
  const listed = json(run('supabase', ['projects', 'list', '-o', 'json']), 'the project list')
  checkProjectIdentity(listed, p)

  if (o.action === 'delete') {
    const before = json(run('supabase', ['functions', 'list', '--project-ref', p.ref, '-o', 'json']), 'the function list')
    const present = before.some((f) => fnName(f) === fn)
    evidence(['delete requested', o.target, p.ref, fn, '', '', operator, o.reason, present ? 'present' : 'already absent'])
    if (present) run('supabase', ['functions', 'delete', fn, '--project-ref', p.ref])
    const after = json(run('supabase', ['functions', 'list', '--project-ref', p.ref, '-o', 'json']), 'the function list')
    if (after.some((f) => fnName(f) === fn)) {
      evidence(['delete FAILED', o.target, p.ref, fn, '', '', operator, o.reason, 'still present'])
      refuse(`${fn} is still listed on ${p.ref} after the delete`)
    }
    evidence(['deleted', o.target, p.ref, fn, '', '', operator, o.reason, 'absent (confirmed by functions list)'])
    return { state: 'deleted', next: `Run verify-functions.yml: target ${o.target}, function ${fn}, mode removed. Redeploying needs a normal, approved deploy.` }
  }

  // The commit.
  if (run('git', ['merge-base', '--is-ancestor', commit, 'origin/rehearsal/members-disposable'], { allowFail: true }) === null) refuse(`${commit.slice(0, 12)} is not on origin/rehearsal/members-disposable`)
  if (o.action === 'deploy') {
    if (git('rev-parse', 'HEAD') !== commit) refuse('--commit is not HEAD: check out the approved commit first')
    const dirty = git('status', '--porcelain').split('\n').filter(Boolean).filter((l) => !l.endsWith(EVIDENCE))
    if (dirty.length) refuse('the working tree is not clean')
  } else {
    const ledger = atMain('config/function-deployments.json')
    const problems = ledgerProblems(ledger)
    if (problems.length) refuse(`the deployment ledger on main is invalid, so nothing can be rolled back: ${problems.join('; ')}`)
    const entry = approvedDeployment(ledger, { target: o.target, ref: p.ref, fn, commit })
    if (!entry) refuse(`${commit.slice(0, 12)} has no founder-approved ${fn} deployment on ${o.target} (${p.ref}) in config/function-deployments.json on main; only a recorded, verified deployment can be rolled back to`)
    const vrun = json(run('gh', ['api', `repos/${owner.slug}/actions/runs/${entry.verifyRunId}`]), 'the verification run')
    checkVerifyRun(vrun, entry, o.target, { owner: owner.login })
    // Independent evidence: what GitHub's runner itself observed being served.
    const vjobs = json(run('gh', ['api', `repos/${owner.slug}/actions/runs/${entry.verifyRunId}/jobs`]), 'the verification jobs')
    const job = (vjobs.jobs ?? [])[0]
    if (!job || (vjobs.jobs ?? []).length !== 1) refuse('the verification run does not have exactly one job')
    const notes = json(run('gh', ['api', `repos/${owner.slug}/check-runs/${job.id}/annotations`]), 'the verification evidence')
    checkVerifyEvidence(notes, entry, o.target)
  }
  // The commit's own references must serve this project.
  const commitProjects = json(git('show', `${commit}:config/supabase-projects.json`), 'the commit config')
  const commitRef = o.target === 'staging' ? commitProjects?.staging?.ref : commitProjects?.memberProduction?.ref
  if (commitRef !== p.ref) refuse(`at ${commit.slice(0, 12)} the ${o.target} reference is ${commitRef ?? 'null'}, not ${p.ref}: that code would not serve this project`)

  if (o.target === 'member-production') {
    if (!/^\d+$/.test(o['db-check-run'] ?? '')) refuse('--db-check-run (the member database check run id) is required for member Production')
    const runInfo = json(run('gh', ['api', `repos/${owner.slug}/actions/runs/${o['db-check-run']}`]), 'the database check run')
    const jobs = json(run('gh', ['api', `repos/${owner.slug}/actions/runs/${o['db-check-run']}/jobs`]), 'the database check jobs')
    checkDbRun(runInfo, jobs, { owner: owner.login, commit: o.action === 'deploy' ? commit : main })
  }

  const before = json(run('supabase', ['functions', 'list', '--project-ref', p.ref, '-o', 'json']), 'the function list')
  const unexpectedBefore = unexpectedFunctions(before, allowed.expected)
  if (unexpectedBefore.length) refuse(`${p.ref} holds unexpected function(s): ${unexpectedBefore.join(', ')}. Delete them first (deploy.mjs delete), then deploy.`)
  const prev = before.find((f) => fnName(f) === fn)

  // The export: exactly the commit, plus the build stamp.
  const tmp = mkdtempSync(join(tmpdir(), 'splitpost-fn-'))
  try {
    const tar = join(tmp, 'src.tar')
    run('git', ['archive', '--format=tar', '-o', tar, commit, 'supabase/functions', 'supabase/config.toml'])
    const out = join(tmp, 'export')
    mkdirSync(out)
    run('tar', ['-xf', tar, '-C', out])
    const projTs = readFileSync(join(out, 'supabase/functions/_shared/projects.ts'), 'utf8')
    const want = o.target === 'staging' ? `export const STAGING_REF: string = '${p.ref}'` : `export const MEMBER_PRODUCTION_REF: string | null = '${p.ref}'`
    if (!projTs.includes(want)) refuse(`the commit's supabase/functions/_shared/projects.ts does not name ${p.ref} for ${o.target}`)
    const digest = sourceDigest(out, fn)
    const build = `${commit}.${digest}`
    writeFileSync(join(out, 'supabase/functions/_shared/build-info.ts'), `// Stamped by scripts/functions/deploy.mjs for this deployment only.\nexport const BUILD = '${build}'\n`)
    evidence([`${o.action} started`, o.target, p.ref, fn, commit, prev ? `from v${prev.version}` : 'new', operator, o.reason ?? '', `build ${build}`])

    run('supabase', ['functions', 'deploy', fn, '--project-ref', p.ref, '--no-verify-jwt', '--use-api', '--workdir', out])

    const after = json(run('supabase', ['functions', 'list', '--project-ref', p.ref, '-o', 'json']), 'the function list')
    const f = after.find((x) => fnName(x) === fn)
    const problems = []
    if (!f) problems.push(`${fn} is not listed after the deploy`)
    else {
      if (f.status !== 'ACTIVE') problems.push(`${fn} is ${f.status}, not ACTIVE`)
      if (f.verify_jwt !== false) problems.push(`${fn} has the gateway JWT check on (expected off)`)
      if (prev && !(f.version > prev.version)) problems.push(`${fn}'s version did not change (v${prev.version})`)
    }
    const unexpected = unexpectedFunctions(after, allowed.expected)
    if (unexpected.length) problems.push(`unexpected function(s) on ${p.ref}: ${unexpected.join(', ')}`)
    if (problems.length) {
      evidence([`${o.action} FAILED VERIFICATION`, o.target, p.ref, fn, commit, f ? `v${f.version}` : '', operator, o.reason ?? '', problems.join('; ')])
      refuse(`deployed, but failed verification: ${problems.join('; ')}. Roll back to an approved deployment or delete it.`)
    }

    // Exact source comparison (C1): required. A download that is missing,
    // incomplete or different means the deployment is not verified.
    const dl = join(tmp, 'download')
    mkdirSync(join(dl, 'supabase'), { recursive: true })
    const got = run('supabase', ['functions', 'download', fn, '--project-ref', p.ref, '--use-api', '--workdir', dl], { allowFail: true })
    const source = got === null ? { result: 'unavailable', problems: ['supabase functions download failed'] } : compareSource(out, dl, fn)
    const failed = (why) => {
      evidence([`${o.action} FAILED VERIFICATION`, o.target, p.ref, fn, commit, `v${f.version}`, operator, o.reason ?? '', why])
      refuse(`deployed, but failed verification: ${why}. Roll back to an approved deployment or delete it.`)
    }
    if (source.result !== 'match') failed(`the deployed source could not be compared exactly with the approved commit (${source.result}: ${source.problems.slice(0, 3).join('; ')})`)
    // The public endpoint must now serve this exact build.
    const served = await servedBuild(baseUrl(p.ref), fn, fn === 'avatar' ? 'upload' : 'photo', build, process.env.FUNCTIONS_TEST_BASE_URL ? { tries: 3, waitMs: 100 } : {})
    if (!served.ok) failed(`the endpoint serves build ${served.served ?? 'none'}, not ${build}`)
    const summary = { state: 'deployed, unverified', target: o.target, ref: p.ref, function: fn, commit, cliVersion: f.version, build, served: served.served, bundle: f.ezbr_sha256 ?? null, sourceComparison: 'exact match' }
    evidence([`${o.action}ed, unverified`, o.target, p.ref, fn, commit, `v${f.version} (CLI)`, operator, o.reason ?? '', `served build ${served.served}; bundle ${f.ezbr_sha256 ?? 'n/a'}; source exact match`])
    summary.next = `Run verify-functions.yml with target ${o.target}, function ${fn}, mode deployed, expected_commit ${commit}, deployed_version ${f.version}. Only after it passes, record the approval in config/function-deployments.json in a reviewed PR (build ${build}, verifyRunId of that run).`
    return summary
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

// Run directly (not when imported by the tests), on Linux, macOS or Windows paths.
if (/[\\/]scripts[\\/]functions[\\/]deploy\.mjs$/.test(process.argv[1] ?? '')) {
  try {
    const r = await main(process.argv.slice(2))
    console.log(JSON.stringify(r, null, 2))
  } catch (e) {
    if (e instanceof Refused) {
      console.error(`REFUSED: ${e.message}`)
      process.exit(1)
    }
    throw e
  }
}
