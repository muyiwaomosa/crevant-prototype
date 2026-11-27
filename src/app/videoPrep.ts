import { AppApiError, type AppApi, type VideoPurpose, type VideoVerified } from './api'

/**
 * Video posts in the browser (SP-VID-001, section 5): check, convert when
 * needed, upload, and have the server check the stored file.
 *
 *   1. Check (no upload): mediabunny reads the file's header. Over five
 *      minutes, over 2 GB, or no picture: refused with a clear message.
 *   2. Convert: unless the file is already an MP4 with H.264 at most
 *      1280 x 720 (either way round), at most about 3 Mbps and at most 110 MB,
 *      it is converted in the browser (WebCodecs) to 720p30 H.264 at about
 *      2.5 Mbps with AAC sound, with progress and Cancel. HEVC from phones is
 *      converted where the browser can decode it; otherwise the member is told
 *      how to record in H.264.
 *   3. Upload: the server authorises the upload and gives a signed upload
 *      token for the one path the database chose; the file goes up with the
 *      resumable protocol in 6 MB chunks and resumes after a lost connection.
 *   4. Verify: the server reads the stored file's header and refuses anything
 *      that isn't H.264 within 1280 x 720, five minutes and 110 MB.
 *   5. Poster: one frame as a JPEG, through the same checks as a photo.
 *
 * mediabunny (MPL-2.0) is loaded only when a video is chosen, so the app's
 * main bundle doesn't grow.
 */

export const MAX_SECONDS = 300
export const MAX_SOURCE_BYTES = 2 * 1024 * 1024 * 1024
export const MAX_OUTPUT_BYTES = 115_343_360
export const TARGET_VIDEO_BPS = 2_500_000
export const TARGET_AUDIO_BPS = 128_000
/** Files already within the limits are sent as they are up to this total bitrate (bits per second). */
export const PASS_THROUGH_BPS = 3_000_000

export type VideoCheck = {
  container: string
  codec: string | null
  audioCodec: string | null
  width: number
  height: number
  seconds: number
  bytes: number
  bitsPerSecond: number
  canDecode: boolean
}

export type Prepared = {
  file: Blob
  check: VideoCheck
  converted: boolean
  output: { width: number; height: number; bytes: number }
  /** Tracks the conversion had to leave out (for example sound it couldn't read). */
  dropped: string[]
}

/** The output size for a source: the long edge at most 1280 and the short edge at most 720, even numbers, never larger. */
export function targetSize(width: number, height: number): { width: number; height: number } {
  const long = Math.max(width, height)
  const short = Math.min(width, height)
  const scale = Math.min(1, 1280 / long, 720 / short)
  const even = (n: number) => Math.max(2, Math.floor((n * scale) / 2) * 2)
  return { width: even(width), height: even(height) }
}

/** Whether a checked file can be sent as it is (no conversion). */
export function canPassThrough(c: VideoCheck): boolean {
  return (
    c.container === 'mp4' &&
    c.codec === 'avc' &&
    (c.audioCodec === null || c.audioCodec === 'aac') &&
    Math.max(c.width, c.height) <= 1280 &&
    Math.min(c.width, c.height) <= 720 &&
    c.bytes <= MAX_OUTPUT_BYTES &&
    c.bitsPerSecond <= PASS_THROUGH_BPS
  )
}

const load = () => import('mediabunny')

/** Step 1: reads the header only. Throws an AppApiError with the member's message. */
export async function checkVideo(file: Blob): Promise<VideoCheck> {
  if (file.size > MAX_SOURCE_BYTES) throw new AppApiError('video_source_too_large')
  if (typeof VideoDecoder === 'undefined' || typeof VideoEncoder === 'undefined') throw new AppApiError('video_not_supported')
  const mb = await load()
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
  try {
    let format
    try {
      format = await input.getFormat()
    } catch {
      throw new AppApiError('video_not_readable')
    }
    const video = await input.getPrimaryVideoTrack()
    if (!video) throw new AppApiError('video_missing')
    const audio = await input.getPrimaryAudioTrack()
    const seconds = await input.computeDuration()
    if (!Number.isFinite(seconds) || seconds <= 0) throw new AppApiError('video_not_readable')
    if (seconds > MAX_SECONDS + 0.5) throw new AppApiError('video_too_long')
    return {
      container: format === mb.MP4 ? 'mp4' : format === mb.QTFF ? 'mov' : format.name.toLowerCase(),
      codec: video.codec,
      audioCodec: audio?.codec ?? null,
      width: video.displayWidth,
      height: video.displayHeight,
      seconds,
      bytes: file.size,
      bitsPerSecond: Math.round((file.size * 8) / seconds),
      canDecode: await video.canDecode(),
    }
  } finally {
    input.dispose?.()
  }
}

/** Step 2: converts to 720p30 H.264 MP4 (or passes the file through). */
export async function convertVideo(file: Blob, check: VideoCheck, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<Prepared> {
  if (canPassThrough(check)) {
    onProgress(1)
    return { file, check, converted: false, output: { width: check.width, height: check.height, bytes: file.size }, dropped: [] }
  }
  if (!check.canDecode) throw new AppApiError(check.codec === 'hevc' ? 'video_hevc' : 'video_not_readable')
  const mb = await load()
  if (!(await mb.canEncodeVideo('avc'))) throw new AppApiError('video_not_supported')
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS })
  const target = new mb.BufferTarget()
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: 'in-memory' }), target })
  const size = targetSize(check.width, check.height)
  const conversion = await mb.Conversion.init({
    input,
    output,
    tracks: 'primary',
    video: { codec: 'avc', width: size.width, height: size.height, fit: 'contain', frameRate: 30, bitrate: TARGET_VIDEO_BPS, keyFrameInterval: 2 },
    // AAC sound is copied as it is; other sound is converted to AAC where the browser can.
    audio: check.audioCodec === 'aac' ? { codec: 'aac' } : { codec: 'aac', bitrate: TARGET_AUDIO_BPS },
  })
  const dropped = conversion.discardedTracks.map((d) => `${d.track.type}: ${d.reason}`)
  // Never publish sound without a picture.
  if (!conversion.isValid || conversion.discardedTracks.some((d) => d.track.type === 'video')) {
    input.dispose?.()
    throw new AppApiError(check.codec === 'hevc' ? 'video_hevc' : 'video_not_readable')
  }
  conversion.onProgress = (p) => onProgress(Math.max(0, Math.min(1, p)))
  const stop = () => void conversion.cancel()
  signal?.addEventListener('abort', stop, { once: true })
  try {
    await conversion.execute()
  } catch (e) {
    if (signal?.aborted) throw new AppApiError('video_canceled')
    throw e instanceof AppApiError ? e : new AppApiError('video_not_readable')
  } finally {
    signal?.removeEventListener('abort', stop)
    input.dispose?.()
  }
  if (signal?.aborted) throw new AppApiError('video_canceled')
  const buffer = target.buffer
  if (!buffer) throw new AppApiError('video_not_readable')
  if (buffer.byteLength > MAX_OUTPUT_BYTES) throw new AppApiError('video_too_large')
  const blob = new Blob([buffer], { type: 'video/mp4' })
  onProgress(1)
  return { file: blob, check, converted: true, output: { width: size.width, height: size.height, bytes: blob.size }, dropped }
}

/** Step 5: one frame (about a second in) as a JPEG of at most 1280 px, or null if the browser can't. */
export async function posterFrom(file: Blob): Promise<Blob | null> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = url
  try {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), 15_000)
      video.onloadeddata = () => (clearTimeout(t), clearTimeout(kick), resolve())
      video.onerror = () => (clearTimeout(t), clearTimeout(kick), reject(new Error('error')))
      // Some browsers (iPhone Safari) load no frame for a video that never plays, so the poster used
      // to be skipped there. A muted, inline, offscreen play (always allowed) makes it load one.
      const kick = setTimeout(() => {
        const p = video.play()
        if (p) p.then(() => video.pause(), () => undefined)
      }, 1_500)
      video.load()
    })
    video.pause()
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 5_000)
      video.onseeked = () => (clearTimeout(t), resolve())
      video.currentTime = Math.min(1, (video.duration || 2) / 2)
    })
    const w = video.videoWidth
    const h = video.videoHeight
    if (!w || !h) return null
    const scale = Math.min(1, 1280 / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(64, Math.round(w * scale))
    canvas.height = Math.max(64, Math.round(h * scale))
    const g = canvas.getContext('2d')
    if (!g) return null
    g.drawImage(video, 0, 0, canvas.width, canvas.height)
    return await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
  } catch {
    return null
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

/** Keeps the screen awake where the browser allows it (conversion and upload need the page open). */
export async function keepAwake(): Promise<() => void> {
  try {
    const lock = await (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen')
    return () => void lock?.release().catch(() => {})
  } catch {
    return () => {}
  }
}

export type Stage = 'checking' | 'converting' | 'uploading' | 'verifying' | 'done'
export type PipelineResult = {
  uploadId: string
  prepared: Prepared
  verified: VideoVerified
  poster: boolean
  ms: { check: number; convert: number; upload: number; verify: number }
}

/** Steps 1 to 5 for one file, with timings (the device test page shows them). */
export async function prepareAndUpload(
  api: AppApi,
  file: Blob,
  purpose: VideoPurpose,
  on: { stage(s: Stage): void; progress(fraction: number): void },
  signal?: AbortSignal,
  steps: { check: typeof checkVideo; convert: typeof convertVideo; poster: typeof posterFrom } = {
    check: checkVideo,
    convert: convertVideo,
    poster: posterFrom,
  },
): Promise<PipelineResult> {
  const release = await keepAwake()
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
  try {
    on.stage('checking')
    let t = now()
    const check = await steps.check(file)
    const checkMs = now() - t
    if (signal?.aborted) throw new AppApiError('video_canceled')
    on.stage('converting')
    on.progress(0)
    t = now()
    const prepared = await steps.convert(file, check, on.progress, signal)
    const convertMs = prepared.converted ? now() - t : 0
    on.stage('uploading')
    on.progress(0)
    t = now()
    const ticket = await api.beginVideoUpload(prepared.file.size, Math.max(1, Math.round(check.seconds * 1000)), purpose)
    await api.uploadVideoFile(ticket, prepared.file, on.progress, signal)
    const uploadMs = now() - t
    on.stage('verifying')
    t = now()
    const verified = await api.verifyVideo(ticket.uploadId)
    const verifyMs = now() - t
    // The poster is a nicety: a post without one still plays.
    let poster = false
    try {
      const jpeg = await steps.poster(prepared.file)
      if (jpeg) {
        await api.uploadVideoPoster(ticket.uploadId, jpeg)
        poster = true
      }
    } catch {
      poster = false
    }
    on.stage('done')
    return { uploadId: ticket.uploadId, prepared, verified, poster, ms: { check: checkMs, convert: convertMs, upload: uploadMs, verify: verifyMs } }
  } finally {
    release()
  }
}

export const formatDuration = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const formatMb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`
export const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
