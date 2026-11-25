// Generates the SP-TA-001 coverage summary and effort totals from matrix.psv.
// Usage: node docs/sp-ta-001/coverage.mjs  (writes docs/sp-ta-001/coverage.md and prints it)
// Planning tool only; not part of the application or its test suite.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const lines = readFileSync(join(here, 'matrix.psv'), 'utf8').trim().split('\n')
const head = lines[0].split('|')
const rows = lines.slice(1).map((l, i) => {
  const c = l.split('|')
  if (c.length !== head.length) throw new Error(`row ${i + 2}: ${c.length} columns, expected ${head.length}`)
  return Object.fromEntries(head.map((h, j) => [h, c[j]]))
})

const STATUS = ['VC', 'IU', 'PI', 'CF', 'MI', 'BL', 'NA']
const CLASS = ['REUSE', 'REFACTOR', 'BUILD', 'RETIRE', 'DEFER', 'VERIFY']
const ids = new Set()
for (const r of rows) {
  if (ids.has(r.id)) throw new Error(`duplicate id ${r.id}`)
  ids.add(r.id)
  if (!STATUS.includes(r.status)) throw new Error(`${r.id}: bad status ${r.status}`)
  if (!CLASS.includes(r.class)) throw new Error(`${r.id}: bad class ${r.class}`)
  if (!/^\d+$/.test(r.ml)) throw new Error(`${r.id}: bad hours ${r.ml}`)
}

// Uncertainty factors per work package: optimistic and pessimistic multiples of most likely.
// Task hours already include unit, database and component tests. Cross-feature integration, defects and
// contingency are covered by the schedule reserve (SP-TA-001 section 7), not added here, to avoid double counting.
const FACTORS = {
  'WP-01': [0.75, 1.5], 'WP-02': [0.7, 1.6], 'WP-03': [0.7, 1.5], 'WP-04': [0.7, 1.8], 'WP-05': [0.7, 1.6],
  'WP-06': [0.7, 1.6], 'WP-07': [0.7, 1.6], 'WP-08': [0.7, 1.5], 'WP-09': [0.75, 1.6], 'WP-10': [0.7, 1.6],
}
const wps = [...new Set(rows.map((r) => r.wp))]
const count = (list, key, val) => list.filter((r) => r[key] === val).length
const pct = (n, d) => `${Math.round((n / d) * 100)}%`

let md = '# SP-TA-001 coverage summary (generated)\n\n'
md += `Generated from \`matrix.psv\` by \`coverage.mjs\`. ${rows.length} requirements. Do not edit by hand.\n\n`
md += '## Status and classification by work package\n\n'
md += `| WP | Reqs | ${STATUS.join(' | ')} | ${CLASS.join(' | ')} | Release-blocking |\n`
md += `|${'---|'.repeat(STATUS.length + CLASS.length + 3)}\n`
const totals = (list) => [list.length, ...STATUS.map((s) => count(list, 'status', s)), ...CLASS.map((c) => count(list, 'class', c)), count(list, 'blocking', 'Y')]
for (const wp of wps) md += `| ${wp} | ${totals(rows.filter((r) => r.wp === wp)).join(' | ')} |\n`
const t = totals(rows)
md += `| **Total** | ${t.map((n) => `**${n}**`).join(' | ')} |\n`
md += `| Share | | ${t.slice(1, -1).map((n) => pct(n, rows.length)).join(' | ')} | ${pct(t[t.length - 1], rows.length)} |\n\n`

md += '## Verification depth (L local run, C CI on main, D deployment record, X direct test of a deployed environment)\n\n'
const has = (r, k) => r.verified.split(',').includes(k)
md += '| Evidence | Requirements |\n|---|---|\n'
for (const [k, label] of [['L', 'Verified by local test run'], ['C', 'Verified by CI'], ['D', 'Present per deployment record'], ['X', 'Directly tested in a deployed environment']])
  md += `| ${label} | ${rows.filter((r) => has(r, k)).length} |\n`
md += `| No implementation evidence | ${rows.filter((r) => r.verified === '-').length} |\n\n`

md += '## Effort by work package (hours)\n\n'
md += '| WP | Optimistic | Most likely | Pessimistic |\n|---|---|---|---|\n'
let O = 0, M = 0, P = 0
for (const wp of wps) {
  const ml = rows.filter((r) => r.wp === wp).reduce((a, r) => a + Number(r.ml), 0)
  const [fo, fp] = FACTORS[wp]
  const o = Math.round(ml * fo), p = Math.round(ml * fp)
  O += o; M += ml; P += p
  md += `| ${wp} | ${o} | ${ml} | ${p} |\n`
}
md += `| **Total** | **${O}** | **${M}** | **${P}** |\n\n`

md += '## Full requirements matrix\n\n'
md += 'Status: VC verified complete (source, local and CI tests, deployment record), IU implemented but unverified, PI partial, CF conflicting, MI missing, BL blocked. Verified: L local, C CI, D deployment record, X direct deployed test.\n\n'
md += '| ID | WP | Requirement | Status | Class | Verified | Evidence | Action | Engine refs | ML h | Blocking |\n|---|---|---|---|---|---|---|---|---|---|---|\n'
for (const r of rows) md += `| ${r.id} | ${r.wp} | ${r.title} | ${r.status} | ${r.class} | ${r.verified} | ${r.evidence} | ${r.action} | ${r.engine_refs} | ${r.ml} | ${r.blocking} |\n`

writeFileSync(join(here, 'coverage.md'), md)
console.log(md)
