import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AI_PHOTO_LABEL, PHOTOS } from './photos'

const PUBLIC = join(__dirname, '../../../public')

/** Width and height from a baseline or progressive JPEG's frame header. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('not a JPEG marker')
    const marker = buf[i + 1]
    const len = buf.readUInt16BE(i + 2)
    if (marker >= 0xc0 && marker <= 0xc3) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
    i += 2 + len
  }
  throw new Error('no frame header')
}

/** True if the JPEG carries an EXIF block (camera, location or software data). */
const hasExif = (buf: Buffer) => buf.includes(Buffer.from('Exif\0\0', 'binary'))

describe('homepage concept photos', () => {
  const photos = Object.values(PHOTOS)

  it.each(photos.map((p) => [p.id, p] as const))('%s is recorded as AI-generated, with how it was made', (_, p) => {
    expect(p.origin).toBe('ai-generated')
    expect(p.label).toBe(AI_PHOTO_LABEL)
    expect(p.generator).toBeTruthy()
    expect(p.prompt.length).toBeGreaterThan(40)
    expect(p.generated).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // Cropping and resizing only: nothing blurred or painted over.
    expect(p.edits).toMatch(/^Cropped/)
    expect(p.edits).not.toMatch(/blur|paint|retouch|remov/i)
    expect(p.alt.length).toBeGreaterThan(30)
  })

  it.each(photos.flatMap((p) => p.sources.map((s) => [s.src, s.width, p.width / p.height] as const)))(
    '%s exists at %ipx, keeps its proportions, is small and has no EXIF data',
    (src, width, ratio) => {
      const file = join(PUBLIC, src)
      expect(existsSync(file)).toBe(true)
      const buf = readFileSync(file)
      const size = jpegSize(buf)
      expect(size.width).toBe(width)
      expect(Math.abs(size.width / size.height - ratio)).toBeLessThan(0.01)
      expect(hasExif(buf)).toBe(false)
      expect(statSync(file).size).toBeLessThan(250_000)
    },
  )

  it('offers a large version for sharp screens', () => {
    for (const p of photos) expect(p.sources[0].width).toBeGreaterThanOrEqual(1600)
  })

  it('discloses that the person is not real', () => {
    expect(AI_PHOTO_LABEL).toBe('AI-generated concept image, not a real person')
  })
})
