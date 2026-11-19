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

describe('the member app address (app.splitpost.ca)', () => {
  const app = (pathname: string, search = '', hash = '') => resolveEntry({ hostname: 'app.splitpost.ca', pathname, search, hash })

  it('serves the member pages there, untouched', () => {
    for (const p of ['/app', '/app/', '/app/discover', '/app/u/someone', '/app/account', '/sign-in', '/forgot-password', '/auth/confirm', '/auth/set-password', '/privacy'])
      expect(app(p), p).toEqual({ kind: 'member' })
    // The invitation link keeps its fragment: no redirect touches it.
    expect(app('/auth/confirm', '', '#token_hash=abc&type=invite')).toEqual({ kind: 'member' })
    expect(app('/sign-in', '?next=%2Fapp%2Fdiscover')).toEqual({ kind: 'member' })
    expect(resolveEntry({ hostname: 'APP.SPLITPOST.CA', pathname: '/app', search: '', hash: '' })).toEqual({ kind: 'member' })
  })

  it('sends everything else (landing page, waitlist, sample tour, old prototype paths) to /app', () => {
    for (const p of ['/', '/join', '/join/creator', '/pilot-access', '/request-invite', '/tour', '/tour/discover', '/discover', '/studio', '/apple', '/sign-in/extra', '/anything'])
      expect(app(p), p).toEqual({ kind: 'member', redirectTo: '/app' })
  })

  it('does not change any other address', () => {
    expect(at('/')).toEqual({ kind: 'public' })
    expect(at('/', 'www.splitpost.ca')).toEqual({ kind: 'public' })
    expect(at('/app', 'splitpost.ca')).toEqual({ kind: 'public' })
    expect(at('/', 'app.splitpost.ca.evil.example')).toEqual({ kind: 'public' })
    expect(at('/', 'crevant-prototype.vercel.app')).toEqual({ kind: 'demo-fallback' })
  })
})
