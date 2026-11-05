// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import App from './App'
import { TOUR_BASE } from './entry'

const TOUR_PATHS = ['/tour', '/tour/welcome', '/tour/discover', '/tour/create', '/tour/rewards', '/tour/profile', '/tour/profile/tools']

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  window.IntersectionObserver ??= class { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } } as unknown as typeof IntersectionObserver
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

const go = (path: string) => window.history.replaceState(null, '', path)

describe('the sample tour', () => {
  it.each(TOUR_PATHS)('%s shows the sample data banner', (path) => {
    go(path)
    const { getByRole } = render(<App basename={TOUR_BASE} banner />)
    const banner = getByRole('note', { name: 'Sample tour' })
    expect(banner.textContent).toContain('Everything here is made up')
    expect(banner.querySelector('a')?.getAttribute('href')).toBe('/')
  })

  it('links inside the tour stay inside /tour', () => {
    go('/tour/discover')
    const { container } = render(<App basename={TOUR_BASE} banner />)
    const hrefs = [...container.querySelectorAll('a[href^="/"]')].map((a) => a.getAttribute('href')!)
    const outside = hrefs.filter((h) => !h.startsWith('/tour') && h !== '/')
    expect(outside).toEqual([])
  })

  it('first visit to /tour starts the prototype onboarding', () => {
    go('/tour')
    render(<App basename={TOUR_BASE} banner />)
    expect(window.location.pathname).toBe('/tour/welcome')
  })
})

describe('production fallback rendering', () => {
  it('renders the prototype at the root with no banner and no public site', () => {
    go('/discover')
    const { container, queryByRole } = render(<App />)
    expect(queryByRole('note', { name: 'Sample tour' })).toBeNull()
    expect(container.textContent).not.toContain('Turn what you create into something that lasts')
    expect(container.textContent).not.toContain('Request an invitation')
  })
})
