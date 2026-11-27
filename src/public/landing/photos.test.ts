import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { WHO_PHOTOS, PHOTOS, PHOTOS_TO_VERIFY, HERO_POST, HERO_PICTURES } from './photos'
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

  /** The register's source, listing and licence, checked together for each source. */
  const SOURCES = {
    Pexels: { licence: 'Pexels License', licenceUrl: 'https://www.pexels.com/license/', listing: /^https:\/\/www\.pexels\.com\/photo\/[a-z0-9-]+-\d+\/$/ },
    Unsplash: { licence: 'Unsplash License', licenceUrl: 'https://unsplash.com/license', listing: /^https:\/\/unsplash\.com\/photos\/[a-z0-9-]+-[A-Za-z0-9_-]{11}$/ },
  } as const

  it.each(photos.map((p) => [p.id, p] as const))('%s records its source, credit and licence, and describes the activity', (_, p) => {
    const src = SOURCES[p.source]
    expect(p.licence).toBe(src.licence)
    expect(p.licenceUrl).toBe(src.licenceUrl)
    expect(p.sourceUrl).toMatch(src.listing)
    if (p.source === 'Unsplash') expect(p.photographerUrl).toMatch(/^https:\/\/unsplash\.com\/@[a-z0-9_]+$/)
    expect(p.verification.length).toBeGreaterThan(20)
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

  it('credits the verified photographer for each photo', () => {
    expect(photos.map((p) => [p.sourceUrl, p.photographer])).toEqual([
      ['https://www.pexels.com/photo/focused-female-freelancer-editing-photos-on-laptop-7014401/', 'George Milton'],
      ['https://www.pexels.com/photo/teacher-recording-herself-teaching-9040544/', 'Alena Darmel'],
      // SP-BRAND-002 decision 6 (Nov 27): the two unverifiable Pexels photos were replaced.
      ['https://unsplash.com/photos/a-woman-sitting-on-a-couch-looking-at-her-cell-phone-TRkyQgyb4c0', 'Ninthgrid'],
      ['https://unsplash.com/photos/outdoor-dinner-party-with-oud-UrzN-8K1PCE', 'Considerate Agency'],
    ])
  })

  it('publishes no unverified asset: every photo and every hero picture is verified on its listing', () => {
    expect(PHOTOS_TO_VERIFY).toEqual([])
    for (const p of [...photos, ...HERO_PICTURES]) {
      expect(p.verified, p.id).toBe(true)
      expect(p.photographer, p.id).not.toMatch(/verif|pending|to be/i)
    }
  })

  it('never names a model as a member, user or sample person, and never guesses who they are', () => {
    for (const p of photos) {
      expect(`${p.id} ${p.alt}`).not.toMatch(/priya|ana\b|leo\b|member|user|customer|testimonial|splitpost/i)
      // Alt text describes the activity, not ethnicity, nationality or age.
      expect(p.alt).not.toMatch(/\b(black|white|asian|african|latin[ao]?|european|indian|arab|old|elderly|young)\b/i)
    }
  })

  it('ships no unused, retired or AI-generated images', () => {
    const used = new Set([
      ...[...photos, HERO_POST.media].flatMap((p) => p.widths.map((w) => `${p.base.split('/').pop()}-${w}.webp`)),
      HERO_POST.creator.avatar.src.split('/').pop(),
      ...HERO_POST.community.map((c) => c.src.split('/').pop()),
    ])
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

  it('records every hero picture: licensed Unsplash photos, credited, small and free of metadata', () => {
    for (const p of HERO_PICTURES) {
      expect(p.source, p.id).toBe('Unsplash')
      expect(p.licence, p.id).toBe('Unsplash License')
      expect(p.licenceUrl, p.id).toBe('https://unsplash.com/license')
      expect(p.sourceUrl, p.id).toMatch(/^https:\/\/unsplash\.com\/photos\//)
      expect(p.photographerUrl, p.id).toMatch(/^https:\/\/unsplash\.com\/@/)
    }
    for (const p of [HERO_POST.creator.avatar, ...HERO_POST.community]) {
      const buf = readFileSync(join(PUBLIC, p.src))
      expect(webpSize(buf), p.id).toEqual({ width: 160, height: 160 })
      expect(buf.length, p.id).toBeLessThan(10_000)
      expect(buf.includes(Buffer.from('EXIF')), p.id).toBe(false)
    }
    for (const w of HERO_POST.media.widths) {
      const buf = readFileSync(join(PUBLIC, `${HERO_POST.media.base}-${w}.webp`))
      expect(webpSize(buf)).toEqual({ width: w, height: (w * 10) / 16 })
      expect(buf.length).toBeLessThan(60_000)
      expect(buf.includes(Buffer.from('EXIF'))).toBe(false)
    }
  })

  it('keeps the hero picture distinct from every other photo on the page (SP-BRAND-003)', () => {
    const elsewhere = new Set(photos.map((p) => p.sourceUrl))
    for (const p of HERO_PICTURES) expect(elsewhere.has(p.sourceUrl), p.id).toBe(false)
  })

})
