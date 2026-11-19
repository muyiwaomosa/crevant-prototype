// A member app build (the splitpost-app project) serves only the member app on
// EVERY address: its protected Vercel Previews, the project's own .vercel.app
// address and app.splitpost.ca alike. No public page, tour or demo, ever.
import { describe, expect, it, vi } from 'vitest'

vi.mock('./build-flags', async (importOriginal) => ({ ...(await importOriginal<typeof import('./build-flags')>()), MEMBER_APP_BUILD: true }))

import { isMemberApp, resolveEntry } from './entry'

const at = (hostname: string, pathname: string, search = '', hash = '') => resolveEntry({ hostname, pathname, search, hash })

const ADDRESSES = [
  'splitpost-app-git-claude-pilot-m1-environment-crevant.vercel.app', // a protected Preview
  'splitpost-app-abc123xyz-crevant.vercel.app', // a deployment address
  'splitpost-app.vercel.app', // the project's own Production address
  'app.splitpost.ca',
  'localhost',
  // Even if a member app build were ever served there, never the demo or the public site.
  'crevant-prototype.vercel.app',
  'www.splitpost.ca',
]

describe('in a member app build, every address is the member app', () => {
  it.each(ADDRESSES)('%s: member pages are served as they are', (host) => {
    for (const p of ['/app', '/app/account', '/sign-in', '/forgot-password', '/auth/confirm', '/auth/set-password', '/privacy']) {
      expect(at(host, p), `${host}${p}`).toEqual({ kind: 'member' })
    }
    expect(at(host, '/auth/confirm', '', '#token_hash=abc&type=invite')).toEqual({ kind: 'member' })
  })

  it.each(ADDRESSES)('%s: public pages, the tour and old prototype links all go to /app', (host) => {
    for (const p of ['/', '/join', '/join/creator', '/request-invite', '/pilot-access', '/tour', '/tour/discover', '/discover', '/no-such-page']) {
      expect(at(host, p), `${host}${p}`).toEqual({ kind: 'member', redirectTo: '/app' })
    }
  })

  it('the demo fallback never applies to a member app build', () => {
    expect(resolveEntry({ hostname: 'crevant-prototype.vercel.app', pathname: '/', search: '', hash: '' }, { demoFallback: true })).toEqual({
      kind: 'member',
      redirectTo: '/app',
    })
  })

  it('isMemberApp: true for any address in a member app build; without it, only app.splitpost.ca', () => {
    expect(isMemberApp('splitpost-app-git-x-crevant.vercel.app')).toBe(true)
    expect(isMemberApp('splitpost-app-git-x-crevant.vercel.app', false)).toBe(false)
    expect(isMemberApp('localhost', false)).toBe(false)
    expect(isMemberApp('app.splitpost.ca', false)).toBe(true)
  })
})
