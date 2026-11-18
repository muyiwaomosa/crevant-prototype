// Photographs on the homepage. Every one is PENDING the founder's approval
// (photo-approvals.json): a Vercel Production build fails while any photo is
// pending (scripts/check-photo-approvals.mjs), so these can be reviewed on a
// Preview but never reach production unapproved.
//
// The founder's direction (2026-11-18): licensed, model-released commercial
// photography where possible; no identifiable person shown experiencing the
// financial difficulties the copy describes; diverse creators across
// ethnicity, gender, age and kinds of creating; joyful, realistic creating in
// the future section. These stand-ins are Pexels photos (free licence, no
// model release); the paid, model-released shortlist is in the PR for the
// founder to choose from. They show models, never Splitpost members, and the
// footer says so on every page (PRODUCT_IMAGES_DISCLOSURE).
//
// Each file is cropped for its slot from the original, resized, converted to
// WebP and stripped of metadata.

import approvals from './photo-approvals.json'

export interface StockPhoto {
  id: string
  /** Base path; files are `${base}-${width}.webp` for each width in `widths`. */
  base: string
  widths: readonly number[]
  /** Aspect ratio of every size, width / height. */
  ratio: '4/3' | '4/5'
  alt: string
  source: 'Pexels'
  sourceUrl: string
  /** The photographer as credited on the source page. */
  photographer: string
  licence: 'Pexels License'
  licenceUrl: 'https://www.pexels.com/license/'
  /** Pexels gives no model release. */
  modelRelease: 'none (Pexels)'
}

const TO_VERIFY = 'Credit to be verified on the Pexels listing'

const pexels = (p: Omit<StockPhoto, 'source' | 'licence' | 'licenceUrl' | 'modelRelease'>): StockPhoto => ({
  ...p,
  source: 'Pexels',
  licence: 'Pexels License',
  licenceUrl: 'https://www.pexels.com/license/',
  modelRelease: 'none (Pexels)',
})

export const PHOTOS = {
  creatorAtNight: pexels({
    id: 'creator-at-night',
    base: '/media/landing/photos/creator-at-night',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A creator, seen from behind, editing video on two screens late at night.',
    sourceUrl: 'https://www.pexels.com/photo/video-editor-working-in-dark-17147713/',
    photographer: TO_VERIFY,
  }),
  anotherJob: pexels({
    id: 'another-job',
    base: '/media/landing/photos/another-job',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A café worker in an apron at the counter, taking an order on a tablet.',
    sourceUrl: 'https://www.pexels.com/photo/crop-cafe-coworkers-using-app-on-smartphone-at-work-6205512/',
    photographer: TO_VERIFY,
  }),
  fansSharing: pexels({
    id: 'fans-sharing',
    base: '/media/landing/photos/fans-sharing',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'Three friends laughing together outdoors as they share something on their phones.',
    sourceUrl: 'https://www.pexels.com/photo/laughing-diverse-friends-with-smartphones-in-park-6146961/',
    photographer: TO_VERIFY,
  }),
  cookingVlog: pexels({
    id: 'cooking-vlog',
    base: '/media/landing/photos/cooking-vlog',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A woman smiling and waving to her phone on a small tripod as she films a cooking video in her kitchen.',
    sourceUrl: 'https://www.pexels.com/photo/a-woman-waving-her-hand-at-her-smartphone-while-recording-a-video-7669738/',
    photographer: TO_VERIFY,
  }),
  painter: pexels({
    id: 'painter',
    base: '/media/landing/photos/painter',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A painter in her studio with a palette of watercolours, smiling beside her canvas.',
    sourceUrl: 'https://www.pexels.com/photo/a-woman-sitting-in-an-art-studio-22690822/',
    photographer: TO_VERIFY,
  }),
  craftsman: pexels({
    id: 'craftsman',
    base: '/media/landing/photos/craftsman',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A craftsman laughing in his workshop among his tools and machines.',
    sourceUrl: 'https://www.pexels.com/photo/happy-elderly-worker-smiling-in-workshop-3846033/',
    photographer: TO_VERIFY,
  }),
  filmmaker: pexels({
    id: 'filmmaker',
    base: '/media/landing/photos/filmmaker',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A filmmaker framing a shot with a cinema camera on a tripod, outdoors.',
    sourceUrl: 'https://www.pexels.com/photo/young-filmmaker-operating-a-professional-camera-36181988/',
    photographer: 'Director Chenchi',
  }),
} as const

export type PhotoKey = keyof typeof PHOTOS

/** The four creators in A BETTER FUTURE FOR CREATORS, in mosaic order. */
export const FUTURE_MOSAIC: readonly PhotoKey[] = ['cookingVlog', 'filmmaker', 'painter', 'craftsman']

/** Every photo's approval status, from photo-approvals.json (the founder changes it, nobody else). */
export const PHOTO_APPROVALS: Readonly<Record<string, 'pending' | 'approved'>> = approvals.photos as Record<string, 'pending' | 'approved'>

/**
 * The profile photo on the hero's sample post. Priya Raman is a fictional
 * sample creator: this is a stock photo of a model, who is not Priya, not a
 * Splitpost member and does not endorse Splitpost. Shown small and circular,
 * decorative (the post is labelled SAMPLE and the figure caption says so).
 */
export const SAMPLE_AVATAR = {
  id: 'priya-avatar',
  src: '/media/landing/photos/priya-avatar-160.webp',
  size: 160,
  source: 'Pexels',
  sourceUrl: 'https://www.pexels.com/photo/1239291/',
  photographer: TO_VERIFY,
  licence: 'Pexels License',
  licenceUrl: 'https://www.pexels.com/license/',
} as const
