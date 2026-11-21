// Tests for the search indexing rules. Run with: node --test scripts/*.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SITE, indexingFlags, robotsTxt, sitemapXml } from './indexing.mjs'

test('only the landing page and /join are ever indexable, only on the public site address', () => {
  assert.deepEqual(SITE.indexablePaths, ['/', '/join'])
  assert.equal(SITE.productionHost, 'www.splitpost.ca')
})

test('indexing is allowed only in an approved Production public site build that also approves indexing', () => {
  const prod = { VERCEL_ENV: 'production', CREVANT_PRODUCTION_SITE_APPROVED: 'true', CREVANT_ALLOW_INDEXING: 'true' }
  assert.deepEqual(indexingFlags(prod, 'site'), { productionSite: true, allowIndexing: true })
  assert.deepEqual(indexingFlags({ ...prod, CREVANT_ALLOW_INDEXING: '' }, 'site'), { productionSite: true, allowIndexing: false })
  assert.deepEqual(indexingFlags({ ...prod, CREVANT_PRODUCTION_SITE_APPROVED: '' }, 'site'), { productionSite: false, allowIndexing: false })
  assert.deepEqual(indexingFlags(prod, 'app'), { productionSite: false, allowIndexing: false })
  assert.deepEqual(indexingFlags({ ...prod, VERCEL_ENV: 'preview' }, 'site'), { productionSite: false, allowIndexing: false })
  assert.deepEqual(indexingFlags({}, 'site'), { productionSite: false, allowIndexing: false })
})

test('robots.txt disallows everything until indexing is allowed, then only / and /join', () => {
  assert.equal(robotsTxt(false), 'User-agent: *\nDisallow: /\n')
  const allowed = robotsTxt(true)
  assert.match(allowed, /^User-agent: \*\nAllow: \/\$\nAllow: \/join\$\nDisallow: \/\n/)
  assert.deepEqual(allowed.split('\n').filter((l) => l.startsWith('Allow:')), ['Allow: /$', 'Allow: /join$'])
  assert.match(allowed, /Sitemap: https:\/\/www\.splitpost\.ca\/sitemap\.xml/)
  const sitemap = sitemapXml()
  assert.deepEqual([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]), ['https://www.splitpost.ca/', 'https://www.splitpost.ca/join'])
  // Never the demo or the member app address.
  assert.doesNotMatch(allowed + sitemap, /crevant-prototype\.vercel\.app|app\.splitpost\.ca/)
})
