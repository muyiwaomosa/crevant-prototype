// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { readAcquisition, readWaitlistConfig } from './config'
import { WaitlistForm } from './WaitlistForm'
import { JoinPage } from '../JoinPage'
import type { MountTurnstile } from './turnstile'

afterEach(cleanup)

const ENV = {
  VITE_WAITLIST_FORM_ENABLED: 'true',
  VITE_TURNSTILE_SITE_KEY: '0x4AAAAAAAtest',
  VITE_PRIVACY_NOTICE_URL: '/privacy',
  VITE_PRIVACY_NOTICE_VERSION: 'notice-2026-11',
  VITE_SUPABASE_URL: 'https://kpudeppgokpjhvaqrprn.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
}

describe('waitlist switch (browser)', () => {
  it('is off unless every setting is present and the flag is exactly "true"', () => {
    expect(readWaitlistConfig({})).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_WAITLIST_FORM_ENABLED: 'TRUE' })).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_WAITLIST_FORM_ENABLED: '1' })).toBeNull()
    for (const k of ['VITE_TURNSTILE_SITE_KEY', 'VITE_PRIVACY_NOTICE_URL', 'VITE_PRIVACY_NOTICE_VERSION', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY']) {
      expect(readWaitlistConfig({ ...ENV, [k]: '' }), k).toBeNull()
    }
    expect(readWaitlistConfig({ ...ENV, VITE_PRIVACY_NOTICE_VERSION: 'Draft 1' })).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_PRIVACY_NOTICE_URL: 'javascript:alert(1)' })).toBeNull()
    expect(readWaitlistConfig({ ...ENV, VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toBeNull()
    expect(readWaitlistConfig(ENV)).toEqual({
      endpoint: 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist',
      publishableKey: 'sb_publishable_test',
      turnstileSiteKey: '0x4AAAAAAAtest',
      noticeUrl: '/privacy',
      noticeVersion: 'notice-2026-11',
    })
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

  it('reads the acquisition source and campaign only when well formed', () => {
    expect(readAcquisition('?src=Instagram&c=launch_1')).toEqual({ source: 'instagram', campaign: 'launch_1' })
    expect(readAcquisition('?src=<script>&c=')).toEqual({ source: null, campaign: null })
  })
})

describe('waitlist form', () => {
  const config = readWaitlistConfig(ENV)!
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

  it('keeps marketing consent separate, optional and unticked', () => {
    setup()
    const marketing = screen.getByLabelText(/Also email me occasional updates about Crevant/) as HTMLInputElement
    expect(marketing.checked).toBe(false)
    expect(screen.getByRole('link', { name: 'privacy notice' }).getAttribute('href')).toBe('/privacy')
  })

  it('asks for platform, audience and link only after "Yes"', () => {
    setup()
    expect(screen.queryByTestId('waitlist-sharing-details')).toBeNull()
    fireEvent.click(screen.getByLabelText('Yes'))
    expect(screen.getByTestId('waitlist-sharing-details')).toBeTruthy()
    fireEvent.click(screen.getByLabelText('Not yet'))
    expect(screen.queryByTestId('waitlist-sharing-details')).toBeNull()
  })

  it('hides the honeypot from people and assistive technology', () => {
    setup()
    const hp = document.getElementById('wl-website') as HTMLInputElement
    expect(hp.tabIndex).toBe(-1)
    expect(hp.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('sends exactly the expected fields to the server function, with the publishable key', async () => {
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
    expect((init.headers as Record<string, string>).apikey).toBe('sb_publishable_test')
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'maya@example.com',
      interests: ['discover_creators'],
      sharesContent: 'yes',
      platform: 'youtube',
      audienceBand: null,
      publicLink: null,
      source: 'newsletter',
      campaign: null,
      ageConfirmed: true,
      waitlistConsent: true,
      marketingConsent: false,
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
