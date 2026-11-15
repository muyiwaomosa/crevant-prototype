import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PHOTOS } from './photos'

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

  it.each(photos.map((p) => [p.id, p] as const))('%s is a stock image with a recorded source and licence', (_, p) => {
    expect(p.source).toBe('Canva content library')
    expect(p.licence).toBe('Canva Content License')
    // Decorative backgrounds have empty alt text; every person is described.
    if (!['desk-at-night', 'ring-light'].includes(p.id)) expect(p.alt.length).toBeGreaterThan(20)
  })

  it.each(photos.map((p) => [p.src, p] as const))('%s exists at its recorded size, is small and carries no metadata', (_, p) => {
    const file = join(PUBLIC, p.src)
    expect(existsSync(file)).toBe(true)
    const buf = readFileSync(file)
    expect(webpSize(buf)).toEqual({ width: p.width, height: p.height })
    expect(statSync(file).size).toBeLessThan(120_000)
    expect(buf.includes(Buffer.from('EXIF'))).toBe(false)
  })

  it('names no photo after a sample person, so a model is never presented as a member', () => {
    for (const p of photos) expect(`${p.id} ${p.alt}`).not.toMatch(/priya|ana\b|leo\b|member|user|customer|testimonial/i)
  })

  it('ships no AI-generated or retired images', () => {
    const files = readdirSync(MEDIA)
    expect(files.filter((f) => /^(who-|tour-)/.test(f))).toEqual([])
    const used = new Set(photos.map((p) => p.src.split('/').pop()))
    for (const f of files) expect(used.has(f) || f === 'founder.jpg', `${f} is unused`).toBe(true)
  })
})
