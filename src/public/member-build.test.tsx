// @vitest-environment jsdom
// A member app build on a Preview address (here jsdom's localhost, standing in
// for splitpost-app-git-….vercel.app): the real onMemberAppHost() is used, not
// a mock, and only the member pages are shown, exactly as on app.splitpost.ca.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('../build-flags', async (importOriginal) => ({ ...(await importOriginal<typeof import('../build-flags')>()), MEMBER_APP_BUILD: true }))

import { AuthProvider } from '../auth/AuthProvider'
import { PublicRoutes } from './PublicApp'
import { onMemberAppHost } from './member-host'

function makeClient() {
  const maybeSingle = vi.fn(async () => ({ data: null, error: null }))
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      verifyOtp: vi.fn(),
      updateUser: vi.fn(),
      signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: null })),
      resetPasswordForEmail: vi.fn(),
      signOut: vi.fn(async () => ({ error: null })),
      signUp: vi.fn(),
      signInWithOtp: vi.fn(),
    },
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) })) })),
    rpc: vi.fn(async () => ({ data: [], error: null })),
  }
}

let where = ''
function WhereAmI() {
  const l = useLocation()
  where = l.pathname + l.search
  return null
}
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" data-testid={`go-${to}`} onClick={() => navigate(to)}>
      go
    </button>
  )
}
function renderAt(path: string, extra: string[] = []) {
  return render(
    <AuthProvider client={makeClient() as unknown as SupabaseClient}>
      <MemoryRouter initialEntries={[path]}>
        <PublicRoutes />
        <WhereAmI />
        {extra.map((to) => (
          <GoTo key={to} to={to} />
        ))}
      </MemoryRouter>
    </AuthProvider>,
  )
}
const text = () => (document.body.textContent || '').replace(/\s+/g, ' ')
const PUBLIC = /Join the Waitlist|Waitlist Opens Soon|Discover Splitpost|Get your split|Every Post\. A Better Split/

beforeEach(() => {
  where = ''
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => cleanup())

describe('a member app build on a Preview address', () => {
  it('is recognised as the member app, though the address is not app.splitpost.ca', () => {
    expect(window.location.hostname).not.toBe('app.splitpost.ca')
    expect(onMemberAppHost()).toBe(true)
  })

  for (const path of ['/', '/join', '/join/creator', '/pilot-access', '/request-invite', '/no-such-page']) {
    it(`${path} goes to /app, then sign in: no public page`, async () => {
      renderAt(path)
      await waitFor(() => expect(where).toBe('/sign-in?next=%2Fapp'))
      expect(text()).not.toMatch(PUBLIC)
      expect(screen.getByTestId('member-host-header')).toBeTruthy()
    })
  }

  it('client-side navigation to a public page lands on sign in instead', async () => {
    renderAt('/privacy', ['/', '/join'])
    for (const to of ['/', '/join']) {
      await act(async () => fireEvent.click(screen.getByTestId(`go-${to}`)))
      await waitFor(() => expect(where).toBe('/sign-in?next=%2Fapp'))
      expect(text(), to).not.toMatch(PUBLIC)
    }
  })

  it('links only to member pages, the privacy notice and the labelled public website link', async () => {
    renderAt('/sign-in')
    await screen.findByRole('heading', { level: 1 })
    for (const a of document.querySelectorAll('a')) {
      expect(['/app', '/sign-in', '/forgot-password', '/privacy', 'https://www.splitpost.ca', '#main']).toContain(a.getAttribute('href'))
    }
    expect(screen.getByTestId('public-site-link').getAttribute('href')).toBe('https://www.splitpost.ca')
  })
})
