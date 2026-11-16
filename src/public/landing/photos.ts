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
  /** The photographer as credited on the Pexels page. */
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

/** Credit still to be copied from the Pexels page (its pages refuse automated reads). */
export const CREDIT_PENDING = 'Credit pending: see source page'

export const PHOTOS = {
  creatorEditing: pexels({
    id: 'creator-editing',
    base: '/media/landing/photos/creator-editing',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A creator editing photos on a laptop at a bright desk at home, a camera on the table beside it.',
    sourceUrl: 'https://www.pexels.com/photo/focused-female-freelancer-editing-photos-on-laptop-7014401/',
    photographer: CREDIT_PENDING,
  }),
  teacherRecording: pexels({
    id: 'teacher-recording',
    base: '/media/landing/photos/teacher-recording',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A teacher recording a lesson to a camera on a tripod, notebook in hand.',
    sourceUrl: 'https://www.pexels.com/photo/teacher-recording-herself-teaching-9040544/',
    photographer: CREDIT_PENDING,
  }),
  metalworker: pexels({
    id: 'metalworker',
    base: '/media/landing/photos/metalworker',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A metalworker grinding a piece of steel in a crowded workshop, sparks flying.',
    sourceUrl: 'https://www.pexels.com/photo/man-sitting-and-working-at-workshop-23638660/',
    photographer: CREDIT_PENDING,
  }),
  filmmaker: pexels({
    id: 'filmmaker',
    base: '/media/landing/photos/filmmaker',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A filmmaker framing a shot with a cinema camera on a tripod, outdoors.',
    sourceUrl: 'https://www.pexels.com/photo/young-filmmaker-operating-a-professional-camera-36181988/',
    photographer: CREDIT_PENDING,
  }),
} as const

export type PhotoKey = keyof typeof PHOTOS

/** Which photo goes with each creator group in WHO WE'RE BUILDING FOR, in order. */
export const CREATOR_GROUP_PHOTOS: readonly PhotoKey[] = ['creatorEditing', 'teacherRecording', 'metalworker']
