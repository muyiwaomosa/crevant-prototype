// Server-side checks for post videos (IP-5, SP-VID-001 section 5.5).
//
// Nothing the browser says about a video is trusted. Once it is uploaded,
// the function reads the file's own header from Storage, a few small byte
// ranges at a time (the box headers, then the whole moov box, at most 8 MB),
// and accepts it only if:
//   1. it is an ISO base media file (MP4) starting with ftyp;
//   2. every video track is H.264 (avc1 or avc3) and there is one;
//   3. the video is at most 1280 x 720 either way round (at least 16 px);
//   4. it lasts at most 300 seconds;
//   5. the audio, if any, is AAC (mp4a);
//   6. the file is at most 110 MB (and, checked by the database, exactly the
//      size the browser declared).
// The reader never decodes media and never trusts a box length beyond the
// file: a malformed or hostile header is refused, not followed.

export const MAX_VIDEO_BYTES = 115_343_360
export const MAX_VIDEO_MS = 300_000
export const MAX_LONG_EDGE = 1280
export const MAX_SHORT_EDGE = 720
const MAX_MOOV_BYTES = 8 * 1024 * 1024
const MAX_TOP_BOXES = 64

export type VideoCode = 'not_mp4' | 'video_codec' | 'video_dimensions' | 'video_too_long' | 'video_too_large' | 'video_missing'

export class VideoRejected extends Error {
  constructor(public code: VideoCode) {
    super(code)
  }
}

export type VideoInfo = {
  brand: string
  codec: string
  width: number
  height: number
  durationMs: number
  audioCodec: string | null
}

/** Reads `length` bytes from `start`, or null if the file can't be read there. */
export type ReadRange = (start: number, length: number) => Promise<Uint8Array | null>

const u32 = (b: Uint8Array, o: number) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]
const str = (b: Uint8Array, o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])
const CONTAINERS = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl'])

type Track = { handler?: string; codec?: string; width?: number; height?: number }

/** Parses the moov box (its full bytes, header included). */
export function parseMoov(moov: Uint8Array): { timescale: number; duration: number; tracks: Track[] } {
  const out = { timescale: 0, duration: 0, tracks: [] as Track[] }
  let current: Track | null = null
  const walk = (s: number, e: number, depth: number) => {
    let o = s
    while (o + 8 <= e) {
      let len = u32(moov, o)
      const t = str(moov, o + 4)
      let head = 8
      if (len === 1) {
        if (o + 16 > e) throw new VideoRejected('not_mp4')
        if (u32(moov, o + 8) !== 0) throw new VideoRejected('not_mp4')
        len = u32(moov, o + 12)
        head = 16
      }
      if (len === 0) len = e - o
      if (len < head || o + len > e) throw new VideoRejected('not_mp4')
      const need = (n: number) => {
        if (o + n > o + len) throw new VideoRejected('not_mp4')
      }
      if (t === 'mvhd') {
        need(head + 24)
        const v = moov[o + head]
        if (v === 1) {
          need(head + 32)
          out.timescale = u32(moov, o + head + 20)
          out.duration = u32(moov, o + head + 24) * 2 ** 32 + u32(moov, o + head + 28)
        } else {
          out.timescale = u32(moov, o + head + 12)
          out.duration = u32(moov, o + head + 16)
        }
      } else if (t === 'trak' && depth === 1) {
        current = {}
        out.tracks.push(current)
      } else if (t === 'tkhd' && current) {
        const base = o + head + (moov[o + head] === 1 ? 88 : 76)
        need(base - o + 8)
        current.width = u32(moov, base) >>> 16
        current.height = u32(moov, base + 4) >>> 16
      } else if (t === 'hdlr' && current) {
        need(head + 12)
        current.handler = str(moov, o + head + 8)
      } else if (t === 'stsd' && current) {
        need(head + 16)
        if (u32(moov, o + head + 4) < 1) throw new VideoRejected('not_mp4')
        current.codec = str(moov, o + head + 12)
      }
      if (CONTAINERS.has(t)) {
        if (depth > 6) throw new VideoRejected('not_mp4')
        walk(o + head, o + len, depth + 1)
      }
      o += len
    }
  }
  walk(0, moov.length, 0)
  return out
}

/** Finds and reads the moov box anywhere in the file (start or end), then parses it. */
export async function readVideoHeader(read: ReadRange, size: number): Promise<VideoInfo> {
  if (!Number.isFinite(size) || size < 16) throw new VideoRejected('not_mp4')
  if (size > MAX_VIDEO_BYTES) throw new VideoRejected('video_too_large')
  let off = 0
  let brand: string | null = null
  let moov: Uint8Array | null = null
  for (let n = 0; off + 8 <= size; n++) {
    if (n >= MAX_TOP_BOXES) throw new VideoRejected('not_mp4')
    const h = await read(off, Math.min(16, size - off))
    if (!h || h.length < 8) throw new VideoRejected('not_mp4')
    let len = u32(h, 0)
    const type = str(h, 4)
    let head = 8
    if (len === 1) {
      if (h.length < 16 || u32(h, 8) !== 0) throw new VideoRejected('not_mp4')
      len = u32(h, 12)
      head = 16
    }
    if (len === 0) len = size - off
    if (len < head || off + len > size) throw new VideoRejected('not_mp4')
    if (n === 0) {
      if (type !== 'ftyp' || len < 16) throw new VideoRejected('not_mp4')
      const f = await read(off, 12)
      if (!f || f.length < 12) throw new VideoRejected('not_mp4')
      brand = str(f, 8)
    }
    if (type === 'moov') {
      if (len > MAX_MOOV_BYTES) throw new VideoRejected('not_mp4')
      moov = await read(off, len)
      if (!moov || moov.length !== len) throw new VideoRejected('not_mp4')
      break
    }
    off += len
  }
  if (!moov || !brand) throw new VideoRejected('not_mp4')
  const m = parseMoov(moov)
  if (m.timescale <= 0) throw new VideoRejected('not_mp4')
  const video = m.tracks.filter((t) => t.handler === 'vide')
  if (video.length === 0) throw new VideoRejected('video_missing')
  if (!video.every((t) => t.codec === 'avc1' || t.codec === 'avc3')) throw new VideoRejected('video_codec')
  const audio = m.tracks.filter((t) => t.handler === 'soun')
  if (!audio.every((t) => t.codec === 'mp4a')) throw new VideoRejected('video_codec')
  const v = video[0]
  const width = v.width ?? 0
  const height = v.height ?? 0
  if (Math.min(width, height) < 16 || Math.max(width, height) > MAX_LONG_EDGE || Math.min(width, height) > MAX_SHORT_EDGE) {
    throw new VideoRejected('video_dimensions')
  }
  const durationMs = Math.round((m.duration * 1000) / m.timescale)
  if (durationMs < 1) throw new VideoRejected('not_mp4')
  if (durationMs > MAX_VIDEO_MS) throw new VideoRejected('video_too_long')
  return { brand, codec: v.codec as string, width, height, durationMs, audioCodec: audio[0]?.codec ?? null }
}
