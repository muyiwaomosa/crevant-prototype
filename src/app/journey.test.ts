import { describe, expect, it } from 'vitest'
import type { MyProgress, QualificationStatus } from './api'
import { openSteps, remainingText, suggestNext, whyItMatters, type Enabled } from './journey'
import { publishedText, recognitionText } from './recognition'

// SP-UAT-001 finding 4: the progression journey reads only the server's progress.
const steps = (xs: Array<[string, number, number | null]>) => xs.map(([metric, value, target]) => ({ metric, value, target }))
const money = (accumulatedCents: number, lockedCents: number) => ({ accumulatedCents, lockedCents, pausedCents: 0, eligibleCents: 0, settledCents: 0 })
const journey = (status: QualificationStatus, s: ReturnType<typeof steps>) => ({ status, qualifiedAt: null, goalsSince: '2026-11-26T00:00:00Z', steps: s })
const progress = (creator: ReturnType<typeof journey>, consumer: ReturnType<typeof journey>, creatorCents = 0, consumerCents = 0): Enabled => ({
  enabled: true,
  goodStanding: true,
  creator,
  consumer,
  notices: [],
  earnings: { creator: money(creatorCents, creatorCents), consumer: money(consumerCents, consumerCents) },
})

describe('the progression journey', () => {
  it('suggests the open goal closest to done, across creator and supporter journeys, never a fixed order', () => {
    const p = progress(
      journey('in_progress', steps([['original_posts', 16, 20], ['genuine_followers', 10, 100]])),
      journey('in_progress', steps([['clique_creators', 2, 10], ['meaningful_engagements', 21, 30]])),
      3600,
      1220,
    )
    const s = suggestNext(p)!
    expect([s.audience, s.step.metric, s.done, s.total, s.unlockCents]).toEqual(['creator', 'original_posts', 0, 2, 3600])
    // A later goal can be suggested before an earlier one: they are pursued together.
    const q = progress(journey('in_progress', steps([['original_posts', 0, 20], ['genuine_followers', 90, 100]])), journey('in_progress', steps([])), 100)
    expect(suggestNext(q)!.step.metric).toBe('genuine_followers')
  })

  it('suggests nothing from a journey under review, qualified or without goals set', () => {
    expect(suggestNext(progress(journey('under_review', steps([['original_posts', 20, 20]])), journey('qualified', steps([['clique_creators', 10, 10]]))))).toBeNull()
    expect(suggestNext(progress(journey('in_progress', steps([['original_posts', 3, null]])), journey('in_progress', steps([['clique_creators', 1, null]]))))).toBeNull()
    expect(openSteps(journey('revoked', steps([['original_posts', 1, 20]])))).toEqual([])
  })

  it('says what is left in the member’s own units, and why it matters, using only the approved unlock rule', () => {
    const p = progress(journey('in_progress', steps([['original_posts', 16, 20]])), journey('in_progress', steps([])), 3600)
    const s = suggestNext(p)!
    expect(remainingText(s.step)).toBe('4 more posts to go')
    expect(whyItMatters(s)).toBe(
      "It's one of the 1 creator goals you have left, in any order. When all 1 are met and checked, your locked $36.00 as a creator unlocks (simulated during the pilot).",
    )
    expect(remainingText({ metric: 'genuine_followers', value: 99, target: 100 })).toBe('1 more follower to go')
  })

  it('after a post, shows creator progress only as the server now reports it', () => {
    const off: MyProgress = { enabled: false }
    expect(publishedText(off)).toBeNull()
    expect(publishedText(progress(journey('in_progress', steps([['original_posts', 17, 20]])), journey('in_progress', steps([]))))).toMatchObject({
      title: 'Post published',
      detail: 'Creator goals: publish original posts, 17 of 20.',
      bar: { value: 17, target: 20 },
    })
    expect(publishedText(progress(journey('in_progress', steps([['original_posts', 20, 20]])), journey('in_progress', steps([]))))?.title).toBe(
      'Goal complete: publish original posts',
    )
    expect(publishedText(progress(journey('qualified', steps([['original_posts', 20, 20]])), journey('in_progress', steps([]))))).toBeNull()
  })

  it('a recognized contribution carries the goal’s progress bar; an unrecognized one says nothing', () => {
    const p = progress(journey('in_progress', steps([])), journey('in_progress', steps([['meaningful_engagements', 22, 30]])))
    const entry = { id: 1, action: 'save', points: 2, redeemable: false, status: 'recognized' as const, createdAt: new Date().toISOString(), creator: null, postId: 'x' }
    expect(recognitionText(entry, p)).toMatchObject({ title: 'Save recognized', bar: { value: 22, target: 30 } })
    expect(recognitionText({ ...entry, status: 'rejected' as never }, p)).toBeNull()
  })
})
