// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemberAreaBoundary, isLoadFailure } from './MemberAreaLoading'

function Broken({ error }: { error: Error }): never {
  throw error
}

describe('the members area recovers from errors instead of a blank page', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('recognises a chunk that no longer exists after an update', () => {
    expect(isLoadFailure(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true)
    expect(isLoadFailure(new TypeError('Importing a module script failed.'))).toBe(true)
    expect(isLoadFailure(new Error('Cannot read properties of undefined'))).toBe(false)
  })

  it('asks for a reload when Splitpost was updated while the page was open', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <MemberAreaBoundary>
        <Broken error={new TypeError('Failed to fetch dynamically imported module: /assets/x.js')} />
      </MemberAreaBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'Splitpost needs a reload' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to Home' }).getAttribute('href')).toBe('/app')
  })

  it('explains any other error and says saved work is kept, without showing the error text', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(
      <MemberAreaBoundary>
        <Broken error={new Error('secret internal detail')} />
      </MemberAreaBoundary>,
    )
    expect(screen.getByRole('heading', { name: 'Something went wrong on this page' })).toBeTruthy()
    expect(document.body.textContent).toContain('Anything you already posted or saved is kept.')
    expect(document.body.textContent).not.toContain('secret internal detail')
  })
})
