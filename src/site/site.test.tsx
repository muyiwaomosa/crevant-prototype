// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { SiteRoutes } from './SiteApp'
import { PublicRoutes } from '../public/PublicApp'

// Pages that exist only in the full app, for invited members.
const MEMBER_PATHS = ['/sign-in', '/forgot-password', '/auth/confirm', '/auth/set-password', '/app', '/app/account', '/app/anything']

function Where() {
  return <span data-testid="where">{useLocation().pathname}</span>
}
function renderSite(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <SiteRoutes />
      <Routes>
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}
const memberHrefs = (root: HTMLElement) =>
  [...root.querySelectorAll('a[href]')].map((a) => a.getAttribute('href') || '').filter((h) => /sign-in|forgot-password|\/auth\/|^\/app(\/|$)/.test(h))

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo
})
afterEach(cleanup)

describe('public site build', () => {
  it('shows the landing page with no sign in or member links', () => {
    const { container } = renderSite('/')
    expect(container.querySelector('h1')).toBeTruthy()
    expect(memberHrefs(container)).toEqual([])
    expect(container.textContent).not.toMatch(/Sign in|Already invited|Your account/)
  })

  it('serves /join, and sends the old invitation and role pages there', () => {
    for (const p of ['/join', '/join/creator', '/join/supporter', '/request-invite']) {
      const { container, getByTestId } = renderSite(p)
      expect(getByTestId('where').textContent, p).toBe('/join')
      expect(container.textContent).toContain('The waitlist opens once our privacy notice is published.')
      cleanup()
    }
  })

  it('treats every member page as not found, with nothing to type into', () => {
    for (const p of MEMBER_PATHS) {
      const { container, getByRole } = renderSite(p)
      expect(getByRole('heading', { name: 'Page not found' }), p).toBeTruthy()
      expect(container.querySelector('form, input, select, textarea'), p).toBeNull()
      expect(memberHrefs(container), p).toEqual([])
      cleanup()
    }
  })
})

describe('full app (Preview and local)', () => {
  it('still links to sign in from the header, hero and footer', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/']}>
        <PublicRoutes />
      </MemoryRouter>,
    )
    expect(memberHrefs(container).filter((h) => h === '/sign-in').length).toBe(3)
  })
})
