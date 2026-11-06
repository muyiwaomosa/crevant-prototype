import { describe, expect, it } from 'vitest'
import { resolveEntry } from './entry'

const at = (pathname: string, hostname = 'crevant-prototype-git-main-example.vercel.app', search = '', hash = '') =>
  resolveEntry({ hostname, pathname, search, hash })

describe('production fallback', () => {
  it('serves only the sample prototype on the production demo address, whatever the path', () => {
    for (const p of ['/', '/sign-in', '/request-invite', '/tour', '/discover'])
      expect(at(p, 'crevant-prototype.vercel.app')).toEqual({ kind: 'demo-fallback' })
    expect(at('/', 'CREVANT-PROTOTYPE.VERCEL.APP')).toEqual({ kind: 'demo-fallback' })
  })

  it('serves the public site on preview and local addresses', () => {
    expect(at('/', 'localhost')).toEqual({ kind: 'public' })
    expect(at('/')).toEqual({ kind: 'public' })
    expect(at('/sign-in')).toEqual({ kind: 'public' })
  })
})

describe('tour routing', () => {
  it('sends /tour and everything under it to the prototype', () => {
    expect(at('/tour')).toEqual({ kind: 'tour' })
    expect(at('/tour/discover')).toEqual({ kind: 'tour' })
    expect(at('/tourist')).toEqual({ kind: 'public' })
  })

  it('redirects every old prototype path to /tour, keeping query and hash', () => {
    const cases: Array<[string, string]> = [
      ['/welcome', '/tour/welcome'],
      ['/discover', '/tour/discover'],
      ['/create', '/tour/create'],
      ['/creator/maya', '/tour/creator/maya'],
      ['/post/p1', '/tour/post/p1'],
      ['/rewards', '/tour/rewards'],
      ['/profile', '/tour/profile'],
      ['/profile/tools', '/tour/profile/tools'],
      ['/points', '/tour/points'],
      ['/studio', '/tour/studio'],
      ['/studio/rewards', '/tour/studio/rewards'],
    ]
    for (const [from, to] of cases) expect(at(from)).toEqual({ kind: 'tour', redirectTo: to })
    expect(at('/rewards', undefined, '?tab=cp', '#top')).toEqual({ kind: 'tour', redirectTo: '/tour/rewards?tab=cp#top' })
  })

  it('leaves public paths alone', () => {
    for (const p of ['/', '/request-invite', '/sign-in', '/something-else', '/creator'])
      expect(at(p)).toEqual({ kind: 'public' })
  })
})
