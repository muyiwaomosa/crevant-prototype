import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WHO_PHOTOS, PHOTOS, PHOTOS_TO_VERIFY, SAMPLE_AVATAR } from './photos'
import { HOMEPAGE_COPY } from './copy'

const PUBLIC = join(__dirname, '../../../public')
const MEDIA = join(PUBLIC, 'media/landing')

/** Width and height from a WebP file's VP8, VP8L or VP8X header. */
function webpSize(buf: Buffer): { width: number; height: number } {
  expect(buf.toString('ascii', 0, 4)).toBe('RIFF')
  expect(buf.toString('ascii', 8, 12)).toBe('WEBP')
  const chunk = buf.toString('ascii', 12, 16)
  if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) }
  if (chunk === 'VP8L') {
    const b = buf.readUInt32LE(21)
    return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
  }
  return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
}

describe('homepage photos', () => {
  const photos = Object.values(PHOTOS)

  it('has exactly the four slots of SP-BRAND-002: why, creators, supporters and the vision', () => {
    expect(photos.map((p) => p.id)).toEqual(['creator-editing', 'teacher-recording', 'supporter-phone', 'community-table'])
    expect(WHO_PHOTOS).toHaveLength(HOMEPAGE_COPY.who.groups.length)
  })

  it.each(photos.map((p) => [p.id, p] as const))('%s records its Pexels source, credit and licence, and describes the activity', (_, p) => {
    expect(p.source).toBe('Pexels')
    expect(p.licence).toBe('Pexels License')
    expect(p.licenceUrl).toBe('https://www.pexels.com/license/')
    expect(p.sourceUrl).toMatch(/^https:\/\/www\.pexels\.com\/photo\/[a-z0-9-]+-\d+\/$/)
    expect(p.photographer.length).toBeGreaterThan(2)
    expect(p.photographer).not.toMatch(/pending/i)
    expect(p.photographer).not.toBe('')
    expect(p.alt.length).toBeGreaterThan(30)
  })

  it.each(photos.flatMap((p) => p.widths.map((w) => [`${p.base}-${w}.webp`, p, w] as const)))(
    '%s exists at its size and shape, is small and carries no metadata',
    (src, p, w) => {
      const file = join(PUBLIC, src)
      expect(existsSync(file)).toBe(true)
      const buf = readFileSync(file)
      const [rw, rh] = p.ratio.split('/').map(Number)
      expect(webpSize(buf)).toEqual({ width: w, height: Math.round((w * rh) / rw) })
      expect(statSync(file).size).toBeLessThan(120_000)
      expect(buf.includes(Buffer.from('EXIF'))).toBe(false)
      expect(buf.includes(Buffer.from('XMP '))).toBe(false)
    },
  )

  it('credits the verified photographer for each photo, and marks the two new ones as awaiting the founder’s check', () => {
    expect(photos.map((p) => [p.sourceUrl.match(/-(\d+)\/$/)![1], p.photographer])).toEqual([
      ['7014401', 'George Milton'],
      ['9040544', 'Alena Darmel'],
      // SP-BRAND-002 (Nov 27): to be confirmed on the Pexels listings before publication.
      ['6697318', 'To be verified on the Pexels listing'],
      ['5738245', 'To be verified on the Pexels listing'],
    ])
  })

  it('the asset register marks the two new photos unverified, to be verified or replaced before publication', () => {
    expect(PHOTOS_TO_VERIFY.map((p) => p.id)).toEqual(['supporter-phone', 'community-table'])
    for (const p of photos.filter((x) => x.verified)) expect(p.photographer).not.toMatch(/verified/i)
  })

  it('never names a model as a member, user or sample person, and never guesses who they are', () => {
    for (const p of photos) {
      expect(`${p.id} ${p.alt}`).not.toMatch(/priya|ana\b|leo\b|member|user|customer|testimonial|splitpost/i)
      // Alt text describes the activity, not ethnicity, nationality or age.
      expect(p.alt).not.toMatch(/\b(black|white|asian|african|latin[ao]?|european|indian|arab|old|elderly|young)\b/i)
    }
  })

  it('ships no unused, retired or AI-generated images', () => {
    const used = new Set([...photos.flatMap((p) => p.widths.map((w) => `${p.base.split('/').pop()}-${w}.webp`)), SAMPLE_AVATAR.src.split('/').pop()])
    for (const f of readdirSync(join(MEDIA, 'photos'))) expect(used.has(f), `${f} is unused`).toBe(true)
    for (const f of readdirSync(MEDIA)) expect(['photos', 'screens', 'founder.jpg'].includes(f), `${f} is unused`).toBe(true)
  })

  it('ships exactly the five app screens HOW shows, each small, portrait and free of metadata', () => {
    const screens = HOMEPAGE_COPY.how.steps.map((s) => s.screen.split('/').pop())
    expect(readdirSync(join(MEDIA, 'screens')).sort()).toEqual([...screens].sort())
    for (const s of HOMEPAGE_COPY.how.steps) {
      const buf = readFileSync(join(PUBLIC, s.screen))
      expect(webpSize(buf), s.id).toEqual({ width: 780, height: 1688 })
      expect(buf.length, s.id).toBeLessThan(90_000)
      expect(buf.includes(Buffer.from('EXIF')), s.id).toBe(false)
    }
  })

  it("records the sample creator's profile photo: licensed, small, square and never presented as Priya", () => {
    expect(SAMPLE_AVATAR.source).toBe('Pexels')
    expect(SAMPLE_AVATAR.licence).toBe('Pexels License')
    expect(SAMPLE_AVATAR.sourceUrl).toBe('https://www.pexels.com/photo/1239291/')
    const buf = readFileSync(join(PUBLIC, SAMPLE_AVATAR.src))
    expect(webpSize(buf)).toEqual({ width: SAMPLE_AVATAR.size, height: SAMPLE_AVATAR.size })
    expect(buf.length).toBeLessThan(10_000)
    expect(buf.includes(Buffer.from('EXIF'))).toBe(false)
  })
})
