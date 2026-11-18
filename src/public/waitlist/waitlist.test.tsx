// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PublicLayout } from '../PublicLayout'
import { readAcquisition, readWaitlistConfig } from './config'
import { WaitlistForm } from './WaitlistForm'
import { JoinPage } from '../JoinPage'
import type { MountTurnstile } from './turnstile'
import type { ApprovedNotice } from '../privacy/notice'

// A stand-in approved notice for these tests only. The repository has none.
const NOTICE: ApprovedNotice = { version: 'notice-2026-11', effectiveDate: '2026-11-15', Body: () => null }

afterEach(cleanup)

const ENV = {
  VITE_WAITLIST_FORM_ENABLED: 'true',
  VITE_TURNSTILE_SITE_KEY: '0x4AAAAAAAtest',
  VITE_PRIVACY_NOTICE_URL: '/privacy',
  VITE_PRIVACY_NOTICE_VERSION: 'notice-2026-11',
  VITE_WAITLIST_ENDPOINT: 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist',
}

describe('waitlist switch (browser)', () => {
  it('is off unless every setting is present and the flag is exactly "true"', () => {
    expect(readWaitlistConfig({})).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_WAITLIST_FORM_ENABLED: 'TRUE' }, NOTICE)).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_WAITLIST_FORM_ENABLED: '1' }, NOTICE)).toBeNull()
    for (const k of ['VITE_TURNSTILE_SITE_KEY', 'VITE_PRIVACY_NOTICE_URL', 'VITE_PRIVACY_NOTICE_VERSION', 'VITE_WAITLIST_ENDPOINT']) {
      expect(readWaitlistConfig({ ...ENV, [k]: '' }, NOTICE), k).toBeNull()
    }
    expect(readWaitlistConfig({ ...ENV, VITE_PRIVACY_NOTICE_VERSION: 'Draft 1' }, NOTICE)).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_PRIVACY_NOTICE_URL: 'javascript:alert(1)' })).toBeNull()
    for (const bad of [
      'http://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist',
      'https://kpudeppgokpjhvaqrprn.supabase.co/rest/v1/rpc/anything',
      'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/other',
      'https://evil.example/functions/v1/join-waitlist',
      'https://kpudeppgokpjhvaqrprn.supabase.co.evil.example/functions/v1/join-waitlist',
    ]) {
      expect(readWaitlistConfig({ ...ENV, VITE_WAITLIST_ENDPOINT: bad }, NOTICE), bad).toBeNull()
    }
    expect(readWaitlistConfig({ ...ENV, VITE_WAITLIST_ENDPOINT: 'http://127.0.0.1:54321/functions/v1/join-waitlist' }, NOTICE)).not.toBeNull()
    expect(readWaitlistConfig(ENV, NOTICE)).toEqual({
      endpoint: 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist',
      turnstileSiteKey: '0x4AAAAAAAtest',
      noticeUrl: '/privacy',
      noticeVersion: 'notice-2026-11',
    })
  })

  it('stays off without an approved privacy notice, with a different version, or anywhere but /privacy', () => {
    expect(readWaitlistConfig(ENV, null)).toBeNull()
    expect(readWaitlistConfig(ENV)).toBeNull()
    expect(readWaitlistConfig(ENV, { ...NOTICE, version: 'notice-2026-12' })).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_PRIVACY_NOTICE_URL: 'https://example.com/privacy' }, NOTICE)).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_PRIVACY_NOTICE_URL: '/privacy-test' }, NOTICE)).toBeNull()
    expect(readWaitlistConfig(ENV, NOTICE)).not.toBeNull()
  })

  it('this build has the form switched off', () => {
    expect(readWaitlistConfig(import.meta.env as unknown as Record<string, unknown>)).toBeNull()
  })

  it('/join shows no form, input or Turnstile script while off', () => {
    const { container } = render(
      <MemoryRouter>
        <JoinPage env={{}} />
      </MemoryRouter>,
    )
    expect(container.querySelector('form, input, select, textarea')).toBeNull()
    expect(screen.getByText("You can't sign up just yet.")).toBeTruthy()
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull()
  })

  it('reads the acquisition channel and a creator code separately, and only when well formed', () => {
    expect(readAcquisition('?src=Instagram&c=launch_1')).toEqual({ source: 'instagram', creatorRef: null })
    expect(readAcquisition('?src=<script>')).toEqual({ source: null, creatorRef: null })
    expect(readAcquisition('?src=ig_bio&ref=0123456789ABCDEF0123')).toEqual({ source: 'ig_bio', creatorRef: '0123456789abcdef0123' })
    for (const bad of ['?ref=priya', '?ref=0123456789abcdef012', '?ref=0123456789abcdef0123x', '?ref=../../admin']) {
      expect(readAcquisition(bad).creatorRef, bad).toBeNull()
    }
  })

})

describe('waitlist form', () => {
  const config = readWaitlistConfig(ENV, NOTICE)!
  let widgetReset = vi.fn()
  const mount: MountTurnstile = async (_el, _key, onToken) => {
    widgetReset = vi.fn()
    setTimeout(() => onToken('turnstile-token'), 0)
    return { reset: widgetReset, remove: vi.fn() }
  }
  const respond = (status: string, code = 200) => vi.fn(async () => new Response(JSON.stringify({ status }), { status: code }))
  const setup = (fetchImpl = respond('ok'), search = '?src=newsletter') => {
    render(
      <MemoryRouter>
        <WaitlistForm config={config} mount={mount} fetchImpl={fetchImpl as unknown as typeof fetch} search={search} />
      </MemoryRouter>,
    )
    return fetchImpl
  }
  const fillRequired = () => {
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'maya@example.com' } })
    fireEvent.click(screen.getByLabelText("I'm 18 or older."))
    fireEvent.click(screen.getByLabelText(/I agree that Splitpost can store these details/))
  }
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Join the Waitlist' }))
  // Let the (fake) security check hand over its token.
  const tokenReady = () => act(() => new Promise((r) => setTimeout(r, 20)))

  it('requires email, 18+ and waitlist consent, and sends nothing until they are given', async () => {
    const f = setup()
    await waitFor(() => expect(screen.getByTestId('turnstile')).toBeTruthy())
    submit()
    expect(screen.getByText('Please enter a valid email address.')).toBeTruthy()
    expect(screen.getByText("Please confirm you're 18 or older.")).toBeTruthy()
    expect(screen.getByText('Please agree so we can contact you about the pilot.')).toBeTruthy()
    expect(f).not.toHaveBeenCalled()
  })

  it('offers no marketing consent until email addresses can be verified', () => {
    setup()
    expect(screen.queryByLabelText(/updates about Splitpost/)).toBeNull()
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).not.toContainEqual(expect.stringMatching(/market|updates|news/i))
    expect(screen.getByRole('link', { name: 'privacy notice' }).getAttribute('href')).toBe('/privacy')
  })

  it('asks for platform and audience only after "Yes", and never for a link', () => {
    setup()
    expect(screen.queryByTestId('waitlist-sharing-details')).toBeNull()
    fireEvent.click(within(screen.getByTestId('waitlist-sharing')).getByLabelText('Yes'))
    expect(screen.getByTestId('waitlist-sharing-details')).toBeTruthy()
    expect(screen.queryByLabelText(/link/i)).toBeNull()
    expect(document.querySelector('input[type="url"]')).toBeNull()
    fireEvent.click(screen.getByLabelText('Not yet'))
    expect(screen.queryByTestId('waitlist-sharing-details')).toBeNull()
  })

  it('hides the honeypot from people and assistive technology', () => {
    setup()
    const hp = document.getElementById('wl-website') as HTMLInputElement
    expect(hp.tabIndex).toBe(-1)
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('sends exactly the expected fields to the server function, with no key or token', async () => {
    const f = setup()
    fillRequired()
    fireEvent.click(screen.getByLabelText('Discovering new creators'))
    fireEvent.click(within(screen.getByTestId('waitlist-sharing')).getByLabelText('Yes'))
    fireEvent.change(screen.getByLabelText(/Where\?/), { target: { value: 'youtube' } })
    await tokenReady()
    submit()
    await waitFor(() => expect(screen.getByTestId('waitlist-success')).toBeTruthy())
    // The success screen says how to leave the waitlist, by email to the privacy contact.
    const leave = screen.getByTestId('waitlist-leave')
    expect(leave.textContent).toContain('privacy@splitpost.ca')
    expect(leave.querySelector('a')?.getAttribute('href')).toBe('mailto:privacy@splitpost.ca')
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist')
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'maya@example.com',
      interests: ['discover_creators'],
      sharesContent: 'yes',
      platform: 'youtube',
      audienceBand: null,
      source: 'newsletter',
      ageConfirmed: true,
      waitlistConsent: true,
      noticeVersion: 'notice-2026-11',
      introducedByCreator: null,
      creatorRef: null,
      turnstileToken: 'turnstile-token',
      website: '',
    })
    expect(screen.getByRole('heading', { level: 1, name: "You're on the list!" })).toBeTruthy()
  })

  describe('the success screen on /join', () => {
    const renderJoin = (fetchImpl = respond('ok')) => {
      render(
        <MemoryRouter initialEntries={['/join']}>
          <JoinPage env={{ ...ENV, VITE_PRIVACY_NOTICE_VERSION: '1.0' }} mount={mount} fetchImpl={fetchImpl as unknown as typeof fetch} />
        </MemoryRouter>,
      )
      return fetchImpl
    }

    it('replaces the heading, introduction, form and pilot details once the server confirms', async () => {
      renderJoin()
      expect(screen.getByRole('heading', { level: 1, name: 'Join the Waitlist' })).toBeTruthy()
      fillRequired()
      await tokenReady()
      submit()
      await waitFor(() => expect(screen.getByTestId('waitlist-success')).toBeTruthy())
      expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual(["You're on the list!"])
      for (const id of ['join-intro', 'join-pilot-details']) expect(screen.queryByTestId(id)).toBeNull()
      expect(document.querySelector('form, input, select, textarea')).toBeNull()
      expect(screen.getByText(/Thanks for joining Splitpost! We're inviting people to try the platform in small groups\. If you're selected for the pilot, we'll send you an invitation by email\./)).toBeTruthy()
      expect(screen.getByTestId('waitlist-success-disclosure').textContent).toBe("Joining the waitlist doesn't guarantee an invitation.")
      // One action: Explore Splitpost, to the homepage. The other links are the privacy ones.
      const links = [...document.querySelectorAll('a')].map((a) => [a.textContent, a.getAttribute('href')])
      expect(links).toEqual([
        ['Explore Splitpost', '/'],
        ['privacy@splitpost.ca', 'mailto:privacy@splitpost.ca'],
        ['Read our privacy notice', '/privacy'],
      ])
      expect(screen.getByTestId('waitlist-leave').textContent).toBe(
        'Changed your mind? Email privacy@splitpost.ca from the address you signed up with to request deletion of your details.',
      )
    })

    it('moves keyboard focus to the heading, without making it a tab stop', async () => {
      renderJoin()
      fillRequired()
      await tokenReady()
      submit()
      const h = await screen.findByRole('heading', { level: 1, name: "You're on the list!" })
      expect(document.activeElement).toBe(h)
      expect(h.getAttribute('tabindex')).toBe('-1')
    })

    it("hides the header's waitlist button only while the success screen shows, keeping the logo, navigation and footer", async () => {
      window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
      render(
        <MemoryRouter initialEntries={['/join']}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<p>Home page</p>} />
              <Route path="join" element={<JoinPage env={{ ...ENV, VITE_PRIVACY_NOTICE_VERSION: '1.0' }} mount={mount} fetchImpl={respond('ok') as unknown as typeof fetch} />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )
      const footerJoin = () => screen.getByRole('navigation', { name: 'Footer' }).querySelector('a[href="/join"]')
      // The normal /join page keeps the header button.
      expect(screen.getByTestId('header-waitlist-cta')).toBeTruthy()
      fillRequired()
      await tokenReady()
      submit()
      await screen.findByRole('heading', { level: 1, name: "You're on the list!" })
      // Already gone when the heading appears: no frame shows both.
      expect(screen.queryByTestId('header-waitlist-cta')).toBeNull()
      expect(screen.getByRole('link', { name: 'Splitpost home' })).toBeTruthy()
      expect(screen.getByRole('navigation', { name: 'Site' })).toBeTruthy()
      expect(footerJoin()).toBeTruthy()
      expect(document.activeElement?.textContent).toBe("You're on the list!")
      // Leaving the success screen brings it back.
      fireEvent.click(screen.getByRole('link', { name: 'Explore Splitpost' }))
      await screen.findByText('Home page')
      expect(screen.getByTestId('header-waitlist-cta')).toBeTruthy()
    })

    it('keeps the header button while a failed attempt leaves the form on screen', async () => {
      window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
      render(
        <MemoryRouter initialEntries={['/join']}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="join" element={<JoinPage env={{ ...ENV, VITE_PRIVACY_NOTICE_VERSION: '1.0' }} mount={mount} fetchImpl={respond('verification_failed', 400) as unknown as typeof fetch} />} />
            </Route>
          </Routes>
        </MemoryRouter>,
      )
      fillRequired()
      await tokenReady()
      submit()
      await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).not.toBe(''))
      expect(screen.getByTestId('header-waitlist-cta')).toBeTruthy()
    })

    it('shows the same screen for a repeat signup, which the server also answers ok', async () => {
      renderJoin(respond('ok'))
      fillRequired()
      await tokenReady()
      submit()
      await waitFor(() => expect(screen.getByTestId('waitlist-success')).toBeTruthy())
    })

    it('never shows it without a confirmed ok: errors stay on the form, in its live region', async () => {
      for (const status of ['verification_failed', 'rate_limited', 'closed', 'invalid', 'notice_changed']) {
        renderJoin(respond(status, 400))
        fillRequired()
        await tokenReady()
        submit()
        await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).not.toBe(''))
        expect(screen.queryByTestId('waitlist-success')).toBeNull()
        expect(screen.getByRole('heading', { level: 1, name: 'Join the Waitlist' })).toBeTruthy()
        cleanup()
      }
      const broken = vi.fn(async () => { throw new Error('offline') })
      renderJoin(broken as unknown as ReturnType<typeof respond>)
      fillRequired()
      await tokenReady()
      submit()
      await waitFor(() => expect(document.querySelector('[aria-live="polite"]')?.textContent).toContain('Something went wrong'))
      expect(screen.queryByTestId('waitlist-success')).toBeNull()
    })
  })

  it('is one form for everyone: nobody is asked to choose creator or fan, and everyone sees the same questions', () => {
    const { container } = render(
      <MemoryRouter>
        <WaitlistForm config={readWaitlistConfig(ENV, NOTICE)!} mount={async () => ({ reset() {}, remove() {} })} fetchImpl={vi.fn()} search="" />
      </MemoryRouter>,
    )
    const text = container.textContent ?? ''
    expect(text).not.toMatch(/How do you plan to use Splitpost|Create content|Discover and support creators|account type|creator or (a )?fan|as a (creator|fan|supporter)/i)
    expect(container.querySelector('input[name="wl-intent"]')).toBeNull()
    // The optional questions are the same for everyone, always shown.
    expect(screen.getByTestId('waitlist-sharing')).toBeTruthy()
    expect(screen.getByTestId('waitlist-introduced')).toBeTruthy()
  })

  it('asks only yes or no about a creator introduction, never for a name or handle', () => {
    setup()
    const q = screen.getByTestId('waitlist-introduced')
    fireEvent.click(within(q).getByLabelText('Yes'))
    expect(screen.queryByLabelText(/name or handle/i)).toBeNull()
    expect(q.querySelectorAll('input:not([type="radio"])')).toHaveLength(0)
    expect(q.textContent).toContain("It names nobody and doesn't follow anyone.")
  })

  it('sends the self-reported introduction and the creator code as separate fields, and no creator or fan choice', async () => {
    const f = setup(respond('ok'), '?src=ig_bio&ref=0123456789abcdef0123')
    fillRequired()
    fireEvent.click(within(screen.getByTestId('waitlist-introduced')).getByLabelText('Yes'))
    await tokenReady()
    submit()
    await waitFor(() => expect(screen.getByTestId('waitlist-success')).toBeTruthy())
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(body).toMatchObject({
      source: 'ig_bio',
      sharesContent: null,
      platform: null,
      introducedByCreator: true,
      creatorRef: '0123456789abcdef0123',
    })
    expect(Object.keys(body)).not.toContain('introducerReported')
    expect(Object.keys(body)).not.toContain('intent')
  })

  it('drops the platform and audience if someone changes "Yes" to "Not yet"', async () => {
    const f = setup()
    fillRequired()
    fireEvent.click(within(screen.getByTestId('waitlist-sharing')).getByLabelText('Yes'))
    fireEvent.change(screen.getByLabelText(/Where\?/), { target: { value: 'youtube' } })
    fireEvent.click(within(screen.getByTestId('waitlist-sharing')).getByLabelText('Not yet'))
    await tokenReady()
    submit()
    await waitFor(() => expect(screen.getByTestId('waitlist-success')).toBeTruthy())
    const body = JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect([body.sharesContent, body.platform, body.audienceBand]).toEqual(['not_yet', null, null])
  })

  it('shows clear messages for closed, rate limited and failed checks, and resets the check', async () => {
    for (const [status, message] of [
      ['closed', "The waitlist isn't open right now. Please try again later."],
      ['rate_limited', 'Too many attempts. Please try again later.'],
      ['verification_failed', 'Please complete the check above and try again.'],
      ['notice_changed', 'Our privacy notice has been updated. Please reload the page and try again.'],
    ] as const) {
      setup(respond(status, 400))
      fillRequired()
      await tokenReady()
      submit()
      await waitFor(() => expect(screen.getByTestId('waitlist-message').textContent).toBe(message))
      expect(widgetReset).toHaveBeenCalled()
      cleanup()
    }
  })

  it('shows a generic message when the network fails', async () => {
    setup(vi.fn(async () => Promise.reject(new Error('offline'))))
    fillRequired()
    await tokenReady()
    submit()
    await waitFor(() => expect(screen.getByTestId('waitlist-message').textContent).toBe('Something went wrong. Please try again.'))
  })
})

describe('waitlist and server function agree', () => {
  it('render Turnstile with the action the server requires', async () => {
    const { TURNSTILE_ACTION } = await import('./turnstile')
    const server = await import('../../../supabase/functions/join-waitlist/handler')
    expect(TURNSTILE_ACTION).toBe(server.TURNSTILE_ACTION)
  })
})

describe('waitlist button wording follows whether registration is open', () => {
  it('says "Waitlist Opens Soon" while closed and "Join the Waitlist" once the form is configured', async () => {
    const { waitlistCta, WAITLIST_OPEN, WAITLIST_CLOSED_COPY } = await import('./status')
    expect(waitlistCta(false)).toBe('Waitlist Opens Soon')
    expect(waitlistCta(true)).toBe('Join the Waitlist')
    // This repository has no approved notice, so every build is closed today.
    expect(WAITLIST_OPEN).toBe(false)
    expect(waitlistCta()).toBe('Waitlist Opens Soon')
    // The closed wording never claims anyone can sign up.
    for (const t of Object.values(WAITLIST_CLOSED_COPY)) expect(t).not.toMatch(/sign up now|join now|register now/i)
  })
  it('is open exactly when the form would show: same settings, same approved notice', () => {
    expect(readWaitlistConfig(ENV, NOTICE)).not.toBeNull()
    expect(readWaitlistConfig(ENV, null)).toBeNull()
  })
})
