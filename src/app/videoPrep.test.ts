// Video preparation and the resumable upload (IP-5): the parts that run without a real browser encoder.
import { describe, expect, it } from 'vitest'
import { AppApiError, tusUpload } from './api'
import { canPassThrough, prepareAndUpload, targetSize, type VideoCheck } from './videoPrep'

const check = (c: Partial<VideoCheck> = {}): VideoCheck => ({
  container: 'mp4',
  codec: 'avc',
  audioCodec: 'aac',
  width: 1280,
  height: 720,
  seconds: 60,
  bytes: 18_000_000,
  bitsPerSecond: 2_400_000,
  canDecode: true,
  ...c,
})

describe('the output size and when a file is sent as it is', () => {
  it('fits within 1280 x 720 either way round, in even numbers, never enlarging', () => {
    expect(targetSize(1920, 1080)).toEqual({ width: 1280, height: 720 })
    expect(targetSize(1080, 1920)).toEqual({ width: 720, height: 1280 })
    expect(targetSize(3840, 2160)).toEqual({ width: 1280, height: 720 })
    expect(targetSize(1440, 1080)).toEqual({ width: 960, height: 720 })
    expect(targetSize(640, 360)).toEqual({ width: 640, height: 360 })
    expect(targetSize(1081, 1081)).toEqual({ width: 720, height: 720 })
  })
  it('passes through only MP4 H.264 within 720p, the bitrate and 110 MB', () => {
    expect(canPassThrough(check())).toBe(true)
    expect(canPassThrough(check({ width: 720, height: 1280 }))).toBe(true)
    expect(canPassThrough(check({ audioCodec: null }))).toBe(true)
    expect(canPassThrough(check({ container: 'mov' }))).toBe(false)
    expect(canPassThrough(check({ codec: 'hevc' }))).toBe(false)
    expect(canPassThrough(check({ width: 1920, height: 1080 }))).toBe(false)
    expect(canPassThrough(check({ bitsPerSecond: 17_000_000 }))).toBe(false)
    expect(canPassThrough(check({ bytes: 120_000_000 }))).toBe(false)
    expect(canPassThrough(check({ audioCodec: 'opus' }))).toBe(false)
  })
})

/** A pretend Storage TUS endpoint: records what arrived; can drop the connection once. */
function fakeTus(opts: { dropAfterFirstChunk?: boolean } = {}) {
  let received = 0
  let dropped = false
  const calls: string[] = []
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    const h = new Headers(init.headers)
    calls.push(`${init.method} ${h.get('x-signature')}`)
    if (init.method === 'POST') {
      expect(h.get('Tus-Resumable')).toBe('1.0.0')
      const md = Object.fromEntries((h.get('Upload-Metadata') ?? '').split(',').map((kv) => [kv.split(' ')[0], atob(kv.split(' ')[1])]))
      expect(md).toMatchObject({ bucketName: 'post-videos', objectName: 'u/v.mp4', contentType: 'video/mp4' })
      return new Response(null, { status: 201, headers: { Location: 'https://x.test/upload/resumable/sign/abc' } })
    }
    if (init.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': String(received) } })
    // PATCH
    expect(Number(h.get('Upload-Offset'))).toBe(received)
    if (opts.dropAfterFirstChunk && received > 0 && !dropped) {
      dropped = true
      throw new TypeError('Failed to fetch')
    }
    received += (init.body as Blob).size
    return new Response(null, { status: 204, headers: { 'Upload-Offset': String(received) } })
  }) as unknown as typeof fetch
  return { fetchImpl, calls, received: () => received }
}

describe('the resumable upload', () => {
  const file = new Blob([new Uint8Array(25)], { type: 'video/mp4' })
  it('sends the file in chunks with the signed token, reporting progress', async () => {
    const t = fakeTus()
    const progress: number[] = []
    await tusUpload({
      endpoint: 'https://x.test/upload/resumable/sign',
      token: 'tok',
      bucket: 'post-videos',
      path: 'u/v.mp4',
      file,
      chunkBytes: 10,
      onProgress: (p) => progress.push(p),
      fetchImpl: t.fetchImpl,
    })
    expect(t.received()).toBe(25)
    expect(t.calls).toEqual(['POST tok', 'PATCH tok', 'PATCH tok', 'PATCH tok'])
    expect(progress.at(-1)).toBe(1)
  })
  it('after a lost connection, asks how much arrived and carries on', async () => {
    const t = fakeTus({ dropAfterFirstChunk: true })
    await tusUpload({
      endpoint: 'https://x.test/upload/resumable/sign',
      token: 'tok',
      bucket: 'post-videos',
      path: 'u/v.mp4',
      file,
      chunkBytes: 10,
      onProgress: () => {},
      fetchImpl: t.fetchImpl,
    })
    expect(t.received()).toBe(25)
    expect(t.calls).toContain('HEAD tok')
  }, 10_000)
  it('stops when cancelled', async () => {
    const t = fakeTus()
    const ctl = new AbortController()
    ctl.abort()
    await expect(
      tusUpload({
        endpoint: 'https://x.test/u',
        token: 'tok',
        bucket: 'post-videos',
        path: 'u/v.mp4',
        file,
        chunkBytes: 10,
        onProgress: () => {},
        signal: ctl.signal,
        fetchImpl: t.fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'video_canceled' })
  })
})

describe('the whole pipeline', () => {
  it('checks, sends a file that needs no conversion, has the server check it, then adds the poster, with timings', async () => {
    const calls: string[] = []
    const api = {
      beginVideoUpload: async (bytes: number, ms: number, purpose: string) => (
        calls.push(`begin ${bytes} ${ms} ${purpose}`),
        { uploadId: 'v1', bucket: 'post-videos', path: 'u/v1.mp4', token: 't', chunkBytes: 6 }
      ),
      uploadVideoFile: async () => void calls.push('upload'),
      verifyVideo: async () => (calls.push('verify'), { width: 1280, height: 720, durationMs: 60000, bytes: 3 }),
      uploadVideoPoster: async () => void calls.push('poster'),
    }
    const stages: string[] = []
    const r = await prepareAndUpload(api as never, new Blob(['abc']), 'post', { stage: (s) => stages.push(s), progress: () => {} }, undefined, {
      check: async () => check({ bytes: 3 }),
      convert: async (file, c, onProgress) => (
        onProgress(1),
        { file, check: c, converted: false, output: { width: 1280, height: 720, bytes: 3 }, dropped: [] }
      ),
      poster: async () => new Blob(['jpeg'], { type: 'image/jpeg' }),
    })
    expect(calls).toEqual(['begin 3 60000 post', 'upload', 'verify', 'poster'])
    expect(stages).toEqual(['checking', 'converting', 'uploading', 'verifying', 'done'])
    expect(r).toMatchObject({ uploadId: 'v1', poster: true })
    expect(r.ms.convert).toBe(0)
  })
  it('a refusal at the check stops before anything is uploaded', async () => {
    const calls: string[] = []
    const api = { beginVideoUpload: async () => void calls.push('begin') }
    await expect(
      prepareAndUpload(api as never, new Blob(['abc']), 'post', { stage: () => {}, progress: () => {} }, undefined, {
        check: async () => {
          throw new AppApiError('video_too_long')
        },
        convert: async () => {
          throw new Error('not reached')
        },
        poster: async () => null,
      }),
    ).rejects.toMatchObject({ code: 'video_too_long' })
    expect(calls).toEqual([])
  })
})
