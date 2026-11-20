import clsx from 'clsx'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Camera, ImageOff, Minus, Plus } from 'lucide-react'
import { Avatar, Modal, buttonClass } from '../components/ui'
import { Message, Spinner } from '../public/auth/AuthUi'
import { AppApiError, hueFor, messageFor, type StoragePlan } from './api'
import { useAppApi, useMyProfile } from './AppApiContext'

/**
 * Profile pictures (Build 5.2b).
 *
 * The browser only crops and resizes: it sends a 512 x 512 JPEG to the
 * avatar Edge Function, which checks the member with the database, fully
 * decodes and re-encodes the image, and stores it privately. Pictures are
 * shown through signed links (valid for an hour) fetched in batches; anyone
 * without a picture, or whose picture can't be shown, gets their initials.
 */

// ---------------------------------------------------------------------------
// Links, fetched in batches and cached (just under an hour; "no picture" for five minutes).

type Entry = { url: string | null; until: number }
type AvatarStore = { get(id: string): string | null | undefined; request(id: string): void; refresh(id: string): void; version: number }
const AvatarContext = createContext<AvatarStore | null>(null)
const LINK_MS = 50 * 60_000
const NONE_MS = 5 * 60_000

export function AvatarProvider({ children }: { children: ReactNode }) {
  const api = useAppApi()
  const cache = useRef(new Map<string, Entry>())
  const queue = useRef(new Set<string>())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [version, setVersion] = useState(0)

  const flush = useCallback(async () => {
    timer.current = null
    const ids = [...queue.current]
    queue.current.clear()
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100)
      let links: Record<string, { url: string }> = {}
      try {
        links = await api.avatarLinks(chunk)
      } catch {
        links = {}
      }
      const now = Date.now()
      for (const id of chunk) cache.current.set(id, links[id] ? { url: links[id].url, until: now + LINK_MS } : { url: null, until: now + NONE_MS })
    }
    setVersion((v) => v + 1)
  }, [api])

  const request = useCallback(
    (id: string) => {
      const hit = cache.current.get(id)
      if (hit && hit.until > Date.now()) return
      // Mark as on its way, keeping any link we already have.
      cache.current.set(id, { url: hit?.url ?? null, until: Date.now() + 30_000 })
      queue.current.add(id)
      if (!timer.current) timer.current = setTimeout(() => void flush(), 25)
    },
    [flush],
  )
  const refresh = useCallback(
    (id: string) => {
      cache.current.delete(id)
      request(id)
    },
    [request],
  )
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])
  const store: AvatarStore = { get: (id) => cache.current.get(id)?.url, request, refresh, version }
  return <AvatarContext.Provider value={store}>{children}</AvatarContext.Provider>
}

/** The member's picture link, or null/undefined for initials. */
export function useAvatarUrl(id: string): string | null | undefined {
  const store = useContext(AvatarContext)
  useEffect(() => {
    store?.request(id)
  }, [store, id])
  return store?.get(id)
}

export function useRefreshAvatar(): (id: string) => void {
  const store = useContext(AvatarContext)
  return useCallback((id: string) => store?.refresh(id), [store])
}

export function PictureAvatar({ id, name, size = 40, className }: { id: string; name: string; size?: number; className?: string }) {
  const url = useAvatarUrl(id)
  return <Avatar name={name} hue={hueFor(id)} src={url ?? undefined} size={size} className={className} />
}

// ---------------------------------------------------------------------------
// Crop maths (pure, unit tested). The photo always covers the square.

export const OUTPUT = 512
export const MAX_FILE_BYTES = 15 * 1024 * 1024

/** The smallest scale at which the photo covers a square of side `view`. */
export function coverScale(width: number, height: number, view: number): number {
  return view / Math.min(width, height)
}

/** Keeps the photo covering the square: offsets are between (view - size) and 0. */
export function clampOffset(offset: number, scaledSize: number, view: number): number {
  return Math.min(0, Math.max(view - scaledSize, offset))
}

/** The part of the photo inside the square, in the photo's own pixels. */
export function sourceRect(o: { x: number; y: number; scale: number; view: number }) {
  return { sx: -o.x / o.scale, sy: -o.y / o.scale, size: o.view / o.scale }
}

// ---------------------------------------------------------------------------
// The editor: choose (camera or gallery), drag, zoom, save; or remove.

const VIEW = 240

function readPhoto(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new AppApiError('not_decodable'))
    }
    img.src = url
  })
}

function render(img: HTMLImageElement, x: number, y: number, scale: number): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT
  canvas.height = OUTPUT
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new AppApiError('not_decodable'))
  const { sx, sy, size } = sourceRect({ x, y, scale, view: VIEW })
  ctx.fillStyle = '#ffffff' // transparent photos get white, not black
  ctx.fillRect(0, 0, OUTPUT, OUTPUT)
  ctx.drawImage(img, sx, sy, size, size, 0, 0, OUTPUT, OUTPUT)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b && b.type === 'image/jpeg' ? resolve(b) : reject(new AppApiError('not_decodable'))), 'image/jpeg', 0.9),
  )
}

export function AvatarEditor({ open, onClose, hasPicture }: { open: boolean; onClose: (message?: string) => void; hasPicture: boolean }) {
  const api = useAppApi()
  const { profile } = useMyProfile()
  const refresh = useRefreshAvatar()
  const inputId = useId()
  const helpId = useId()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState<'reading' | 'saving' | 'removing' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!open) {
      if (img) URL.revokeObjectURL(img.src)
      setImg(null)
      setProblem(null)
      setConfirmRemove(false)
      setBusy(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const base = img ? coverScale(img.naturalWidth, img.naturalHeight, VIEW) : 1
  const scale = base * zoom
  const w = img ? img.naturalWidth * scale : VIEW
  const h = img ? img.naturalHeight * scale : VIEW
  const place = (x: number, y: number, s = scale) =>
    img ? setPos({ x: clampOffset(x, img.naturalWidth * s, VIEW), y: clampOffset(y, img.naturalHeight * s, VIEW) }) : undefined

  function setZoomKeepingCentre(next: number) {
    if (!img) return
    const z = Math.min(4, Math.max(1, next))
    const s = base * z
    // Keep the point at the centre of the square where it is.
    const cx = (VIEW / 2 - pos.x) / scale
    const cy = (VIEW / 2 - pos.y) / scale
    setZoom(z)
    place(VIEW / 2 - cx * s, VIEW / 2 - cy * s, s)
  }

  async function choose(file: File | undefined) {
    setProblem(null)
    if (!file) return
    if (!file.type.startsWith('image/') && !/\.(heic|heif)$/i.test(file.name)) {
      setProblem(messageFor(new AppApiError('photo_type')))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setProblem(messageFor(new AppApiError('photo_too_large')))
      return
    }
    setBusy('reading')
    try {
      const next = await readPhoto(file)
      if (img) URL.revokeObjectURL(img.src)
      const s = coverScale(next.naturalWidth, next.naturalHeight, VIEW)
      setImg(next)
      setZoom(1)
      setPos({ x: (VIEW - next.naturalWidth * s) / 2, y: (VIEW - next.naturalHeight * s) / 2 })
    } catch (e) {
      setProblem(messageFor(e))
    } finally {
      setBusy(null)
    }
  }

  async function save() {
    if (!img || busy) return
    setBusy('saving')
    setProblem(null)
    try {
      const jpeg = await render(img, pos.x, pos.y, scale)
      await api.uploadAvatar(jpeg)
      refresh(profile.id)
      onClose('Profile picture saved.')
    } catch (e) {
      setProblem(messageFor(e))
      setBusy(null)
    }
  }

  async function remove() {
    if (busy) return
    setBusy('removing')
    setProblem(null)
    try {
      await api.removeAvatar()
      refresh(profile.id)
      onClose('Profile picture removed. Your initials show instead.')
    } catch (e) {
      setProblem(messageFor(e))
      setBusy(null)
    }
  }

  function onKey(e: KeyboardEvent) {
    const step = e.shiftKey ? 30 : 10
    if (e.key === 'ArrowLeft') place(pos.x + step, pos.y)
    else if (e.key === 'ArrowRight') place(pos.x - step, pos.y)
    else if (e.key === 'ArrowUp') place(pos.x, pos.y + step)
    else if (e.key === 'ArrowDown') place(pos.x, pos.y - step)
    else if (e.key === '+' || e.key === '=') setZoomKeepingCentre(zoom + 0.2)
    else if (e.key === '-') setZoomKeepingCentre(zoom - 0.2)
    else return
    e.preventDefault()
  }

  return (
    <Modal open={open} onClose={() => onClose()} title="Profile picture">
      <div className="space-y-4" data-testid="avatar-editor">
        {img ? (
          <>
            <div className="flex justify-center">
              <div
                role="application"
                aria-roledescription="photo cropper"
                aria-label="Your photo. Drag, or use the arrow keys, to reposition it. Plus and minus zoom."
                aria-describedby={helpId}
                tabIndex={0}
                onKeyDown={onKey}
                onPointerDown={(e: PointerEvent) => {
                  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
                  drag.current = { px: e.clientX, py: e.clientY, x: pos.x, y: pos.y }
                }}
                onPointerMove={(e: PointerEvent) => {
                  if (drag.current) place(drag.current.x + e.clientX - drag.current.px, drag.current.y + e.clientY - drag.current.py)
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                className="relative cursor-grab touch-none overflow-hidden rounded-full bg-ink-100 outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-brand-500 active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
                data-testid="avatar-cropper"
              >
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{ left: pos.x, top: pos.y, width: w, height: h }}
                />
              </div>
            </div>
            <p id={helpId} className="text-center text-sm text-ink-600">
              Drag to reposition. Zoom with the slider.
            </p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setZoomKeepingCentre(zoom - 0.2)} className={buttonClass('ghost', 'sm')} aria-label="Zoom out">
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <label className="flex flex-1 items-center gap-2 text-sm font-semibold text-ink-800">
                <span className="sr-only">Zoom</span>
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoomKeepingCentre(Number(e.target.value))}
                  className="w-full accent-brand-600"
                  aria-valuetext={`${Math.round(zoom * 100)}%`}
                />
              </label>
              <button type="button" onClick={() => setZoomKeepingCentre(zoom + 0.2)} className={buttonClass('ghost', 'sm')} aria-label="Zoom in">
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center">
            <PictureAvatar id={profile.id} name={profile.displayName} size={112} />
            <p className="text-sm text-ink-600">
              {hasPicture ? 'Your current picture.' : 'No picture yet. Your initials are shown.'} Choose a photo from your camera or gallery.
            </p>
          </div>
        )}

        <div aria-live="polite">
          {busy === 'reading' && <Spinner label="Opening your photo…" />}
          {busy === 'saving' && <Spinner label="Saving your picture…" />}
          {busy === 'removing' && <Spinner label="Removing your picture…" />}
        </div>
        {problem && <Message tone="error">{problem}</Message>}

        <div className="flex flex-col gap-2">
          {/* No "capture" attribute: phones offer both the camera and the gallery. */}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              void choose(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {img ? (
            <>
              <button type="button" onClick={() => void save()} disabled={busy !== null} className={`${buttonClass('primary')} w-full`}>
                {busy === 'saving' ? 'Saving…' : 'Save picture'}
              </button>
              <label htmlFor={inputId} className={`${buttonClass('secondary')} w-full cursor-pointer`}>
                <Camera className="h-4 w-4" aria-hidden="true" /> Choose a different photo
              </label>
            </>
          ) : (
            <label htmlFor={inputId} className={`${buttonClass('primary')} w-full cursor-pointer`}>
              <Camera className="h-4 w-4" aria-hidden="true" /> {hasPicture ? 'Choose a new photo' : 'Choose a photo'}
            </label>
          )}
          {!img && hasPicture && !confirmRemove && (
            <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy !== null} className={`${buttonClass('ghost')} w-full`}>
              <ImageOff className="h-4 w-4" aria-hidden="true" /> Remove picture
            </button>
          )}
          {confirmRemove && (
            <div className="rounded-2xl bg-ink-100/70 p-3 text-sm" role="group" aria-label="Remove your picture?">
              <p className="mb-2 text-ink-800">Remove your picture? Your initials will show instead.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => void remove()} disabled={busy !== null} className={buttonClass('danger', 'sm')}>
                  {busy === 'removing' ? 'Removing…' : 'Remove'}
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} disabled={busy !== null} className={buttonClass('secondary', 'sm')}>
                  Keep it
                </button>
              </div>
            </div>
          )}
          <button type="button" onClick={() => onClose()} disabled={busy === 'saving' || busy === 'removing'} className={`${buttonClass('ghost')} w-full`}>
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}

/** Your picture with a button to add, change or remove it (setup's About you step, and Profile). */
export function ProfilePictureField({ optionalNote }: { optionalNote?: boolean }) {
  const { profile } = useMyProfile()
  const url = useAvatarUrl(profile.id)
  const [open, setOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const has = Boolean(url)
  return (
    <div className="flex items-center gap-4" data-testid="profile-picture-field">
      <PictureAvatar id={profile.id} name={profile.displayName} size={72} />
      <div className="min-w-0 space-y-1.5">
        <p className="text-sm font-semibold text-ink-800">Profile picture{optionalNote ? ' (optional)' : ''}</p>
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setOpen(true)
          }}
          className={buttonClass('secondary', 'sm')}
        >
          <Camera className="h-4 w-4" aria-hidden="true" /> {has ? 'Change picture' : 'Add a photo'}
        </button>
        <div aria-live="polite">{notice && <p className="text-sm font-semibold text-brand-800">{notice}</p>}</div>
      </div>
      {open && (
        <AvatarEditor
          open
          hasPicture={has}
          onClose={(message) => {
            setOpen(false)
            if (message) setNotice(message)
          }}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Moderators: storage cleanup, as a dry run first, then an explicit confirmation.

export function StorageCleanupPanel() {
  const api = useAppApi()
  const typedId = useId()
  const [plan, setPlan] = useState<StoragePlan | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState<'checking' | 'deleting' | null>(null)
  const [problem, setProblem] = useState<unknown>(null)
  const [result, setResult] = useState<string | null>(null)

  async function check() {
    setBusy('checking')
    setProblem(null)
    setResult(null)
    setTyped('')
    try {
      setPlan(await api.modStoragePreview())
    } catch (e) {
      setProblem(e)
    } finally {
      setBusy(null)
    }
  }
  async function run() {
    if (!plan || typed !== plan.confirmPhrase) return
    setBusy('deleting')
    setProblem(null)
    try {
      const r = await api.modStorageCleanup(plan.planId, typed)
      setResult(`Deleted ${r.deleted} unused ${r.deleted === 1 ? 'file' : 'files'}${r.deleted !== plan.fileCount ? ` (${plan.fileCount - r.deleted} came back into use and were kept)` : ''}.`)
      setPlan(null)
      setTyped('')
    } catch (e) {
      setProblem(e)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section aria-labelledby={`${typedId}-title`} className="space-y-3" data-testid="storage-cleanup">
      <h2 id={`${typedId}-title`} className="font-display text-lg font-bold text-ink-900">
        Picture storage
      </h2>
      <p className="text-sm text-ink-600">
        Removes picture files no one uses (left by a failed upload or a deleted account). Current pictures, files under 24 hours old and uploads in progress are
        never included. Run monthly.
      </p>
      <button type="button" onClick={() => void check()} disabled={busy !== null} className={buttonClass('secondary', 'sm')}>
        {busy === 'checking' ? 'Checking…' : 'Check for unused files'}
      </button>
      <div aria-live="polite">
        {plan && plan.fileCount === 0 && <Message tone="success">Nothing to clean up.</Message>}
        {result && <Message tone="success">{result}</Message>}
      </div>
      {plan && plan.fileCount > 0 && (
        <div className="space-y-2 rounded-2xl bg-ink-100/60 p-4">
          <p className="text-sm text-ink-800">
            {plan.fileCount} unused {plan.fileCount === 1 ? 'file' : 'files'} ({Math.ceil(plan.totalBytes / 1024)} KB). This check is valid for 15 minutes.
          </p>
          <label htmlFor={typedId} className="block text-sm font-semibold text-ink-800">
            Type <span className="font-mono">{plan.confirmPhrase}</span> to confirm
          </label>
          <input
            id={typedId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="block h-11 w-full rounded-2xl border border-ink-200 bg-white px-4 font-mono text-base text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
          <button
            type="button"
            onClick={() => void run()}
            disabled={busy !== null || typed !== plan.confirmPhrase}
            className={clsx(buttonClass('danger', 'sm'))}
          >
            {busy === 'deleting' ? 'Deleting…' : `Delete ${plan.fileCount} ${plan.fileCount === 1 ? 'file' : 'files'}`}
          </button>
        </div>
      )}
      {problem !== null && <Message tone="error">{messageFor(problem)}</Message>}
    </section>
  )
}
