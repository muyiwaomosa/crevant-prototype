// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { InviteBanner } from './InviteBanner'
import type { WaitlistConfig } from './config'

afterEach(cleanup)

const config: WaitlistConfig = {
  endpoint: 'https://kpudeppgokpjhvaqrprn.supabase.co/functions/v1/join-waitlist',
  turnstileSiteKey: '0x4AAAAAAAtest',
  noticeUrl: '/privacy',
  noticeVersion: 'notice-2026-11',
}
const CODE = '7c1e94a2b05d3f68e1a9'
const answer = (data: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(data), { status }))
const show = (fetchImpl: ReturnType<typeof vi.fn>, search = `?ref=${CODE}`) =>
  render(<InviteBanner config={config} fetchImpl={fetchImpl as unknown as typeof fetch} search={search} />)

describe('invitation banner on /join', () => {
  it("shows the creator's agreed name, and explains that following is the person's own choice later", async () => {
    const f = answer({ status: 'ok', invite: 'valid', name: 'Priya Raman' })
    show(f)
    const banner = await screen.findByTestId('invite-banner')
    expect(banner.textContent).toContain('Priya Raman invited you to Splitpost.')
    expect(banner.textContent).toContain('You choose Follow or Not now. Nobody is followed for you, and an invitation earns nothing for anyone.')
    expect(f).toHaveBeenCalledWith(config.endpoint, expect.objectContaining({ method: 'POST', body: JSON.stringify({ action: 'invite_preview', code: CODE }) }))
    // No follow button here: there is no account yet.
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('shows a generic invitation when the creator has not agreed to show a name', async () => {
    show(answer({ status: 'ok', invite: 'valid', name: null }))
    expect((await screen.findByTestId('invite-banner')).textContent).toContain('A creator in the Splitpost pilot invited you.')
  })

  it('fails safely: an unusable link gets a short note, a malformed one never reaches the server', async () => {
    show(answer({ status: 'ok', invite: 'unavailable' }))
    expect((await screen.findByTestId('invite-unusable')).textContent).toContain("This invitation link isn't active any more.")
    cleanup()
    const f = answer({})
    show(f, '?ref=https://evil.example')
    expect(await screen.findByTestId('invite-unusable')).toBeTruthy()
    expect(f).not.toHaveBeenCalled()
  })

  it('shows nothing when there is no link, or the server is closed, limited, unexpected or offline', async () => {
    const none = answer({})
    show(none, '?src=ig_bio')
    expect(none).not.toHaveBeenCalled()
    for (const f of [
      answer({ status: 'closed' }, 503),
      answer({ status: 'rate_limited' }, 429),
      answer({ status: 'ok', invite: 'valid', name: 'x'.repeat(41) + '<script>' }),
      vi.fn(async () => Promise.reject(new Error('offline'))),
    ]) {
      cleanup()
      show(f)
      await waitFor(() => expect(f).toHaveBeenCalled())
      expect(screen.queryByTestId('invite-unusable')).toBeNull()
      const b = screen.queryByTestId('invite-banner')
      if (b) expect(b.textContent).not.toContain('<script>')
    }
  })
})
