// Works out, from vercel.json, whether Vercel sends `X-Robots-Tag: noindex`
// for a host and path. Used by the tests to check the indexing rules.
//
// It mirrors how Vercel matches the two source styles vercel.json uses here:
// a path with an unnamed regex group, such as "/(.*)" or "/((?!join$).+)",
// matched against the whole path (the same style as the site's existing
// rewrite "/((?!media/|assets/|favicon).*)", which Vercel already serves),
// plus `has` / `missing` host conditions. It is a model of Vercel's
// behaviour, not Vercel itself: the live headers are checked on a Preview.

import { readFileSync } from 'node:fs'

export const VERCEL = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))

function sourceMatches(source, pathname) {
  if (!/^\/[(]/.test(source) && source !== '/') throw new Error(`unsupported source style in this model: ${source}`)
  return new RegExp(`^${source}$`).test(pathname)
}
const hostIs = (conds, host) => conds.every((c) => c.type === 'host' && c.value === host)

/** True if Vercel sends X-Robots-Tag: noindex for this host and path. */
export function headerNoindex(host, pathname, config = VERCEL) {
  return config.headers.some(
    (rule) =>
      rule.headers.some((h) => h.key === 'X-Robots-Tag' && /noindex/.test(h.value)) &&
      (!rule.has || hostIs(rule.has, host)) &&
      (!rule.missing || !rule.missing.some((c) => c.type === 'host' && c.value === host)) &&
      sourceMatches(rule.source, pathname),
  )
}
