// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import App from '../App'
import { STORAGE_KEY } from '../state/storage'
import { EARN_RULES } from '../lib/points'

// Personalized onboarding in the sample prototype (the frozen production
// demo; the public /tour is retired): intent and topics, the inviting
// creator shown with an explicit choice, matched suggestions, and Discover
// kept separate from Following.

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

const JORDAN_LINK = '7c1e94a2b05d3f68e1a9'
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
const start = (search = '') => {
  window.history.replaceState(null, '', `/welcome${search}`)
  render(<App />)
}
const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

describe('personalized onboarding', () => {
  it('asks intent and topics, and only asks what someone will post about if they plan to create', () => {
    start()
    click('Get started')
    expect(screen.getByRole('heading', { name: 'What are you into?' })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'What will you post about?' })).toBeNull()
    click('Create content')
    const posting = screen.getByRole('group', { name: 'What will you post about?' })
    for (const t of ['Fitness', 'Food', 'Art']) fireEvent.click(within(posting).getByRole('button', { name: t }))
    expect((within(posting).getByRole('button', { name: 'Music' }) as HTMLButtonElement).disabled).toBe(true)
    click('Discover and support creators')
    expect(screen.queryByRole('group', { name: 'What will you post about?' })).toBeNull()
  })

  it('suggests creators who match the chosen topics first, without following anyone', () => {
    start()
    click('Get started')
    fireEvent.click(within(screen.getByRole('group', { name: 'Topics you enjoy' })).getByRole('button', { name: 'Fitness' }))
    click('Continue')
    const first = screen.getByRole('list', { name: 'Accounts to follow' }).querySelector('li')!
    expect(first.textContent).toContain('Jordan Hayes')
    expect(first.textContent).toContain('Matches your interests')
    click('Continue')
    click('Go to my feed')
    const s = saved()
    expect(s.interests).toEqual(['Fitness'])
    expect(s.following).toEqual([])
    expect(s.invite).toBeNull()
  })

  it('shows the inviting creator first and follows them only if the visitor chooses', () => {
    start(`?invite=${JORDAN_LINK}`)
    expect(screen.getByTestId('invite-banner').textContent).toContain('Jordan Hayes invited you to Splitpost.')
    click('Get started')
    click('Continue')
    const choice = screen.getByTestId('invite-choice')
    expect(choice.textContent).toContain('Nobody is followed for you, and an invitation earns nothing for anyone.')
    expect(within(screen.getByRole('list', { name: 'Accounts to follow' })).queryByText('Jordan Hayes')).toBeNull()
    fireEvent.click(within(choice).getByRole('button', { name: 'Follow' }))
    click('Continue')
    click('Go to my feed')
    const s = saved()
    expect(s.following).toEqual(['jordan'])
    expect(s.invite).toMatchObject({ code: JORDAN_LINK, creatorId: 'jordan', decision: 'followed' })
    expect(typeof s.invite.decidedAt).toBe('number')
  })

  it('records "Not now" without following, and leaves the decision pending if the visitor never chooses', () => {
    start(`?invite=${JORDAN_LINK}`)
    click('Get started')
    click('Continue')
    fireEvent.click(within(screen.getByTestId('invite-choice')).getByRole('button', { name: 'Not now' }))
    click('Continue')
    click('Go to my feed')
    expect(saved().following).toEqual([])
    expect(saved().invite.decision).toBe('declined')
    cleanup()
    localStorage.clear()

    start(`?invite=${JORDAN_LINK}`)
    click('Skip')
    const s = saved()
    expect(s.invite).toMatchObject({ creatorId: 'jordan', decision: 'pending', decidedAt: null })
    expect(s.following).not.toContain('jordan')
  })

  it('fails safely for an unusable link: a short note, no inviter and no follow', () => {
    for (const code of ['5b8d2e7a1c94f063b2e1', 'e9a4c1b7d3f5082a6c4b', '0d6b3f9e2a8c51e7b4d2', 'not-a-code']) {
      start(`?invite=${code}`)
      expect(screen.getByTestId('invite-unusable').textContent).toContain("This invitation link isn't active any more.")
      expect(screen.queryByTestId('invite-banner')).toBeNull()
      click('Get started')
      click('Continue')
      expect(screen.queryByTestId('invite-choice')).toBeNull()
      cleanup()
      localStorage.clear()
    }
  })
})

describe('Connection Points and invitations', () => {
  type Entry = { creatorId?: string; amount?: number; kind?: string }
  const ledgerFor = (creatorId: string) => (saved().ledger as Entry[]).filter((e) => e.creatorId === creatorId)

  it('following the inviter earns exactly the normal follow bonus; the invitation itself earns nothing', () => {
    start(`?invite=${JORDAN_LINK}`)
    click('Get started')
    click('Continue')
    fireEvent.click(within(screen.getByTestId('invite-choice')).getByRole('button', { name: 'Follow' }))
    click('Continue')
    click('Go to my feed')
    const entries = ledgerFor('jordan')
    expect(entries).toHaveLength(1)
    expect(entries[0].amount).toBe(EARN_RULES.follow.points)
    expect(entries[0].kind).toBe('follow')
    expect(JSON.stringify(saved().ledger)).not.toMatch(/invite|referr/i)
  })

  it('"Not now" and an unusable link earn nothing for anyone', () => {
    start(`?invite=${JORDAN_LINK}`)
    click('Get started')
    click('Continue')
    fireEvent.click(within(screen.getByTestId('invite-choice')).getByRole('button', { name: 'Not now' }))
    click('Continue')
    click('Go to my feed')
    expect(saved().ledger).toEqual([])
    cleanup()
    localStorage.clear()
    start('?invite=5b8d2e7a1c94f063b2e1')
    click('Get started')
    click('Continue')
    click('Continue')
    click('Go to my feed')
    expect(saved().ledger).toEqual([])
  })
})

describe('Discover and Following stay separate', () => {
  it('Discover groups matches to the chosen topics first; a search shows one plain list', () => {
    start()
    click('Get started')
    fireEvent.click(within(screen.getByRole('group', { name: 'Topics you enjoy' })).getByRole('button', { name: 'Wellness' }))
    click('Continue')
    click('Continue')
    click('Go to my feed')
    cleanup()
    window.history.replaceState(null, '', '/discover')
    render(<App />)
    const forYou = screen.getByTestId('discover-for-you')
    expect(forYou.textContent).toContain('Kofi Mensah')
    expect(forYou.textContent).not.toContain('Jordan Hayes')
    fireEvent.change(screen.getByPlaceholderText('Search by name, topic, or handle'), { target: { value: 'jordan' } })
    expect(screen.queryByTestId('discover-for-you')).toBeNull()
    expect(saved().following).toEqual([])
  })
})
