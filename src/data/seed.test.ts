import { describe, expect, it } from 'vitest'
import { CREATORS, buildSeedComments, buildSeedPosts, buildSeedRewards } from './seed'

// The landing page screenshots follow one fictional creator, Amara Okafor, a
// personal finance educator. Her profile, posts, comments and rewards must tell
// one consistent budgeting story.
describe('sample tour story: Amara Okafor, personal finance educator', () => {
  const amara = CREATORS.find((c) => c.id === 'amara')!
  const posts = buildSeedPosts(Date.now()).filter((p) => p.creatorId === 'amara')
  const comments = buildSeedComments(Date.now()).filter((c) => posts.some((p) => p.id === c.postId))
  const rewards = buildSeedRewards(Date.now()).filter((r) => r.creatorId === 'amara')

  it('is a money creator with a budgeting profile', () => {
    expect(amara.name).toBe('Amara Okafor')
    expect(amara.category).toBe('Money')
    expect(amara.handle).toBe('amaramoney')
    expect(amara.bio).toMatch(/budgeting/i)
    expect(amara.cover).toBe('budget')
  })
  it('posts budgeting advice, led by the 50/30/20 post with its illustration', () => {
    const lead = posts.find((p) => p.id === 'p_amara_1')!
    expect(lead.text).toContain('50/30/20')
    expect(lead.media).toMatchObject({ type: 'art', art: 'budget' })
    for (const p of posts) expect(p.text).toMatch(/budget|money|balance|pay|fund|sav/i)
  })
  it('gets thoughtful supporter comments on that advice', () => {
    expect(comments.filter((c) => c.postId === 'p_amara_1')).toHaveLength(2)
    for (const c of comments) expect(c.text).toMatch(/budget|split|payday|income|money|%/i)
  })
  it('offers budgeting rewards, including a budgeting Q&A', () => {
    expect(rewards.map((r) => r.title).sort()).toEqual(['Payday budget template', 'Seat at a live budgeting Q&A'])
  })
  it('leaves no food content from the old sample behind', () => {
    const all = [amara.bio, ...posts.map((p) => p.text), ...comments.map((c) => c.text), ...rewards.map((r) => `${r.title} ${r.description}`)].join(' ')
    expect(all).not.toMatch(/jollof|recipe|pepper soup|cook along|suya/i)
  })
})
