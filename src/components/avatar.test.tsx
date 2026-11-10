// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Avatar } from './ui'

afterEach(cleanup)

describe('Avatar', () => {
  it('shows the portrait when there is one', () => {
    const { container } = render(<Avatar name="Amara Okafor" hue={18} src="/media/tour/people/amara.jpg" />)
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/media/tour/people/amara.jpg')
    expect(container.querySelector('[data-avatar="initials"]')).toBeNull()
  })
  it('falls back to initials when the portrait fails to load', () => {
    const { container } = render(<Avatar name="Amara Okafor" hue={18} src="/media/tour/people/missing.jpg" />)
    fireEvent.error(container.querySelector('img')!)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-avatar="initials"]')?.textContent).toBe('AO')
  })
  it('shows initials when there is no portrait', () => {
    const { container } = render(<Avatar name="Lena Brooks" hue={190} />)
    expect(container.querySelector('[data-avatar="initials"]')?.textContent).toBe('LB')
  })
})
