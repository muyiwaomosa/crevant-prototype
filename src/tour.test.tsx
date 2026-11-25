// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import App from './App'
import { resolveEntry } from './entry'

// The public sample tour (/tour) is retired: it showed an obsolete
// creator-specific points model. Its addresses now redirect to the homepage,
// and the sample prototype is served only as the frozen production demo.

const TOUR_PATHS = [
  '/tour',
  '/tour/',
  '/tour/welcome',
  '/tour/discover',
  '/tour/create',
  '/tour/rewards',
  '/tour/profile',
  '/tour/profile/tools',
  '/tour/creator/amara',
]

beforeEach(() => {
  localStorage.clear()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
  window.matchMedia ??= ((q: string) => ({
    matches: false,
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  window.IntersectionObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  } as unknown as typeof IntersectionObserver
})
afterEach(() => {
  cleanup()
  window.history.replaceState(null, '', '/')
})

describe('the retired sample tour', () => {
  it.each(TOUR_PATHS)('%s redirects to the homepage of the public site', (path) => {
    expect(resolveEntry({ hostname: 'localhost', pathname: path, search: '?invite=7c1e94a2b05d3f68e1a9', hash: '' })).toEqual({
      kind: 'public',
      redirectTo: '/',
    })
  })
})

describe('production fallback rendering', () => {
  it('renders the prototype at the root with no tour banner and no public site', () => {
    window.history.replaceState(null, '', '/discover')
    const { container, queryByRole } = render(<App />)
    expect(queryByRole('complementary', { name: 'Sample tour' })).toBeNull()
    expect(container.textContent).not.toContain('Sample tour of an early concept.')
    expect(container.textContent).not.toContain('You need the right 1,000')
    expect(container.textContent).not.toContain('Request an invitation')
  })
})
