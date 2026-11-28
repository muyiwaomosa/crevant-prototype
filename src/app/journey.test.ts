import { describe, expect, it } from 'vitest'
import type { MyProgress, QualificationStatus } from './api'
import { openSteps, remainingText, suggestNext, whyItMatters, type Enabled } from './journey'
import { milestoneText, publishedText, recognitionText } from './recognition'
import { checklistComplete, gettingStartedSteps } from './guide'
import { REVIEW_RULE, statusLine } from './progression'

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

  it('says what is left in the member’s own units, and why it matters, using only the approved review rule (never automatic unlocking)', () => {
    const p = progress(journey('in_progress', steps([['original_posts', 16, 20]])), journey('in_progress', steps([])), 3600)
    const s = suggestNext(p)!
    expect(remainingText(s.step)).toBe('4 more posts to go')
    expect(whyItMatters(s)).toBe(
      "It's one of the 1 creator goals you have left, in any order. When all 1 are met, an eligibility review starts; if it is approved, your locked $36.00 as a creator unlocks (simulated during the pilot).",
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

  it('a contribution that completes a goal says so', () => {
    const p = progress(journey('in_progress', steps([])), journey('in_progress', steps([['meaningful_engagements', 30, 30]])))
    const entry = { id: 2, action: 'meaningful_comment', points: 3, redeemable: false, status: 'recognized' as const, createdAt: new Date().toISOString(), creator: null, postId: 'x' }
    expect(recognitionText(entry, p)).toMatchObject({ title: 'Goal complete: comment, save or repost thoughtfully', bar: { value: 30, target: 30 } })
  })

  it('recognizes milestones and qualification decisions from the server’s progress, once, and never predicts', () => {
    const before = { met: [], status: { consumer: 'in_progress', creator: 'in_progress' } }
    const met = progress(journey('in_progress', steps([['followers', 0, 100]])), journey('in_progress', steps([['clique_creators', 10, 10], ['external_shares', 1, 5]])))
    // The goal key carries the goal version (goalsSince), so a new goal version is a new milestone.
    expect(milestoneText(before, met)).toMatchObject({ title: 'Goal complete: keep creators in your clique', detail: "That's 1 of your 2 supporter goals." })
    expect(milestoneText({ met: ['consumer:clique_creators:2026-11-26T00:00:00Z'], status: before.status }, met)).toBeNull()
    const review = progress(journey('in_progress', steps([])), journey('under_review', steps([['clique_creators', 10, 10]])))
    expect(milestoneText(before, review)).toMatchObject({ title: 'All 5 supporter goals met', detail: 'Your eligibility review has started. Nothing unlocks until it is approved.' })
    const qualified = progress(journey('qualified', steps([])), journey('in_progress', steps([])))
    expect(milestoneText(before, qualified)?.title).toBe('Qualified as a creator')
  })

  it('states the review rule: meeting every goal starts a review and never unlocks by itself', () => {
    expect(REVIEW_RULE).toMatch(/starts an eligibility review/)
    expect(REVIEW_RULE).toMatch(/Nothing unlocks automatically/)
    expect(statusLine(journey('under_review', steps([])), true, undefined)).toMatch(/under review\. Locked amounts unlock only if the review is approved/)
    expect(statusLine(journey('in_progress', steps([['clique_creators', 10, 10]])), true, undefined)).toMatch(/review starts next; nothing unlocks until it is approved/)
  })
})

describe('getting started (Nov 28)', () => {
  const base = { interest: null, followingCount: 0, cliqueCount: 0, postCount: 0, contributed: false, profileDone: false }
  it('lists five steps ticked off only from server counts; the first post is optional', () => {
    const s = gettingStartedSteps({ ...base, cliqueTarget: 10 })
    expect(s.map((x) => x.key)).toEqual(['follow', 'clique', 'support', 'post', 'profile'])
    expect(s.find((x) => x.key === 'post')?.optional).toBe(true)
    expect(s.find((x) => x.key === 'clique')?.body).toMatch(/Following someone doesn’t add them to your Clique/)
    expect(s.find((x) => x.key === 'clique')?.body).toMatch(/counts 10 creators in your Clique; this is the first/)
    expect(s.every((x) => !x.done)).toBe(true)
    const t = gettingStartedSteps({ ...base, followingCount: 2 })
    expect(t[0].done).toBe(false)
    expect(gettingStartedSteps({ ...base, followingCount: 3 })[0].done).toBe(true)
  })

  it('is complete without a post: nobody has to publish to pursue the supporter journey', () => {
    const done = gettingStartedSteps({ ...base, followingCount: 3, cliqueCount: 1, contributed: true, profileDone: true })
    expect(checklistComplete(done)).toBe(true)
    expect(checklistComplete(gettingStartedSteps({ ...base, followingCount: 3, cliqueCount: 1, contributed: true }))).toBe(false)
  })

  it('leaves out a step the server cannot answer, rather than guessing', () => {
    const s = gettingStartedSteps({ ...base, contributed: null, profileDone: null })
    expect(s.map((x) => x.key)).toEqual(['follow', 'clique', 'post'])
  })
})
