// Photographs used on the homepage. For the prototype these are AI-generated
// concept images, never real people. Each one is recorded here with how it was
// made, and is always shown with its disclosure label (tests enforce both).
// A generated person is never presented as a user, a customer or a testimonial.

export const AI_PHOTO_LABEL = 'AI-generated concept image, not a real person'

export interface ConceptPhoto {
  id: string
  /** Files in public/media/landing, largest first. Width in pixels. */
  sources: readonly { src: string; width: number }[]
  width: number
  height: number
  alt: string
  /** How the image was made. Always 'ai-generated' in the prototype. */
  origin: 'ai-generated'
  generator: string
  /** The prompt, in the founder's own words. */
  prompt: string
  generated: string
  /** Edits made after generation. Cropping only: nothing blurred, painted or added. */
  edits: string
  label: typeof AI_PHOTO_LABEL
}

const PROMPT_LEAD = 'Use clean, high-resolution concept photos without embedded captions, dollar amounts, or blurred patches.'

export const PHOTOS = {
  creator: {
    id: 'creator',
    sources: [
      { src: '/media/landing/who-creator-1600.jpg', width: 1600 },
      { src: '/media/landing/who-creator-800.jpg', width: 800 },
    ],
    width: 1600,
    height: 1088,
    alt: 'A creator in headphones editing a video late at night, frowning at her screens.',
    origin: 'ai-generated',
    generator: 'Canva AI image generation',
    prompt: `${PROMPT_LEAD} The creator who keeps posting. Growing creators consistently producing content and building an audience, but struggling to make their work financially sustainable.`,
    generated: '2026-11-15',
    edits: 'Cropped to a landscape frame and resized.',
    label: AI_PHOTO_LABEL,
  },
  fan: {
    id: 'fan',
    sources: [
      { src: '/media/landing/who-fan-1600.jpg', width: 1600 },
      { src: '/media/landing/who-fan-800.jpg', width: 800 },
    ],
    width: 1600,
    height: 1088,
    alt: 'A fan at her desk sharing a musician’s post from her phone, drawn as paper planes flying out of the window toward a concert stage.',
    origin: 'ai-generated',
    generator: 'Canva AI image generation',
    prompt: `${PROMPT_LEAD} The fan who keeps sharing. Loyal fans who discover, share, comment, recommend and help creators grow without meaningful recognition.`,
    generated: '2026-11-15',
    edits: 'Cropped to a landscape frame and resized.',
    label: AI_PHOTO_LABEL,
  },
} as const satisfies Record<string, ConceptPhoto>

export type PhotoId = keyof typeof PHOTOS
