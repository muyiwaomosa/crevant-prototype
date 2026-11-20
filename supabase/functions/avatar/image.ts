// Server-side image validation for profile pictures (Build 5.2b).
//
// Nothing the browser sends is trusted. An upload is accepted only if:
//   1. its header parses as a JPEG whose frame is exactly 512 x 512 pixels
//      (checked before any decoding, so oversized or hostile headers never
//      reach the decoder);
//   2. it fully decodes with jpeg-js 0.4.4 under hard limits (at most one
//      megapixel and 64 MB of memory; strict, not tolerant, decoding);
//   3. it re-encodes from the decoded pixels to a new JPEG of at most 200 KB.
// Only the re-encoded file is ever stored: it carries no metadata (EXIF,
// GPS, comments), nothing after the image, and nothing the browser chose.
//
// jpeg-js 0.4.4, vendored byte for byte (vendor/jpeg-js-0.4.4/README.md):
// BSD-3-Clause, no dependencies. Its two published advisories (resource
// consumption, fixed in 0.4.0 by the limits used here; GHSA-xvf7-4v9q-58w6
// infinite loop, fixed in 0.4.4) do not affect this version.
import { decode } from './vendor/jpeg-js-0.4.4/decoder.js'
import { encode } from './vendor/jpeg-js-0.4.4/encoder.js'

export const SIZE = 512
export const MAX_INPUT_BYTES = 1_000_000
export const MAX_STORED_BYTES = 200 * 1024
const DECODE_LIMITS = { maxResolutionInMP: 1, maxMemoryUsageInMB: 64, tolerantDecoding: false, useTArray: true, formatAsRGBA: true } as const

export class ImageRejected extends Error {
  constructor(public code: 'not_jpeg' | 'wrong_size' | 'not_decodable' | 'too_large') {
    super(code)
  }
}

/** Reads the JPEG frame header without decoding. Throws unless it is a 512 x 512 baseline or progressive JPEG. */
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
    if (marker === 0xd9 || marker === 0xda) break // end of image, or scan data before any frame
    const length = (bytes[i + 2] << 8) | bytes[i + 3]
    if (length < 2 || i + 2 + length > bytes.length) throw new ImageRejected('not_jpeg')
    // SOF0 (baseline), SOF1 (extended), SOF2 (progressive). Others (lossless, arithmetic) are refused.
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (length < 8) throw new ImageRejected('not_jpeg')
      const height = (bytes[i + 5] << 8) | bytes[i + 6]
      const width = (bytes[i + 7] << 8) | bytes[i + 8]
      const components = bytes[i + 9]
      if (width !== SIZE || height !== SIZE) throw new ImageRejected('wrong_size')
      if (components !== 1 && components !== 3) throw new ImageRejected('not_jpeg')
      return { width, height }
    }
    if (marker >= 0xc3 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) throw new ImageRejected('not_jpeg')
    i += 2 + length
  }
  throw new ImageRejected('not_jpeg')
}

/** Fully decodes under hard limits, then re-encodes. Returns the only bytes that will be stored. */
export function reencode(bytes: Uint8Array): Uint8Array {
  if (bytes.length > MAX_INPUT_BYTES) throw new ImageRejected('too_large')
  checkHeader(bytes)
  let decoded: { width: number; height: number; data: Uint8Array }
  try {
    decoded = decode(bytes, DECODE_LIMITS)
  } catch {
    throw new ImageRejected('not_decodable')
  }
  if (decoded.width !== SIZE || decoded.height !== SIZE || decoded.data.length !== SIZE * SIZE * 4) throw new ImageRejected('wrong_size')
  for (const quality of [85, 70]) {
    const out = new Uint8Array(encode({ data: decoded.data, width: SIZE, height: SIZE }, quality).data)
    if (out.length <= MAX_STORED_BYTES) return out
  }
  throw new ImageRejected('too_large')
}
