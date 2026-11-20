// Server-side processing for post photos (Build 5.3).
//
// Nothing the browser sends is trusted. An upload is accepted only if:
//   1. its header parses as a JPEG at most 1600 pixels on its longest edge
//      (checked before any decoding, so oversized or hostile headers never
//      reach the decoder);
//   2. it fully decodes with jpeg-js 0.4.4 under hard limits (at most 2.6
//      megapixels and 64 MB of memory; strict decoding);
//   3. it re-encodes from the decoded pixels into two new JPEGs: the full
//      photo (q80, else q70, at most 600 KB) and a feed copy at most 800 px on
//      its longest edge (q80, else q70, at most 200 KB).
// Only those two files are ever stored: no metadata (EXIF, GPS, comments),
// nothing after the image, nothing the browser chose.
//
// jpeg-js 0.4.4 is the reviewed copy in ../_shared (identical to the avatar
// function's, which is left untouched).
import { decode } from '../_shared/jpeg-js-0.4.4/decoder.js'
import { encode } from '../_shared/jpeg-js-0.4.4/encoder.js'

export const MAX_EDGE = 1600
export const FEED_EDGE = 800
export const MIN_EDGE = 64
export const MAX_INPUT_BYTES = 1_500_000
export const MAX_FULL_BYTES = 600 * 1024
export const MAX_FEED_BYTES = 200 * 1024
const QUALITIES = [80, 70]
const DECODE_LIMITS = { maxResolutionInMP: 2.6, maxMemoryUsageInMB: 64, tolerantDecoding: false, useTArray: true, formatAsRGBA: true } as const

export class ImageRejected extends Error {
  constructor(public code: 'not_jpeg' | 'wrong_size' | 'not_decodable' | 'too_large') {
    super(code)
  }
}

/** Reads the JPEG frame header without decoding: a baseline or progressive JPEG within the size limits. */
export function checkHeader(bytes: Uint8Array): { width: number; height: number } {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new ImageRejected('not_jpeg')
  let i = 2
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) throw new ImageRejected('not_jpeg')
    const marker = bytes[i + 1]
    if (marker === 0xff) {
      i += 1
      continue
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (length < 2 || i + 2 + length > bytes.length) throw new ImageRejected('not_jpeg')
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (length < 8) throw new ImageRejected('not_jpeg')
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      const components = bytes[i + 9]
      if (Math.max(width, height) > MAX_EDGE || Math.min(width, height) < MIN_EDGE || width * height > 2_560_000) throw new ImageRejected('wrong_size')
      if (components !== 1 && components !== 3) throw new ImageRejected('not_jpeg')
      return { width, height }
    }
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) throw new ImageRejected('not_jpeg')
    i += 2 + length
  }
  throw new ImageRejected('not_jpeg')
}

type Pixels = { width: number; height: number; data: Uint8Array }

/** Box-filter downscale to at most `edge` on the longest side (no upscaling). */
export function downscale(src: Pixels, edge: number): Pixels {
  const s = Math.min(1, edge / Math.max(src.width, src.height))
  if (s === 1) return src
  const w = Math.max(1, Math.round(src.width * s))
  const h = Math.max(1, Math.round(src.height * s))
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y / s)
    const y1 = Math.min(src.height, Math.max(y0 + 1, Math.ceil((y + 1) / s)))
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x / s)
      const x1 = Math.min(src.width, Math.max(x0 + 1, Math.ceil((x + 1) / s)))
      let r = 0, g = 0, b = 0, n = 0
      for (let yy = y0; yy < y1; yy++) {
        let k = (yy * src.width + x0) * 4
        for (let xx = x0; xx < x1; xx++, k += 4) {
          r += src.data[k]
          g += src.data[k + 1]
          b += src.data[k + 2]
          n++
        }
      }
      const o = (y * w + x) * 4
      out[o] = r / n
      out[o + 1] = g / n
      out[o + 2] = b / n
      out[o + 3] = 255
    }
  }
  return { width: w, height: h, data: out }
}

function encodeWithin(px: Pixels, max: number): Uint8Array {
  for (const q of QUALITIES) {
    const out = Uint8Array.from(encode({ data: px.data, width: px.width, height: px.height }, q).data as ArrayLike<number>)
    if (out.length <= max) return out
  }
  throw new ImageRejected('too_large')
}

export type Variants = { full: Uint8Array; feed: Uint8Array; width: number; height: number; ms: number }

/** Validates, fully decodes, and encodes both stored copies. */
export function makeVariants(bytes: Uint8Array, now: () => number = () => performance.now()): Variants {
  const t0 = now()
  if (bytes.length > MAX_INPUT_BYTES) throw new ImageRejected('too_large')
  const header = checkHeader(bytes)
  let decoded: Pixels
  try {
    decoded = decode(bytes, DECODE_LIMITS)
  } catch {
    throw new ImageRejected('not_decodable')
  }
  if (decoded.width !== header.width || decoded.height !== header.height || decoded.data.length !== decoded.width * decoded.height * 4) {
    throw new ImageRejected('not_decodable')
  }
  const full = encodeWithin(decoded, MAX_FULL_BYTES)
  const feed = encodeWithin(downscale(decoded, FEED_EDGE), MAX_FEED_BYTES)
  return { full, feed, width: decoded.width, height: decoded.height, ms: Math.round(now() - t0) }
}

/**
 * A synthetic 1600 x 1067 camera-like photo (gradients, edges and fine noise,
 * harder to compress than most photos), for the hosted processing check: no
 * real photo is stored or needed. Deterministic for a seed.
 */
export function syntheticPhoto(seed: number): Uint8Array {
  const width = 1600
  const height = 1067
  const data = new Uint8Array(width * height * 4)
  let s = (seed * 2654435761) >>> 0
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const band = ((x >> 5) + (y >> 6) + seed) % 7
      const noise = (rnd() - 0.5) * 48
      data[o] = Math.max(0, Math.min(255, (x * 255) / width + band * 9 + noise))
      data[o + 1] = Math.max(0, Math.min(255, (y * 255) / height + noise))
      data[o + 2] = Math.max(0, Math.min(255, 128 + Math.sin((x + y + seed * 40) / 23) * 90 + noise))
      data[o + 3] = 255
    }
  }
  return Uint8Array.from(encode({ data, width, height }, 90).data as ArrayLike<number>)
}
