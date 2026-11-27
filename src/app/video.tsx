import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Clapperboard, Copy, RefreshCw, VideoOff, X } from 'lucide-react'
import { Card, PageHeader, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import {
  AppApiError,
  messageFor,
  type DeviceKind,
  type FounderVideoStatus,
  type Post,
  type VideoLinks,
  type VideoMedia,
  type VideoPurpose,
  type VideoStatus,
} from './api'
import { useAppApi } from './AppApiContext'
import { formatDuration, formatMb, formatSeconds, prepareAndUpload, type PipelineResult, type Stage } from './videoPrep'

/**
 * Video posts (IP-5, 20261213000000). A post can carry one video of up to
 * five minutes, prepared in the browser to 720p H.264 and checked again by the
 * server before it can be published. Videos play from short-lived signed
 * links, never autoplay, load nothing until the member presses play, and
 * horizontal swipes over the player never change the screen. Everything here
 * appears only while the founder has video posts switched on (the founder and
 * testers also have the private device test page).
 */

// ---------------------------------------------------------------------------
// Status and links.

type LinkEntry = { state: 'loading' | 'ok' | 'none'; links: VideoLinks | null; at: number }
type VideoCtx = {
  status: VideoStatus | null
  reload(): void
  get(id: string): LinkEntry | undefined
  request(id: string, fresh?: boolean): void
  version: number
}
const Ctx = createContext<VideoCtx>({ status: null, reload() {}, get: () => undefined, request() {}, version: 0 })
const LINK_MS = 25 * 60_000

/** Loads whether video posting is on (never blocking the app) and caches video links. */
export function VideoProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const [status, setStatus] = useState<VideoStatus | null>(null)
  const cache = useRef(new Map<string, LinkEntry>())
  const queue = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [version, setVersion] = useState(0)
  const reload = useCallback(() => {
    api.videoStatus().then(
      (s) => setStatus(s),
      () => setStatus(null),
    )
  }, [api])
  useEffect(() => {
    reload()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [reload])
  const flush = useCallback(async () => {
    timer.current = null
    const ids = [...queue.current]
    queue.current.clear()
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      let links: Record<string, VideoLinks> = {}
      try {
        links = await api.videoLinks(chunk)
      } catch {
        links = {}
      }
      for (const id of chunk)
        cache.current.set(id, links[id] ? { state: 'ok', links: links[id], at: Date.now() } : { state: 'none', links: null, at: Date.now() })
    }
    setVersion((v) => v + 1)
  }, [api])
  const request = useCallback(
    (id: string, fresh = false) => {
      const hit = cache.current.get(id)
      if (!fresh && hit && (hit.state === 'loading' || (hit.state === 'ok' && Date.now() - hit.at < LINK_MS))) return
      cache.current.set(id, { state: 'loading', links: null, at: 0 })
      queue.current.add(id)
      if (!timer.current) timer.current = setTimeout(() => void flush(), 25)
    },
    [flush],
  )
  return <Ctx.Provider value={{ status, reload, get: (id) => cache.current.get(id), request, version }}>{children}</Ctx.Provider>
}

export function useVideoStatus(): VideoStatus | null {
  return useContext(Ctx).status
}

// ---------------------------------------------------------------------------
// A post's video.

/** The player: no autoplay, nothing loaded before play, standard controls, never swiped away. */
export function PostVideo({ post, bleed = false }: { post: Post; bleed?: boolean }) {
  const media = post.media as VideoMedia
  const ctx = useContext(Ctx)
  const ref = useRef<HTMLVideoElement>(null)
  const resumeAt = useRef<number | null>(null)
  const retried = useRef(false)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    ctx.request(post.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id])
  const entry = ctx.get(post.id)
  const links = !entry || entry.state === 'loading' ? undefined : entry.links
  // An expired link (or a dropped connection): ask once for a fresh one and carry on where it stopped.
  // A second failure with a fresh link is a real playback failure: say so, with a way to try again.
  function failed() {
    if (retried.current) {
      setBroken(true)
      return
    }
    retried.current = true
    resumeAt.current = ref.current?.currentTime ?? null
    ctx.request(post.id, true)
  }
  const ratio = Math.max(media.width / media.height, 9 / 16)
  const label = media.description ?? `Video by ${post.author.displayName}`
  return (
    <div className={bleed ? undefined : 'mt-3'} data-no-swipe data-testid="post-video" onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      <div className={`relative mx-auto w-full max-w-full overflow-hidden bg-ink-900 ${bleed ? '' : 'rounded-2xl'}`} style={{ aspectRatio: String(ratio), maxHeight: '75vh' }}>
        {links === undefined && <div className="absolute inset-0 animate-pulse bg-ink-800" aria-hidden="true" />}
        {links === null && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink-100 p-4 text-center text-sm text-ink-700">
            <VideoOff className="h-6 w-6" aria-hidden="true" />
            <p>This video isn't available right now.</p>
            <button
              type="button"
              onClick={() => {
                retried.current = false
                ctx.request(post.id, true)
              }}
              className={buttonClass('secondary', 'sm')}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </div>
        )}
        {links && broken && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-ink-100 p-4 text-center text-sm text-ink-700" role="alert" data-testid="post-video-error">
            <VideoOff className="h-6 w-6" aria-hidden="true" />
            <p>This video couldn't play. Check your connection and try again. If it keeps happening, report it with Send feedback.</p>
            <button
              type="button"
              onClick={() => {
                retried.current = false
                setBroken(false)
                ctx.request(post.id, true)
              }}
              className={buttonClass('secondary', 'sm')}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" /> Try again
            </button>
          </div>
        )}
        {links && (
          <video
            ref={ref}
            // Without a poster, the browser shows the first frame instead of a blank player: it reads only
            // the start of the file (metadata), never the whole video, until the member presses play.
            src={links.poster ? links.src : `${links.src}#t=0.1`}
            poster={links.poster ?? undefined}
            controls
            playsInline
            preload={links.poster ? 'none' : 'metadata'}
            aria-label={label}
            className="absolute inset-0 h-full w-full bg-ink-900 object-contain"
            onError={failed}
            onLoadedMetadata={(e) => {
              if (resumeAt.current !== null) {
                e.currentTarget.currentTime = resumeAt.current
                resumeAt.current = null
              }
            }}
            data-testid="post-video-player"
          />
        )}
      </div>
      <p className="mt-1 text-[13px] text-ink-600">Video, {formatDuration(media.durationMs)}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Preparing and uploading one video (the composer and the device test page).

export type VideoJob = {
  stage: Stage | 'idle' | 'failed'
  progress: number
  error: unknown
  result: PipelineResult | null
  fileName: string | null
  fileType: string | null
  fileBytes: number | null
}
const IDLE: VideoJob = { stage: 'idle', progress: 0, error: null, result: null, fileName: null, fileType: null, fileBytes: null }

export function useVideoJob(purpose: VideoPurpose) {
  const api = useAppApi()
  const [job, setJob] = useState<VideoJob>(IDLE)
  const abort = useRef<AbortController | null>(null)
  useEffect(() => () => abort.current?.abort(), [])
  const start = useCallback(
    async (file: File): Promise<PipelineResult | null> => {
      abort.current?.abort()
      const ctl = new AbortController()
      abort.current = ctl
      setJob({ ...IDLE, stage: 'checking', fileName: file.name, fileType: file.type || null, fileBytes: file.size })
      try {
        const result = await prepareAndUpload(
          api,
          file,
          purpose,
          {
            stage: (s) => !ctl.signal.aborted && setJob((j) => ({ ...j, stage: s, progress: 0 })),
            progress: (p) => !ctl.signal.aborted && setJob((j) => ({ ...j, progress: p })),
          },
          ctl.signal,
        )
        if (ctl.signal.aborted) return null
        setJob((j) => ({ ...j, stage: 'done', progress: 1, result }))
        return result
      } catch (e) {
        if (abort.current === ctl) setJob((j) => ({ ...j, stage: 'failed', error: ctl.signal.aborted ? new AppApiError('video_canceled') : e }))
        return null
      }
    },
    [api, purpose],
  )
  const cancel = useCallback(() => {
    abort.current?.abort()
    setJob((j) => (j.stage === 'done' || j.stage === 'idle' ? j : { ...j, stage: 'failed', error: new AppApiError('video_canceled') }))
  }, [])
  const reset = useCallback(() => {
    abort.current?.abort()
    abort.current = null
    setJob(IDLE)
  }, [])
  return { job, start, cancel, reset }
}

const STAGE_TEXT: Record<string, string> = {
  checking: 'Checking your video…',
  converting: 'Preparing your video…',
  uploading: 'Uploading your video…',
  verifying: 'Making sure it plays everywhere…',
}
export const busyStage = (s: VideoJob['stage']) => s === 'checking' || s === 'converting' || s === 'uploading' || s === 'verifying'

/** Progress for a video on its way, with Cancel; or the ready video with Remove. */
export function VideoProgress({ job, onCancel, onRemove }: { job: VideoJob; onCancel: () => void; onRemove: () => void }) {
  const busy = busyStage(job.stage)
  const pct = Math.round(job.progress * 100)
  return (
    <div className="space-y-2 rounded-2xl bg-paper p-3" data-testid="video-attachment">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-900">
        <Clapperboard className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 break-words">{job.fileName ?? 'Your video'}</span>
      </p>
      {busy && (
        <>
          <p role="status" className="text-sm text-ink-700">
            {STAGE_TEXT[job.stage]}
            {(job.stage === 'converting' || job.stage === 'uploading') && ` ${pct}%`}
          </p>
          {(job.stage === 'converting' || job.stage === 'uploading') && (
            <div
              role="progressbar"
              aria-label={job.stage === 'converting' ? 'Preparing' : 'Uploading'}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              className="h-2 w-full overflow-hidden rounded-full bg-ink-100"
            >
              <div className="h-full rounded-full bg-brand-600 transition-[width]" style={{ width: `${pct}%` }} />
            </div>
          )}
          {job.stage === 'converting' && <p className="text-[13px] text-ink-600">Please keep this page open until it's done.</p>}
          <button type="button" onClick={onCancel} className={buttonClass('secondary', 'sm') + ' h-11'}>
            <X className="h-4 w-4" aria-hidden="true" /> Cancel
          </button>
        </>
      )}
      {job.stage === 'done' && job.result && (
        <>
          <p role="status" className="text-sm text-ink-700">
            Ready to post: {formatDuration(job.result.verified.durationMs)}, {job.result.verified.width} x {job.result.verified.height}.
          </p>
          {job.result.prepared.dropped.some((d) => d.startsWith('audio')) && (
            <p className="text-[13px] text-ink-600">
              This browser couldn't keep the sound, so the video will play without it. Remove it if you'd rather try another device.
            </p>
          )}
          <button type="button" onClick={onRemove} className={buttonClass('secondary', 'sm') + ' h-11'}>
            <X className="h-4 w-4" aria-hidden="true" /> Remove video
          </button>
        </>
      )}
      {job.stage === 'failed' && (
        <>
          <Message tone="error">{messageFor(job.error)}</Message>
          <button type="button" onClick={onRemove} className={buttonClass('secondary', 'sm') + ' h-11'}>
            <X className="h-4 w-4" aria-hidden="true" /> Remove video
          </button>
        </>
      )}
    </div>
  )
}

export const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/*'

// ---------------------------------------------------------------------------
// The device test page (/app/video-test): the founder and testers only.

type TestRun = { at: string; file: string; type: string; sourceBytes: number; summary: string; pass: boolean; uploadId: string | null }

function deviceLine(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const webcodecs = typeof VideoEncoder !== 'undefined' && typeof VideoDecoder !== 'undefined'
  return `Device: ${ua}\nWebCodecs: ${webcodecs ? 'yes' : 'no'}; screen ${typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : 'unknown'}`
}

export function VideoTestPage() {
  const api = useAppApi()
  const status = useVideoStatus()
  const [ready, setReady] = useState<VideoStatus | null | undefined>(undefined)
  const { job, start, cancel, reset } = useVideoJob('device_test')
  const inputRef = useRef<HTMLInputElement>(null)
  const [runs, setRuns] = useState<TestRun[]>([])
  const [play, setPlay] = useState<VideoLinks | null>(null)
  const [playError, setPlayError] = useState<unknown>(null)
  const [copied, setCopied] = useState(false)
  const summaryId = useId()
  useEffect(() => {
    if (status) setReady(status)
    else
      api.videoStatus().then(
        (s) => setReady(s),
        () => setReady(null),
      )
  }, [api, status])

  async function choose(file: File | undefined) {
    if (!file) return
    setPlay(null)
    setPlayError(null)
    setCopied(false)
    const result = await start(file)
    if (inputRef.current) inputRef.current.value = ''
    setRuns((r) => [...r, runLine(file, result)])
  }
  function runLine(file: File, result: PipelineResult | null): TestRun {
    const base = { at: new Date().toISOString(), file: file.name, type: file.type || 'unknown type', sourceBytes: file.size }
    if (!result) return { ...base, summary: '', pass: false, uploadId: null }
    const c = result.prepared.check
    return {
      ...base,
      pass: true,
      uploadId: result.uploadId,
      summary: [
        `Received: ${c.container}, ${c.codec ?? 'unknown codec'}, ${c.width}x${c.height}, ${formatSeconds(c.seconds * 1000)}, ${formatMb(c.bytes)}, sound ${c.audioCodec ?? 'none'}`,
        `Check ${formatSeconds(result.ms.check)}; Convert ${result.prepared.converted ? formatSeconds(result.ms.convert) : 'not needed'}; Upload ${formatSeconds(result.ms.upload)}; Server check ${formatSeconds(result.ms.verify)}`,
        `Sent: ${result.verified.width}x${result.verified.height}, ${formatSeconds(result.verified.durationMs)}, ${formatMb(result.verified.bytes)}, poster ${result.poster ? 'yes' : 'no'}${result.prepared.dropped.length ? `, left out: ${result.prepared.dropped.join(', ')}` : ''}`,
      ].join('\n'),
    }
  }
  // The latest run's message, once it failed.
  const lastFailed = job.stage === 'failed' ? messageFor(job.error) : null
  const results = [
    deviceLine(),
    ...runs.map(
      (r, i) =>
        `Run ${i + 1}: ${r.file} (${r.type}, ${formatMb(r.sourceBytes)}): ${r.pass ? 'Pass' : `Did not pass${i === runs.length - 1 && lastFailed ? `: ${lastFailed}` : ''}`}${r.summary ? `\n${r.summary}` : ''}`,
    ),
  ].join('\n\n')

  async function playLatest() {
    const last = [...runs].reverse().find((r) => r.uploadId)
    if (!last?.uploadId) return
    setPlayError(null)
    try {
      setPlay(await api.videoTestLink(last.uploadId))
    } catch (e) {
      setPlayError(e)
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(results)
      setCopied(true)
    } catch {
      // Fall back to selecting the text so it can be copied by hand.
      const el = document.getElementById(summaryId) as HTMLTextAreaElement | null
      el?.select()
    }
  }

  return (
    <>
      <Link to="/app/profile" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Profile
      </Link>
      <PageHeader
        title="Video device test"
        subtitle="Check that videos work on this phone or computer. Nothing here is published, and test uploads are deleted after 24 hours."
      />
      {ready === undefined && <Spinner label="Loading…" />}
      {ready === null && <Message tone="info">Video posts aren't available on this database yet.</Message>}
      {ready && !ready.canTest && <Message tone="info">The video device test is for the founder and testers.</Message>}
      {ready && ready.canTest && (
        <div className="space-y-4">
          <Card className="space-y-3 p-5">
            <h2 className="font-display text-lg font-extrabold text-ink-900">1. Choose a video</h2>
            <p className="text-[14px] text-ink-700">
              Up to five minutes. The page checks it, prepares it if needed, uploads it privately and asks the server to check it. Keep the page open while it
              works.
            </p>
            <input
              ref={inputRef}
              type="file"
              accept={VIDEO_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => void choose(e.target.files?.[0])}
              data-testid="video-test-input"
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busyStage(job.stage)}
              className={buttonClass('primary', 'md') + ' min-h-11'}
            >
              <Clapperboard className="h-4 w-4" aria-hidden="true" /> Choose a video
            </button>
            {job.stage !== 'idle' && <VideoProgress job={job} onCancel={cancel} onRemove={reset} />}
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-display text-lg font-extrabold text-ink-900">2. Check, Convert, Upload</h2>
            {runs.length === 0 ? (
              <p className="text-[14px] text-ink-700">The times show here after your first video.</p>
            ) : (
              <ol className="space-y-3 text-[14px] text-ink-800" aria-label="Test runs">
                {runs.map((r, i) => (
                  <li key={i} className="rounded-2xl bg-paper p-3">
                    <p className="font-semibold">
                      {r.file}: {r.pass ? 'Pass' : 'Did not pass'}
                    </p>
                    {r.summary && <p className="mt-1 whitespace-pre-wrap break-words">{r.summary}</p>}
                    {!r.pass && i === runs.length - 1 && lastFailed && <p className="mt-1">{lastFailed}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-display text-lg font-extrabold text-ink-900">3. Play</h2>
            <button
              type="button"
              onClick={() => void playLatest()}
              disabled={!runs.some((r) => r.uploadId)}
              className={buttonClass('secondary', 'md') + ' min-h-11'}
            >
              Play the uploaded clip
            </button>
            {play && (
              <div data-no-swipe onTouchStart={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <video
                  src={play.src}
                  poster={play.poster ?? undefined}
                  controls
                  playsInline
                  preload="none"
                  aria-label="Your test video"
                  className="max-h-[70vh] w-full rounded-2xl bg-ink-900"
                  data-testid="video-test-player"
                />
                <p className="mt-1 text-[13px] text-ink-600">Press play. Did it play with sound?</p>
              </div>
            )}
            {playError !== null && <Message tone="error">{messageFor(playError)}</Message>}
          </Card>
          <Card className="space-y-3 p-5">
            <h2 className="font-display text-lg font-extrabold text-ink-900">4. Results</h2>
            <label htmlFor={summaryId} className="block text-sm font-semibold text-ink-800">
              Summary to send to the Splitpost team
            </label>
            <textarea
              id={summaryId}
              readOnly
              value={results}
              rows={8}
              className="block w-full resize-y rounded-2xl border border-ink-200 bg-white px-3 py-2 font-mono text-[12px] leading-relaxed text-ink-900"
            />
            <button type="button" onClick={() => void copy()} className={buttonClass('primary', 'md') + ' min-h-11'}>
              <Copy className="h-4 w-4" aria-hidden="true" /> Copy results
            </button>
            {copied && <Message tone="success">Copied. Paste it into Feedback (Problem, Create) or send it to the team.</Message>}
          </Card>
        </div>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Control Center: device tests, the storage cap and readiness (founder).

/** Tells the switches panel (control.tsx) to look again. Kept here so the two panels share no import cycle. */
const VIDEO_READINESS_EVENT = 'splitpost:video-readiness'

const DEVICES: Array<{ value: DeviceKind; label: string }> = [
  { value: 'iphone_safari', label: 'iPhone Safari' },
  { value: 'android_chrome', label: 'Android Chrome' },
  { value: 'desktop', label: 'Computer' },
]
const field = 'mt-1 block min-h-11 w-full rounded-xl border border-ink-200 bg-white px-3 text-base text-ink-900'

export function VideoReadinessPanel() {
  const api = useAppApi()
  const [s, setS] = useState<FounderVideoStatus | null | undefined>(undefined)
  const [device, setDevice] = useState<DeviceKind>('iphone_safari')
  const [passed, setPassed] = useState<'yes' | 'no'>('yes')
  const [notes, setNotes] = useState('')
  const [cap, setCap] = useState('50')
  const [reason, setReason] = useState('')
  const deviceId = useId()
  const [error, setError] = useState<unknown>(null)
  const [done, setDone] = useState<string | null>(null)
  const load = useCallback(
    () =>
      api.founderVideoStatus().then(
        (x) => {
          setS(x)
          if (x?.capBytes) setCap(String(Math.round(x.capBytes / 1073741824)))
        },
        (e) => (setError(e), setS(null)),
      ),
    [api],
  )
  useEffect(() => {
    void load()
  }, [load])
  if (s === undefined) return <Spinner label="Loading video readiness…" />
  if (!s) return error ? <Message tone="error">{messageFor(error)}</Message> : null
  async function record(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    try {
      await api.founderRecordDeviceTest(device, passed === 'yes', notes)
      setNotes('')
      setDone('Device test recorded.')
      await load()
      window.dispatchEvent(new Event(VIDEO_READINESS_EVENT))
    } catch (err) {
      setError(err)
    }
  }
  async function saveCap(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    const gb = Number(cap)
    if (!Number.isInteger(gb) || gb < 1 || gb > 1000) {
      setError(new AppApiError('invalid_request'))
      return
    }
    try {
      await api.founderSetVideoCap(gb)
      setDone('Video storage cap saved.')
      await load()
      window.dispatchEvent(new Event(VIDEO_READINESS_EVENT))
    } catch (err) {
      setError(err)
    }
  }
  async function stop(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setDone(null)
    try {
      await api.founderVideoEmergencyStop(reason)
      setReason('')
      setDone('All video is stopped: no new uploads and no playback.')
      await load()
      window.dispatchEvent(new Event(VIDEO_READINESS_EVENT))
    } catch (err) {
      setError(err)
    }
  }
  const capText = s.capBytes === null ? 'not set' : `${formatMb(s.usedBytes)} of ${Math.round(s.capBytes / 1073741824)} GB`
  const share = s.capBytes ? s.usedBytes / s.capBytes : 0
  return (
    <div data-testid="video-readiness-panel">
      <Card className="space-y-3 p-5">
        <h2 className="font-display text-lg font-extrabold text-ink-900">Video posts</h2>
        <p className="text-[14px] text-ink-700">
          Video posts can be switched on once the storage cap is set. Device tests are optional and kept for diagnosing problems members report. The test page is{' '}
          <Link to="/app/video-test" className="font-semibold text-brand-700 underline">
            Video device test
          </Link>
          .
        </p>
        <dl className="grid grid-cols-1 gap-2 text-sm min-[400px]:grid-cols-2">
          {DEVICES.map((d) => {
            const r = s.latest[d.value]
            return (
              <div key={d.value}>
                <dt className="text-ink-500">{d.label}</dt>
                <dd className="font-semibold text-ink-900">{r ? (r.passed ? 'Passed' : 'Did not pass') : 'Not tested yet'}</dd>
              </div>
            )
          })}
          <div>
            <dt className="text-ink-500">Video storage</dt>
            <dd className="font-semibold text-ink-900">{capText}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Ready to switch on</dt>
            <dd className="font-semibold text-ink-900">{s.ready ? 'Yes' : 'Not yet'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">New video uploads</dt>
            <dd className="font-semibold text-ink-900">
              {s.enabled ? 'On' : 'Off'} ({s.videoPosts} live)
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Video playback</dt>
            <dd className="font-semibold text-ink-900">{s.playbackEnabled ? 'On' : 'Off'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Delivered, last 7 days (estimate)</dt>
            <dd className="font-semibold text-ink-900">
              {formatMb(s.delivery7d.videoBytes)} across {s.delivery7d.links} video {s.delivery7d.links === 1 ? 'link' : 'links'} issued
            </dd>
          </div>
          <div>
            <dt className="text-ink-500">Delivered, last 30 days (estimate)</dt>
            <dd className="font-semibold text-ink-900">
              {formatMb(s.delivery30d.videoBytes)} across {s.delivery30d.links} video {s.delivery30d.links === 1 ? 'link' : 'links'} issued
            </dd>
          </div>
        </dl>
        <p className="text-[13px] text-ink-600">
          Delivery is an upper estimate, not a play count: a link is issued when a video post is shown (and again after a refresh or a retry), and each counts the whole video, whether or not it is played. Exact bandwidth is on the Supabase project's Usage page. Turn uploads and playback on or
          off separately under Operational switches.
        </p>
        {share >= 0.8 ? (
          <Message tone="error">Video storage is over 80% of the cap. Consider pausing new video uploads.</Message>
        ) : share >= 0.5 ? (
          <Message tone="info">Video storage is over half of the cap.</Message>
        ) : null}
        <form onSubmit={record} className="space-y-3 rounded-2xl bg-paper p-4" aria-labelledby="device-test-title">
          <h3 id="device-test-title" className="font-semibold text-ink-900">
            Record a device test
          </h3>
          <div>
            <label htmlFor={deviceId} className="block text-sm font-semibold text-ink-800">
              Device
            </label>
            <select id={deviceId} value={device} onChange={(e) => setDevice(e.target.value as DeviceKind)} className={field}>
              {DEVICES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend className="text-sm font-semibold text-ink-800">Result</legend>
            <div className="mt-1 flex flex-wrap gap-4">
              {(['yes', 'no'] as const).map((v) => (
                <label key={v} className="inline-flex min-h-11 items-center gap-2 text-[15px] text-ink-900">
                  <input type="radio" name="device-test-result" value={v} checked={passed === v} onChange={() => setPassed(v)} className="h-5 w-5" />
                  {v === 'yes' ? 'Passed' : 'Did not pass'}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-semibold text-ink-800">
            Notes (paste the results from the test page)
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={2000}
              rows={4}
              className="mt-1 block w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-base text-ink-900"
            />
          </label>
          <button type="submit" className={buttonClass('primary', 'md') + ' min-h-11'}>
            Record result
          </button>
        </form>
        <form onSubmit={saveCap} className="flex flex-wrap items-end gap-3 rounded-2xl bg-paper p-4">
          <label className="block min-w-0 flex-1 text-sm font-semibold text-ink-800">
            Video storage cap (GB)
            <input inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} className={field} />
          </label>
          <button type="submit" className={buttonClass('secondary', 'md') + ' min-h-11'}>
            Save cap
          </button>
        </form>
        <form onSubmit={stop} className="space-y-2 rounded-2xl border border-[#f0c8c2] bg-[#fdf3f1] p-4" aria-labelledby="video-emergency-title">
          <h3 id="video-emergency-title" className="font-semibold text-ink-900">
            Emergency stop
          </h3>
          <p className="text-[14px] text-ink-700">Turns off new uploads and playback together, at once, for everyone. Turn each back on under Operational switches.</p>
          <label className="block text-sm font-semibold text-ink-800">
            Reason (recorded)
            <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={280} className={field} />
          </label>
          <button type="submit" className={buttonClass('danger', 'md') + ' min-h-11'} disabled={!s.enabled && !s.playbackEnabled}>
            Stop all video now
          </button>
        </form>
        {done && <Message tone="success">{done}</Message>}
        {error !== null && <Message tone="error">{messageFor(error)}</Message>}
        {s.recent.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-brand-700">Recorded tests</summary>
            <ul className="mt-2 space-y-1 text-[13px] text-ink-700">
              {s.recent.map((r, i) => (
                <li key={i} className="break-words">
                  {new Date(r.at).toLocaleString()}: {DEVICES.find((d) => d.value === r.device)?.label ?? r.device}, {r.passed ? 'passed' : 'did not pass'}
                  {r.notes ? `. ${r.notes.split('\n')[0].slice(0, 160)}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}
      </Card>
    </div>
  )
}

/** Moderators: the reported video, while the report keeps it. */
export function ReportVideo({ reportId }: { reportId: string }) {
  const api = useAppApi()
  const [v, setV] = useState<VideoLinks | null | undefined>(undefined)
  useEffect(() => {
    let live = true
    api.modReportVideo(reportId).then(
      (x) => live && setV(x),
      () => live && setV(null),
    )
    return () => {
      live = false
    }
  }, [api, reportId])
  if (!v) return null
  return (
    <figure className="mt-2 space-y-1" data-no-swipe>
      <video
        src={v.src}
        poster={v.poster ?? undefined}
        controls
        playsInline
        preload="none"
        aria-label="The reported video"
        className="max-h-96 w-full rounded-xl bg-ink-900"
      />
      <figcaption className="text-[13px] text-ink-500">The reported video. Kept as evidence while this report is kept.</figcaption>
    </figure>
  )
}
