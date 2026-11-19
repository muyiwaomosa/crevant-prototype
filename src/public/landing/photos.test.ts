import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FUTURE_MOSAIC, PHOTOS, PHOTO_APPROVALS, SAMPLE_AVATAR } from './photos'

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

  it('has exactly the current slots: the creator at night, the other job, the fans, and the four creators in the mosaic', () => {
    expect(photos.map((p) => p.id)).toEqual(['creator-at-night', 'another-job', 'fans-sharing', 'cooking-vlog', 'painter', 'craftsman', 'filmmaker'])
    expect(FUTURE_MOSAIC.map((k) => PHOTOS[k].id)).toEqual(['cooking-vlog', 'filmmaker', 'painter', 'craftsman'])
  })

  it('lists every photo shown on the site in the approval file, and every one is still pending the founder', () => {
    expect(Object.keys(PHOTO_APPROVALS).sort()).toEqual([...photos.map((p) => p.id), SAMPLE_AVATAR.id, 'founder'].sort())
    for (const [id, status] of Object.entries(PHOTO_APPROVALS)) expect(status, id).toBe('pending')
  })

  it('records that these stand-ins have no model release', () => {
    for (const p of photos) expect(p.modelRelease, p.id).toBe('none (Pexels)')
  })

  it.each(photos.map((p) => [p.id, p] as const))('%s records its Pexels source, credit and licence, and describes the activity', (_, p) => {
    expect(p.source).toBe('Pexels')
    expect(p.licence).toBe('Pexels License')
    expect(p.licenceUrl).toBe('https://www.pexels.com/license/')
    expect(p.sourceUrl).toMatch(/^https:\/\/www\.pexels\.com\/photo\/[a-z0-9-]+-\d+\/$/)
    expect(p.photographer.length).toBeGreaterThan(2)
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

  it('records each Pexels photo ID, with a credit or a clear note that it is still to be verified', () => {
    expect(photos.map((p) => [p.sourceUrl.match(/-(\d+)\/$/)![1], p.photographer])).toEqual([
      ['17147713', 'Credit to be verified on the Pexels listing'],
      ['6205512', 'Credit to be verified on the Pexels listing'],
      ['6146961', 'Credit to be verified on the Pexels listing'],
      ['7669738', 'Credit to be verified on the Pexels listing'],
      ['22690822', 'Credit to be verified on the Pexels listing'],
      ['3846033', 'Credit to be verified on the Pexels listing'],
      ['36181988', 'Director Chenchi'],
    ])
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
    for (const f of readdirSync(MEDIA)) expect(f === 'photos' || f === 'founder.jpg', `${f} is unused`).toBe(true)
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
