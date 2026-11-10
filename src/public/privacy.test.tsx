// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PrivacyPage } from './PrivacyPage'
import { APPROVED_NOTICE } from './privacy/notice'
import { INDEXABLE_PATHS, robotsDirective } from './robots'
import { SiteRoutes } from '../site/SiteApp'
import { PublicRoutes } from './PublicApp'
import { PRODUCTION_SITE_APPROVED, INDEXING_ALLOWED } from '../build-flags'
import { resolveEntry } from '../entry'

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

describe('/privacy before a notice is approved', () => {
  it('there is no approved notice in this repository', () => {
    expect(APPROVED_NOTICE).toBeNull()
  })

  it('shows the approved wording: the notice is coming and no registrations are collected, with nothing to fill in', () => {
    const { container } = render(
      <MemoryRouter>
        <PrivacyPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Privacy Notice')
    const box = screen.getByTestId('privacy-not-published')
    expect(box.querySelectorAll('p')[0].textContent).toBe("We're preparing Crevant for its first members.")
    expect(box.querySelectorAll('p')[1].textContent).toBe(
      "Our privacy notice will be published before waitlist registration opens. We're not collecting waitlist registrations yet.",
    )
    expect(container.querySelector('form, input, select, textarea')).toBeNull()
    expect(screen.queryByTestId('privacy-notice')).toBeNull()
  })

  it('is served at /privacy in both the public site and the full app', () => {
    for (const Routes of [SiteRoutes, PublicRoutes]) {
      render(
        <MemoryRouter initialEntries={['/privacy']}>
          <Routes />
        </MemoryRouter>,
      )
      expect(screen.getByTestId('privacy-not-published')).toBeTruthy()
      cleanup()
    }
  })

  it('shows an approved notice only when one is supplied, with its version and date', () => {
    render(
      <MemoryRouter>
        <PrivacyPage notice={{ version: 'notice-2027-01', effectiveDate: '2027-01-15', Body: () => <p>Approved text</p> }} />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('privacy-notice').textContent).toContain('Version notice-2027-01, effective 2027-01-15')
    expect(screen.queryByTestId('privacy-not-published')).toBeNull()
  })
})

describe('search indexing in the browser', () => {
  it('is off in this build (only an approved Production build can turn it on)', () => {
    expect(PRODUCTION_SITE_APPROVED).toBe(false)
    expect(INDEXING_ALLOWED).toBe(false)
  })

  it('allows only the landing page and /join, and only when indexing is allowed', () => {
    expect(INDEXABLE_PATHS).toEqual(['/', '/join'])
    for (const p of ['/', '/join', '/join/']) expect(robotsDirective(p, true), p).toBe('index, follow')
    for (const p of ['/tour', '/tour/discover', '/privacy', '/sign-in', '/app', '/no-such-page', '/join/creator']) expect(robotsDirective(p, true), p).toBe('noindex')
    for (const p of ['/', '/join']) expect(robotsDirective(p, false), p).toBe('noindex')
  })

  it('the public pages set noindex in this build', () => {
    for (const path of ['/', '/join', '/privacy']) {
      render(
        <MemoryRouter initialEntries={[path]}>
          <SiteRoutes />
        </MemoryRouter>,
      )
      expect(document.querySelector('meta[name="robots"]')?.getAttribute('content'), path).toBe('noindex')
      cleanup()
    }
  })
})

describe('the demo address', () => {
  const at = (hostname: string, pathname = '/') => ({ hostname, pathname, search: '', hash: '' })
  it('keeps the demo there unless an approved Production build turns the fallback off', () => {
    expect(resolveEntry(at('crevant-prototype.vercel.app'))).toEqual({ kind: 'demo-fallback' })
    expect(resolveEntry(at('crevant-prototype.vercel.app'), { demoFallback: true })).toEqual({ kind: 'demo-fallback' })
    expect(resolveEntry(at('crevant-prototype.vercel.app'), { demoFallback: false })).toEqual({ kind: 'public' })
    expect(resolveEntry(at('crevant-prototype.vercel.app', '/tour'), { demoFallback: false })).toEqual({ kind: 'tour' })
  })
})
