import { useEffect, useId, useRef, useState } from 'react'
import { Camera, Loader2, Trash2 } from 'lucide-react'
import { useStore } from '../state/store'
import { AVATAR_ERROR_TEXT, AvatarProcessingError, processAvatar } from '../lib/avatar'
import { Avatar, Button, Modal } from './ui'

/**
 * Upload, preview, change, or remove the visitor's profile picture.
 * The same picture is used in fan mode and on the visitor's creator page.
 */
export function AvatarEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { state, setAvatar, pushToast } = useStore()
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const current = state.profile.avatar

  useEffect(() => {
    if (!open) {
      setPending(null)
      setError(null)
      setWorking(false)
    }
  }, [open])

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setWorking(true)
    try {
      setPending(await processAvatar(file))
    } catch (e) {
      setError(e instanceof AvatarProcessingError ? e.message : AVATAR_ERROR_TEXT.decode)
    } finally {
      setWorking(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const save = () => {
    if (!pending) return
    const res = setAvatar(pending)
    if (!res.ok) return setError(res.error)
    pushToast({ tone: 'success', title: 'Profile picture updated', body: 'It now appears on your profile, posts, comments, and rewards.' })
    onClose()
  }

  const remove = () => {
    const res = setAvatar(null)
    if (!res.ok) return setError(res.error)
    pushToast({ tone: 'info', title: 'Profile picture removed', body: 'Your initials are shown instead.' })
    onClose()
  }

  const shown = pending ?? current

  return (
    <Modal open={open} onClose={onClose} title="Profile picture">
      <div className="flex flex-col items-center text-center">
        <div className="relative">
          <Avatar name={state.profile.name} hue={168} src={shown} size={128} className="ring-4 ring-white shadow-md" />
          {working && (
            <span className="absolute inset-0 grid place-items-center rounded-full bg-white/70">
              <Loader2 className="h-8 w-8 animate-spin text-brand-600" aria-label="Processing image" />
            </span>
          )}
        </div>
        <p className="mt-3 text-sm font-semibold text-ink-800" aria-live="polite">
          {pending ? 'Preview. Save to use this picture.' : current ? 'Your current picture' : 'No picture yet. Your initials are shown.'}
        </p>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <Button variant="secondary" className="mt-4" onClick={() => inputRef.current?.click()} disabled={working}>
          <Camera className="h-4 w-4" /> {shown ? 'Choose a different photo' : 'Choose a photo'}
        </Button>

        {error && (
          <p id={errorId} role="alert" className="mt-3 rounded-xl bg-[#fdeceb] px-3 py-2 text-sm font-medium text-[#8f2a21]">
            {error}
          </p>
        )}

        <p className="mt-4 text-[12px] leading-relaxed text-ink-600">
          JPEG, PNG, WebP, or GIF up to 8 MB. It is cropped to a square and shrunk to 256 pixels. The picture is stored only in this browser: it is not
          uploaded to a server or shared across devices.
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2">
        {pending ? (
          <>
            <Button variant="secondary" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button onClick={save}>Save picture</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button variant="secondary" onClick={remove} disabled={!current} className="text-[#b2342a]">
              <Trash2 className="h-4 w-4" /> Remove
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}
