// Photographs on the homepage: licensed stock photos from Pexels, chosen as a
// set so that, together, they show different kinds of creative work, working
// environments, visible ages and genders. They show models, never Splitpost
// members, and are never presented as users, testimonials or endorsements:
// the page says so (HOMEPAGE_COPY.peopleNote and the footer). Alt text
// describes what the person is doing, not who they are.
//
// Each file is cropped for its slot from the Pexels original, resized,
// converted to WebP and stripped of metadata. The Pexels License allows free
// commercial use without attribution; we keep the source and credit anyway.

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
  /** The photographer as credited on the Pexels page (verified by the founder on each listing). */
  photographer: string
  licence: 'Pexels License'
  licenceUrl: 'https://www.pexels.com/license/'
}

const pexels = (p: Omit<StockPhoto, 'source' | 'licence' | 'licenceUrl'>): StockPhoto => ({
  ...p,
  source: 'Pexels',
  licence: 'Pexels License',
  licenceUrl: 'https://www.pexels.com/license/',
})

export const PHOTOS = {
  creatorEditing: pexels({
    id: 'creator-editing',
    base: '/media/landing/photos/creator-editing',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A creator editing photos on a laptop at a bright desk at home, a camera on the table beside it.',
    sourceUrl: 'https://www.pexels.com/photo/focused-female-freelancer-editing-photos-on-laptop-7014401/',
    photographer: 'George Milton',
  }),
  teacherRecording: pexels({
    id: 'teacher-recording',
    base: '/media/landing/photos/teacher-recording',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A teacher recording a lesson to a camera on a tripod, notebook in hand.',
    sourceUrl: 'https://www.pexels.com/photo/teacher-recording-herself-teaching-9040544/',
    photographer: 'Alena Darmel',
  }),
  metalworker: pexels({
    id: 'metalworker',
    base: '/media/landing/photos/metalworker',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A metalworker grinding a piece of steel in a crowded workshop, sparks flying.',
    sourceUrl: 'https://www.pexels.com/photo/man-sitting-and-working-at-workshop-23638660/',
    photographer: 'Yunus Tuğ',
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

/** Which photo goes with each creator group in WHO WE'RE BUILDING FOR, in order. */
export const CREATOR_GROUP_PHOTOS: readonly PhotoKey[] = ['creatorEditing', 'teacherRecording', 'metalworker']

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
  /** To be confirmed by the founder on the Pexels listing, as with the four photos above. */
  photographer: 'Credit to be verified on the Pexels listing',
  licence: 'Pexels License',
  licenceUrl: 'https://www.pexels.com/license/',
} as const
