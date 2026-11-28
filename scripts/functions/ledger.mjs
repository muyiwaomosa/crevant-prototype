// The founder-approved deployment ledger (config/function-deployments.json).
// Validation is strict: one malformed entry makes the whole ledger unusable
// (rollback then refuses), never silently skipped.
export const TARGETS = ['staging', 'member-production']
export const FUNCTIONS = ['avatar', 'post-media', 'waitlist-bridge']
const SHA = /^[0-9a-f]{40}$/
const DIGEST = /^[0-9a-f]{64}$/
const REF = /^[a-z0-9]{20}$/
const LABEL = /^[A-Za-z0-9 ._-]{1,60}$/
const KEYS = ['target', 'ref', 'function', 'commit', 'version', 'build', 'approvedBy', 'approvedAt', 'verifyRunId']

/** Problems with the ledger; [] when every entry is well formed. */
export function ledgerProblems(ledger) {
  if (!ledger || typeof ledger !== 'object' || !Array.isArray(ledger.deployments)) return ['the ledger has no deployments list']
  const problems = []
  const seen = new Set()
  ledger.deployments.forEach((e, i) => {
    const at = `deployment ${i + 1}`
    if (!e || typeof e !== 'object') return problems.push(`${at}: not an object`)
    const extra = Object.keys(e).filter((k) => !KEYS.includes(k))
    if (extra.length) problems.push(`${at}: unknown fields ${extra.join(', ')}`)
    if (!TARGETS.includes(e.target)) problems.push(`${at}: unknown target`)
    if (typeof e.ref !== 'string' || !REF.test(e.ref)) problems.push(`${at}: malformed ref`)
    if (!FUNCTIONS.includes(e.function)) problems.push(`${at}: unknown function`)
    if (typeof e.commit !== 'string' || !SHA.test(e.commit)) problems.push(`${at}: malformed commit`)
    if (!Number.isInteger(e.version) || e.version < 1) problems.push(`${at}: malformed version`)
    const [bc, bd] = typeof e.build === 'string' ? e.build.split('.') : []
    if (bc !== e.commit || !DIGEST.test(bd ?? '')) problems.push(`${at}: the build stamp must be "<commit>.<64 hex digest>" for this commit`)
    if (typeof e.approvedBy !== 'string' || !LABEL.test(e.approvedBy) || e.approvedBy.includes('@')) problems.push(`${at}: approvedBy must be a label (not an email)`)
    if (typeof e.approvedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.approvedAt)) problems.push(`${at}: approvedAt must be a date (YYYY-MM-DD)`)
    if (!Number.isInteger(e.verifyRunId) || e.verifyRunId < 1) problems.push(`${at}: malformed verifyRunId`)
    const key = `${e.target}|${e.function}|${e.commit}|${e.version}`
    if (seen.has(key)) problems.push(`${at}: duplicate entry`)
    seen.add(key)
  })
  return problems
}

/** The approved entry for exactly this target, reference, function and commit (the latest version), or null. */
export function approvedDeployment(ledger, { target, ref, fn, commit }) {
  const matches = ledger.deployments.filter((e) => e.target === target && e.ref === ref && e.function === fn && e.commit === commit)
  return matches.sort((a, b) => b.version - a.version)[0] ?? null
}
