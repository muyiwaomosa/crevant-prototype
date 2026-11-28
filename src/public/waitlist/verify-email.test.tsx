// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { VerifyEmailPage } from './VerifyEmailPage'
import type { WaitlistConfig } from './config'

afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const config: WaitlistConfig = {
  endpoint: 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist',
  turnstileSiteKey: '0x4AAAAAAAtest',
  noticeUrl: '/privacy',
  noticeVersion: 'notice-2026-11',
}
const TOKEN = 'b'.repeat(64)
const answer = (data: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(data), { status }))
const show = (f: ReturnType<typeof vi.fn>, c: WaitlistConfig | null = config, hash = `#${TOKEN}`) => {
  window.history.replaceState(null, '', `/waitlist/verify${hash}`)
  return render(<MemoryRouter><VerifyEmailPage configOverride={c} fetchImpl={f as unknown as typeof fetch} /></MemoryRouter>)
}
const state = () => screen.getByTestId('waitlist-verify').getAttribute('data-state')

describe('waitlist email verification page (BL-009)', () => {
  it('posts only the token from after #, then removes it from the address bar', async () => {
    const f = answer({ status: 'verified' })
    show(f)
    await waitFor(() => expect(state()).toBe('verified'))
    expect(f).toHaveBeenCalledWith(config.endpoint, expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'verify_email', token: TOKEN }) }))
    expect(window.location.hash).toBe('')
    expect(screen.getByRole('heading').textContent).toBe('Your email is confirmed')
  })
  it('explains used, replaced or expired links', async () => {
    show(answer({ status: 'expired' }))
    await waitFor(() => expect(state()).toBe('expired'))
    expect(screen.getByRole('link', { name: 'Join the waitlist' })).toBeTruthy()
    cleanup()
    show(answer({ status: 'invalid' }))
    await waitFor(() => expect(state()).toBe('invalid'))
  })
  it('sends nothing for a malformed token, or while the waitlist is closed', () => {
    const f = answer({ status: 'verified' })
    show(f, config, '#not-a-token')
    expect(state()).toBe('invalid')
    cleanup()
    show(f, null)
    expect(state()).toBe('closed')
    expect(f).not.toHaveBeenCalled()
  })
  it('fails safely on a server error', async () => {
    show(answer({ status: 'error' }, 500))
    await waitFor(() => expect(state()).toBe('error'))
  })
})
