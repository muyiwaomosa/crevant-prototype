import clsx from 'clsx'
import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ImagePlus, Loader2, Palette, Send, X } from 'lucide-react'
import type { ArtworkKind, PostMedia } from '../../types'
import { useStore } from '../../state/store'
import { Artwork, ARTWORK_KINDS } from '../../components/Artwork'
import { Button, Card, CreatorAvatar, Notice, PageHeader } from '../../components/ui'
import { compressImage } from '../../lib/image'
import { SELF_ID } from '../../data/seed'

const MAX = 500

export function StudioCreate() {
  const { creatorById, publishPost, pushToast } = useStore()
  const navigate = useNavigate()
  const me = creatorById(SELF_ID)!
  const [text, setText] = useState('')
  const [media, setMedia] = useState<PostMedia | undefined>()
  const [showArt, setShowArt] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const canPublish = text.trim().length > 0 || media !== undefined

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    setLoading(true)
    try {
      const src = await compressImage(file)
      setMedia({ type: 'image', src, alt: text.trim().slice(0, 80) || 'Image shared by the creator' })
      setShowArt(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not use that image.')
    } finally {
      setLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const chooseArt = (art: ArtworkKind) => {
    setMedia({ type: 'art', art, alt: 'Illustration chosen by the creator' })
    setShowArt(false)
  }

  const publish = () => {
    const finalMedia = media?.type === 'image' && text.trim() ? { ...media, alt: text.trim().slice(0, 80) } : media
    const post = publishPost({ text, media: finalMedia })
    if (!post) return
    pushToast({
      tone: 'success',
      title: 'Published',
      body: 'Your post is now at the top of the chronological feed for your followers.',
    })
    navigate('/studio/posts')
  }

  return (
    <div>
      <PageHeader title="New post" subtitle="Share an update with everyone who follows you." />

      <Card className="p-4 sm:p-5">
        <div className="flex gap-3">
          <CreatorAvatar creator={me} size={42} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{me.name}</p>
            <label htmlFor="post-text" className="sr-only">
              Post text
            </label>
            <textarea
              id="post-text"
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              rows={5}
              placeholder="What are you working on?"
              className="mt-1 block w-full resize-none bg-transparent text-[16px] leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none"
            />
          </div>
        </div>

        {media && (
          <div className="relative mt-3 overflow-hidden rounded-2xl bg-ink-100">
            {media.type === 'image' && <img src={media.src} alt="Selected upload preview" className="max-h-[420px] w-full object-cover" />}
            {media.type === 'art' && <Artwork kind={media.art} className="aspect-[5/4] w-full" label="Selected illustration" />}
            <button
              type="button"
              onClick={() => setMedia(undefined)}
              className="absolute right-2 top-2 grid h-9 w-9 place-items-center rounded-full bg-ink-900/70 text-white hover:bg-ink-900"
              aria-label="Remove media"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}

        {showArt && (
          <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6" role="group" aria-label="Choose an illustration">
            {ARTWORK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => chooseArt(k)}
                className="overflow-hidden rounded-xl ring-1 ring-ink-100 transition hover:ring-2 hover:ring-brand-500"
                aria-label={`Use ${k} illustration`}
              >
                <Artwork kind={k} className="aspect-square w-full" />
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-sm font-medium text-[#b2342a]">{error}</p>}

        <div className="mt-4 flex items-center gap-1 border-t border-ink-100 pt-3">
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" id="post-image" onChange={(e) => onFile(e.target.files?.[0])} />
          <label
            htmlFor="post-image"
            className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
            <span className="hidden sm:inline">Upload image</span>
            <span className="sm:hidden">Photo</span>
          </label>
          <button
            type="button"
            onClick={() => setShowArt((s) => !s)}
            aria-expanded={showArt}
            className={clsx(
              'inline-flex h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold hover:bg-brand-50',
              showArt ? 'bg-brand-50 text-brand-800' : 'text-brand-700',
            )}
          >
            <Palette className="h-5 w-5" />
            <span className="hidden sm:inline">Sample artwork</span>
            <span className="sm:hidden">Art</span>
          </button>
          <span className={clsx('ml-auto mr-3 text-[12px] tabular-nums', text.length > MAX - 40 ? 'text-[#b2342a]' : 'text-ink-400')}>
            {text.length}/{MAX}
          </span>
          <Button onClick={publish} disabled={!canPublish || loading}>
            <Send className="h-4 w-4" /> Publish
          </Button>
        </div>
      </Card>

      <Notice className="mt-4">
        Uploaded images stay in this browser only and are resized to save space. Your post goes straight into followers' Home feeds in time
        order. Nobody is shown it ahead of anyone else.
      </Notice>
    </div>
  )
}
