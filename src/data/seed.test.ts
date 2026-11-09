import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CREATORS, DEFAULT_PROFILE, buildSeedComments, buildSeedPosts, buildSeedRewards } from './seed'
import manifest from '../../scripts/tour/tour-images.json'

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
    expect(lead.media).toMatchObject({ type: 'image', src: '/media/tour/posts/amara-budget.jpg' })
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

// Fictional portraits and post images, generated with Canva for the tour only.
describe('sample tour images', () => {
  const ROOT = join(__dirname, '..', '..')
  const PUBLIC = join(ROOT, 'public')
  const posts = buildSeedPosts(Date.now())
  const comments = buildSeedComments(Date.now())

  // JPEG size from the first start-of-frame marker.
  function jpegSize(file: string) {
    const b = readFileSync(file)
    let i = 2
    while (i < b.length) {
      const marker = b[i + 1]
      const len = b.readUInt16BE(i + 2)
      if (marker >= 0xc0 && marker <= 0xc3) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) }
      i += 2 + len
    }
    throw new Error(`no size in ${file}`)
  }

  it('gives every tour person exactly one portrait, the same one everywhere', () => {
    const people = [...CREATORS.map((c) => [c.id, c.avatar]), ['jamie', DEFAULT_PROFILE.avatar]]
    for (const [id, avatar] of people) expect(avatar).toBe(`/media/tour/people/${id}.jpg`)
    const fanAvatars = new Map<string, string | undefined>()
    for (const c of comments) {
      expect(c.authorAvatar, c.authorName).toMatch(/^\/media\/tour\/people\/[a-z]+\.jpg$/)
      if (fanAvatars.has(c.authorName)) expect(c.authorAvatar).toBe(fanAvatars.get(c.authorName))
      fanAvatars.set(c.authorName, c.authorAvatar)
    }
    const all = [...people.map((p) => p[1]), ...fanAvatars.values()]
    expect(new Set(all).size).toBe(all.length)
    expect(all.length).toBe(16)
  })

  it('lists every portrait and post image in the manifest, with its Canva source', () => {
    expect(manifest.people.map((p) => p.id).sort()).toEqual(
      [...CREATORS.map((c) => c.id), 'jamie', 'lena', 'dami', 'chris', 'yuki', 'sam', 'noor', 'eli'].sort(),
    )
    for (const item of [...manifest.people, ...manifest.posts]) expect(item.canvaMediaId).toMatch(/^MA[A-Za-z0-9_-]{9}$/)
    const imagePosts = posts.filter((p) => p.media?.type === 'image')
    expect(imagePosts.map((p) => p.id).sort()).toEqual(manifest.posts.map((p) => p.postId).sort())
  })

  it('has every image file on disk at full quality, small, and without metadata', () => {
    const files = [
      ...manifest.people.map((p) => ({ file: `/media/tour/people/${p.id}.jpg`, w: 320, h: 320 })),
      ...manifest.posts.map((p) => ({ file: `/media/tour/posts/${p.id}.jpg`, w: 1200, h: 900 })),
    ]
    for (const { file, w, h } of files) {
      const abs = join(PUBLIC, file)
      expect(existsSync(abs), file).toBe(true)
      expect(jpegSize(abs), file).toEqual({ w, h })
      expect(statSync(abs).size, file).toBeLessThan(200 * 1024)
      const head = readFileSync(abs).subarray(0, 64 * 1024).toString('latin1')
      expect(head.includes('Exif'), `${file} has EXIF`).toBe(false)
    }
    for (const p of posts) if (p.media?.type === 'image') expect(existsSync(join(PUBLIC, p.media.src)), p.media.src).toBe(true)
  })

  it('keeps the fictional people inside the tour: never in the real app (src/auth) or on the landing page (src/public)', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)]))
    const outside = [...walk(join(ROOT, 'src', 'public')), ...walk(join(ROOT, 'src', 'auth'))].filter((f) => /\.(tsx?|css)$/.test(f))
    for (const f of outside) expect(readFileSync(f, 'utf8'), f).not.toMatch(/media\/tour\//)
  })
})
