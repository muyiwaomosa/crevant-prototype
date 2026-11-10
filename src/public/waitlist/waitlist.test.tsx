// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
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
    expect(screen.getByText('The waitlist opens once our privacy notice is published.')).toBeTruthy()
    expect(document.querySelector('script[src*="challenges.cloudflare.com"]')).toBeNull()
  })

  it('reads only the acquisition source, and only when well formed', () => {
    expect(readAcquisition('?src=Instagram&c=launch_1')).toEqual({ source: 'instagram' })
    expect(readAcquisition('?src=<script>')).toEqual({ source: null })
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
    fireEvent.click(screen.getByLabelText(/I agree that Crevant can store these details/))
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
    expect(screen.queryByLabelText(/updates about Crevant/)).toBeNull()
    expect(screen.getAllByRole('checkbox').map((c) => c.closest('label')?.textContent)).not.toContainEqual(expect.stringMatching(/market|updates|news/i))
    expect(screen.getByRole('link', { name: 'privacy notice' }).getAttribute('href')).toBe('/privacy')
  })

  it('asks for platform and audience only after "Yes", and never for a link', () => {
    setup()
    expect(screen.queryByTestId('waitlist-sharing-details')).toBeNull()
    fireEvent.click(screen.getByLabelText('Yes'))
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
    fireEvent.click(screen.getByLabelText('Yes'))
    fireEvent.change(screen.getByLabelText(/Where\?/), { target: { value: 'youtube' } })
    await tokenReady()
    submit()
    await waitFor(() => expect(screen.getByTestId('waitlist-success')).toBeTruthy())
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
      turnstileToken: 'turnstile-token',
      website: '',
    })
    expect(screen.getByText("Thanks, you're on the waitlist.")).toBeTruthy()
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
