#!/usr/bin/env node
// The source digest of one Edge Function: SHA-256 over the sorted list of
// "<path>\0<sha256 of file>\n" for every file in supabase/functions/<name>/
// and supabase/functions/_shared/, except _shared/build-info.ts (the stamp
// itself) and *.test.ts. The deploy script stamps '<commit>.<digest>' into
// the deployed copy (X-Splitpost-Build); the verify workflow recomputes the
// digest from the same commit, independently, and compares.
//
//   node scripts/functions/source-digest.mjs <root holding supabase/> <function>
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const sha = (b) => createHash('sha256').update(b).digest('hex')

function walk(dir) {
  let out = []
  let names = []
  try { names = readdirSync(dir) } catch { return out }
  for (const n of names) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out = out.concat(walk(p))
    else out.push(p)
  }
  return out
}

export function sourceFiles(root, name) {
  const base = join(root, 'supabase', 'functions')
  return [...walk(join(base, name)), ...walk(join(base, '_shared'))]
    .map((p) => relative(base, p).split(sep).join('/'))
    .filter((p) => p !== '_shared/build-info.ts' && !p.endsWith('.test.ts'))
    .sort()
}

export function sourceDigest(root, name) {
  if (!/^[a-z][a-z0-9-]{0,40}$/.test(name)) throw new Error('bad function name')
  const files = sourceFiles(root, name)
  if (!files.some((f) => f === `${name}/index.ts`)) throw new Error(`supabase/functions/${name}/index.ts not found under ${root}`)
  const base = join(root, 'supabase', 'functions')
  return sha(files.map((f) => `${f}\0${sha(readFileSync(join(base, f)))}\n`).join(''))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [root, name] = process.argv.slice(2)
  if (!root || !name) {
    console.error('usage: source-digest.mjs <root> <function>')
    process.exit(2)
  }
  console.log(sourceDigest(root, name))
}

/**
 * The exact files a deployed function is built from: supabase/functions/<name>/index.ts
 * and every file it imports, transitively, through relative imports
 * (paths relative to supabase/functions). A relative import that points
 * outside supabase/functions, or at a missing file, is an error.
 */
export function importClosure(root, name) {
  const base = join(root, 'supabase', 'functions')
  const seen = new Set()
  const visit = (rel) => {
    if (seen.has(rel)) return
    let text
    try { text = readFileSync(join(base, rel), 'utf8') } catch { throw new Error(`${rel} is imported but missing`) }
    seen.add(rel)
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    for (const m of code.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const parts = rel.split('/').slice(0, -1)
      for (const seg of m[1].split('/')) {
        if (seg === '..') { if (!parts.length) throw new Error(`${rel} imports outside supabase/functions`); parts.pop() }
        else if (seg !== '.') parts.push(seg)
      }
      visit(parts.join('/'))
    }
  }
  visit(`${name}/index.ts`)
  return [...seen].sort()
}
