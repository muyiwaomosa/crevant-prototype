// @vitest-environment jsdom
// BL-008: links in member text, and the visitor's next step while joining is closed.
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LinkedText, splitLinks } from '../lib/linkify'
import { JoinActions } from './PublicPostPage'

afterEach(cleanup)

describe('links in member text (BL-008)', () => {
  it('turns http, https and www addresses into safe links, leaving punctuation and other schemes as text', () => {
    expect(splitLinks('Recipe at https://example.com/soup. Enjoy!')).toEqual([
      { text: 'Recipe at ' },
      { text: 'https://example.com/soup', href: 'https://example.com/soup' },
      { text: '. Enjoy!' },
    ])
    expect(splitLinks('see www.example.org')).toEqual([{ text: 'see ' }, { text: 'www.example.org', href: 'https://www.example.org' }])
    expect(splitLinks('(https://en.wikipedia.org/wiki/Soup_(food))')[1]).toEqual({
      text: 'https://en.wikipedia.org/wiki/Soup_(food)',
      href: 'https://en.wikipedia.org/wiki/Soup_(food)',
    })
    for (const t of ['javascript:alert(1)', 'data:text/html,hi', 'no links here', 'http://', 'https://localhost/x'])
      expect(splitLinks(t).every((p) => !p.href)).toBe(true)
  })

  it('renders each link to open in a new tab without passing the page on', () => {
    render(<p>{LinkedText({ text: 'Shop: https://shop.example.com <b>' })}</p>)
    const a = screen.getByRole('link', { name: 'https://shop.example.com' })
    expect(a.getAttribute('href')).toBe('https://shop.example.com')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('nofollow ugc noopener noreferrer')
    // Text is text: nothing in it becomes markup.
    expect(screen.getByText(/<b>/)).toBeTruthy()
  })
})

describe("a shared post's next step (BL-008)", () => {
  it('while joining is closed: says so plainly, keeps the invitation, and every action works (no dead end)', () => {
    render(
      <MemoryRouter>
        <JoinActions ref_="0123456789abcdef" username="mia" registrationOpen={false} />
      </MemoryRouter>,
    )
    const box = within(screen.getByTestId('join-closed'))
    expect(box.getByText(/isn't open to new members yet\. Your invitation is saved on this device/)).toBeTruthy()
    expect(box.getByRole('link', { name: "I'm a member: sign in and follow" }).getAttribute('href')).toBe('/sign-in?next=%2Fapp%2Fu%2Fmia')
    expect(box.getByRole('link', { name: 'About Splitpost' }).getAttribute('href')).toBe('https://www.splitpost.ca/')
    expect(box.getByRole('link', { name: 'The waitlist' }).getAttribute('href')).toBe('https://www.splitpost.ca/join')
    expect(screen.queryByRole('link', { name: 'Join with this invitation' })).toBeNull()
  })

  it('once joining opens: the invitation link, or the waitlist without one, and sign in', () => {
    render(
      <MemoryRouter>
        <JoinActions ref_="0123456789abcdef" registrationOpen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Join with this invitation' }).getAttribute('href')).toBe('/register/0123456789abcdef')
    expect(screen.getByRole('link', { name: "I'm a member: sign in" })).toBeTruthy()
    cleanup()
    render(
      <MemoryRouter>
        <JoinActions ref_={null} registrationOpen />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: 'Join the waitlist' }).getAttribute('href')).toBe('https://www.splitpost.ca/join')
  })
})
