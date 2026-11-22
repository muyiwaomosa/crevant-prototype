// @vitest-environment jsdom
// The member app address (app.splitpost.ca): only the member experience is
// served, public pages are unreachable (including by client-side
// navigation), and the sign in, invitation, password and privacy pages work.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { AuthProvider } from '../auth/AuthProvider'
import { PublicRoutes } from './PublicApp'

const host = vi.hoisted(() => ({ member: true }))
vi.mock('./member-host', async (importOriginal) => {
  const real = await importOriginal<typeof import('./member-host')>()
  return { ...real, onMemberAppHost: () => host.member }
})

const TOKEN = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c'

function makeClient({ session = null as unknown } = {}) {
  const maybeSingle = vi.fn(async () => ({ data: { id: 'user-1', created_at: '2026-11-06T12:00:00Z' }, error: null }))
  return {
    auth: {
      getSession: vi.fn(async () => ({ data: { session }, error: null })),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      verifyOtp: vi.fn(async () => ({ data: { session: null }, error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
      signInWithPassword: vi.fn(async () => ({ data: { session: null }, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
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
  where = l.pathname + l.search + l.hash
  return null
}
/** Client-side navigation from inside the app, as a link or script would do it. */
function GoTo({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button type="button" data-testid={`go-${to}`} onClick={() => navigate(to)}>
      go
    </button>
  )
}
function splitPath(path: string) {
  const [beforeHash, hash = ''] = path.split('#')
  const [pathname, search = ''] = beforeHash.split('?')
  return { pathname, search: search ? `?${search}` : '', hash: hash ? `#${hash}` : '' }
}
function renderAt(path: string, client = makeClient(), extra: string[] = []) {
  return render(
    <AuthProvider client={client as unknown as SupabaseClient}>
      <MemoryRouter initialEntries={[splitPath(path)]}>
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
const LANDING = /Every Post\. A Better Split|You Create The Post|Join the Waitlist|Waitlist Opens Soon|Discover Splitpost/

beforeEach(() => {
  host.member = true
  where = ''
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('on app.splitpost.ca, public-only routes go to /app', () => {
  for (const path of ['/', '/join', '/join/creator', '/join/supporter', '/request-invite', '/pilot-access', '/no-such-page', '/tour']) {
    it(`${path} → /app → sign in (signed out), never a public page`, async () => {
      renderAt(path)
      await waitFor(() => expect(where).toBe('/sign-in?next=%2Fapp'))
      expect(text()).not.toMatch(LANDING)
      expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Sign in/i)
    })
  }

  it('signed in, a public-only route lands in the members area, with no redirect loop', async () => {
    const client = makeClient({ session: { access_token: 't', refresh_token: 'r', user: { id: 'user-1' } } })
    renderAt('/join', client)
    await waitFor(() => expect(where).toBe('/app'))
    expect(text()).not.toMatch(LANDING)
  })
})

describe('client-side navigation cannot show a public page', () => {
  it('navigating to /, /join or /pilot-access from inside the app goes to /app instead', async () => {
    renderAt('/privacy', makeClient(), ['/', '/join', '/pilot-access', '/request-invite'])
    for (const to of ['/', '/join', '/pilot-access', '/request-invite']) {
      await act(async () => fireEvent.click(screen.getByTestId(`go-${to}`)))
      await waitFor(() => expect(where).toBe('/sign-in?next=%2Fapp'))
      expect(text(), to).not.toMatch(LANDING)
    }
  })

  it('the header and footer offer only member links, plus one labelled link to the public website', async () => {
    renderAt('/sign-in')
    await screen.findByRole('heading', { level: 1 })
    const links = [...document.querySelectorAll('a')].map((a) => a.getAttribute('href'))
    for (const href of links) {
      expect(['/app', '/sign-in', '/sign-up', '/forgot-password', '/privacy', 'https://www.splitpost.ca', '#main'], String(href)).toContain(href)
    }
    expect(links).not.toContain('/')
    expect(links).not.toContain('/join')
    const site = screen.getByTestId('public-site-link')
    expect(site.getAttribute('href')).toBe('https://www.splitpost.ca')
    expect(site.textContent).toMatch(/Splitpost website/)
    expect(screen.getByRole('link', { name: 'Splitpost home' }).getAttribute('href')).toBe('/app')
    expect(document.querySelector('[data-testid="header-waitlist-cta"]')).toBeNull()
  })

  it('the logo goes to /app (which asks a signed-out visitor to sign in)', async () => {
    renderAt('/privacy')
    await act(async () => fireEvent.click(screen.getByRole('link', { name: 'Splitpost home' })))
    await waitFor(() => expect(where).toBe('/sign-in?next=%2Fapp'))
  })
})

describe('the member pages still work on app.splitpost.ca', () => {
  it('sign in shows the sign in form, with no redirect', async () => {
    renderAt('/sign-in')
    expect(await screen.findByLabelText(/Email/i)).toBeTruthy()
    expect(where).toBe('/sign-in')
  })

  it('password reset shows its form', async () => {
    renderAt('/forgot-password')
    expect(await screen.findByLabelText(/Email/i)).toBeTruthy()
    expect(where).toBe('/forgot-password')
  })

  it('the invitation link stays scanner-safe: nothing is verified until Continue, and the code leaves the address bar', async () => {
    const client = makeClient()
    renderAt(`/auth/confirm#token_hash=${TOKEN}&type=invite`, client)
    const button = await screen.findByRole('button', { name: /Continue/i })
    expect(client.auth.verifyOtp).not.toHaveBeenCalled()
    await waitFor(() => expect(where).toBe('/auth/confirm'))
    await act(async () => fireEvent.click(button))
    await waitFor(() => expect(client.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: TOKEN, type: 'invite' }))
  })

  it('setting a password needs a session (signed out goes to sign in, not to a public page)', async () => {
    renderAt('/auth/set-password')
    await waitFor(() => expect(where).toBe('/sign-in?next=%2Fauth%2Fset-password'))
  })

  it('the privacy notice is available at /privacy, and its back link goes to /app', async () => {
    renderAt('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: /Privacy Notice/i })).toBeTruthy()
    expect(where).toBe('/privacy')
    expect(screen.getByRole('link', { name: /Back to Splitpost/i }).getAttribute('href')).toBe('/app')
  })
})

describe('every other address is unchanged', () => {
  it('Previews and local builds still serve the public pages', async () => {
    host.member = false
    renderAt('/')
    expect(text()).toMatch(LANDING)
    cleanup()
    renderAt('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: /Privacy Notice/i })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Back to Splitpost/i }).getAttribute('href')).toBe('/')
  })
})
