// Unit tests for the post-media function's video header checks (IP-5).
// Fixtures: e2e/fixtures/video (made with ffmpeg; see docs/VIDEO.md).
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readVideoHeader, VideoRejected, type ReadRange } from './video.ts'

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '..', '..', '..', 'e2e', 'fixtures', 'video', name)))
const reader = (bytes: Uint8Array): { read: ReadRange; reads: Array<[number, number]> } => {
  const reads: Array<[number, number]> = []
  return {
    reads,
    read: async (start, length) => {
      reads.push([start, length])
      return start >= bytes.length ? null : bytes.slice(start, start + length)
    },
  }
}
const code = async (bytes: Uint8Array, size = bytes.length) => {
  try {
    await readVideoHeader(reader(bytes).read, size)
    return 'accepted'
  } catch (e) {
    return e instanceof VideoRejected ? e.code : `error: ${String(e)}`
  }
}

// Builds a box: 32-bit size, type, body.
const box = (type: string, ...body: Uint8Array[]) => {
  const len = 8 + body.reduce((n, b) => n + b.length, 0)
  const out = new Uint8Array(len)
  new DataView(out.buffer).setUint32(0, len)
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
  let at = 8
  for (const b of body) {
    out.set(b, at)
    at += b.length
  }
  return out
}
const bytes = (...xs: number[]) => new Uint8Array(xs)
const u32 = (n: number) => bytes((n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255)
const ascii = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)))
const zeros = (n: number) => new Uint8Array(n)
const mvhd = (timescale: number, duration: number) => box('mvhd', zeros(4), zeros(8), u32(timescale), u32(duration), zeros(80))
const tkhd = (w: number, h: number) => box('tkhd', zeros(4), zeros(72), u32(w * 65536), u32(h * 65536))
const hdlr = (t: string) => box('hdlr', zeros(8), ascii(t), zeros(13))
const stsd = (codec: string) => box('stsd', zeros(4), u32(1), box(codec, zeros(8)))
const trak = (handler: string, codec: string, w = 0, h = 0) => box('trak', tkhd(w, h), box('mdia', hdlr(handler), box('minf', box('stbl', stsd(codec)))))
// Offsets in file(): ftyp is 20 bytes, so moov starts at 20; its mvhd at 28
// (timescale at 48, duration at 52) is 108 bytes; the first trak starts at 136.
const MOOV = 20
const TIMESCALE = 48
const DURATION = 52
const FIRST_TRAK = 136
const file = (...moovKids: Uint8Array[]) => {
  const parts = [box('ftyp', ascii('isom'), zeros(4), ascii('isom')), box('moov', mvhd(1000, 20_000), ...moovKids)]
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of parts) {
    out.set(p, at)
    at += p.length
  }
  return out
}

describe('real files', () => {
  it('reads a 720p H.264 MP4 with its index at the start', async () => {
    const f = fixture('h264-720p-3s.mp4')
    const r = reader(f)
    const info = await readVideoHeader(r.read, f.length)
    expect(info).toMatchObject({ codec: 'avc1', width: 1280, height: 720, audioCodec: 'mp4a' })
    expect(info.durationMs).toBeGreaterThan(2900)
    expect(info.durationMs).toBeLessThan(3100)
    // Only small reads: box headers and the moov box.
    expect(r.reads.reduce((n, [, l]) => n + l, 0)).toBeLessThan(64 * 1024)
  })
  it('finds the index at the end of the file, and refuses 1080p', async () => {
    expect(await code(fixture('h264-1080p-2s-moov-at-end.mp4'))).toBe('video_dimensions')
  })
  it('refuses HEVC (hvc1), which many browsers cannot play', async () => {
    expect(await code(fixture('hevc-720p-1s.mp4'))).toBe('video_codec')
  })
})

describe('synthetic headers', () => {
  it('accepts portrait 720 x 1280 and audio-less video', async () => {
    expect(await code(file(trak('vide', 'avc1', 720, 1280)))).toBe('accepted')
    expect(await code(file(trak('vide', 'avc3', 1280, 720), trak('soun', 'mp4a')))).toBe('accepted')
  })
  it('refuses what is not allowed', async () => {
    expect(await code(file(trak('soun', 'mp4a')))).toBe('video_missing')
    expect(await code(file(trak('vide', 'avc1', 1280, 720), trak('vide', 'hev1', 1280, 720)))).toBe('video_codec')
    expect(await code(file(trak('vide', 'avc1', 1280, 720), trak('soun', 'Opus')))).toBe('video_codec')
    expect(await code(file(trak('vide', 'avc1', 1280, 1280)))).toBe('video_dimensions')
    expect(await code(file(trak('vide', 'avc1', 8, 8)))).toBe('video_dimensions')
    const long = file(trak('vide', 'avc1', 1280, 720))
    long.set(u32(300_001), DURATION) // in ms (timescale 1000)
    expect(await code(long)).toBe('video_too_long')
  })
  it('refuses files that are not MP4, broken or too large, without following bad lengths', async () => {
    expect(await code(ascii('this is not a video file at all'))).toBe('not_mp4')
    expect(await code(box('moov', mvhd(1000, 1000)))).toBe('not_mp4') // no ftyp first
    const broken = file(trak('vide', 'avc1', 1280, 720))
    broken.set(u32(0xfffffff0), MOOV) // moov claims to run far past the end
    expect(await code(broken)).toBe('not_mp4')
    const inner = file(trak('vide', 'avc1', 1280, 720))
    inner.set(u32(0x7fffffff), FIRST_TRAK) // a trak inside moov claims more than moov holds
    expect(await code(inner)).toBe('not_mp4')
    expect(await code(file(trak('vide', 'avc1', 1280, 720)), 115_343_361)).toBe('video_too_large')
    const noTimescale = file(trak('vide', 'avc1', 1280, 720))
    noTimescale.set(u32(0), TIMESCALE)
    expect(await code(noTimescale)).toBe('not_mp4')
  })
})
