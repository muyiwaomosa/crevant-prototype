// Photographs on the homepage: licensed stock photos from Pexels, chosen to
// show the emotional reality of creators (and, smaller, of the fans who help
// them grow) in real homes and workplaces, not corporate offices. They show
// models, never Splitpost members, and are never presented as users,
// testimonials or endorsements: the footer says so on every page
// (PRODUCT_IMAGES_DISCLOSURE). Alt text describes what the person is doing,
// not who they are.
//
// Each file is cropped for its slot from the Pexels original, resized,
// converted to WebP and stripped of metadata. The Pexels License allows free
// commercial use without attribution; we keep the source and credit anyway.
//
// STATUS: the founder's proposed shortlist (2026-11-18). These are the first
// choices for review; alternatives are listed in the PR. Credits marked "to be
// verified" must be confirmed on each Pexels listing before the site goes live.

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

const TO_VERIFY = 'Credit to be verified on the Pexels listing'

const pexels = (p: Omit<StockPhoto, 'source' | 'licence' | 'licenceUrl'>): StockPhoto => ({
  ...p,
  source: 'Pexels',
  licence: 'Pexels License',
  licenceUrl: 'https://www.pexels.com/license/',
})

export const PHOTOS = {
  creatorLateNight: pexels({
    id: 'creator-late-night',
    base: '/media/landing/photos/creator-late-night',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A creator working alone at a desk late at night, lit only by a computer screen.',
    sourceUrl: 'https://www.pexels.com/photo/pensive-man-watching-images-on-computer-screen-in-dark-room-4327409/',
    photographer: 'Josue Monteiro',
  }),
  unpredictableIncome: pexels({
    id: 'unpredictable-income',
    base: '/media/landing/photos/unpredictable-income',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A woman on her sofa checking her phone against a printed statement, looking concerned.',
    sourceUrl: 'https://www.pexels.com/photo/woman-holding-documents-and-smartphone-6964331/',
    photographer: TO_VERIFY,
  }),
  secondJob: pexels({
    id: 'second-job',
    base: '/media/landing/photos/second-job',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A woman in a work apron taking a phone call between tasks at a café.',
    sourceUrl: 'https://www.pexels.com/photo/attentive-black-waitress-talking-on-smartphone-and-looking-at-papers-4353623/',
    photographer: TO_VERIFY,
  }),
  planningBills: pexels({
    id: 'planning-bills',
    base: '/media/landing/photos/planning-bills',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A woman at her kitchen table with bills and a calculator, her hand on her head.',
    sourceUrl: 'https://www.pexels.com/photo/woman-in-brown-button-up-shirt-beside-brown-wooden-table-6964334/',
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
  futureToday: pexels({
    id: 'future-today',
    base: '/media/landing/photos/future-today',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A tired woman resting her head on the table beside her laptop late at night.',
    sourceUrl: 'https://www.pexels.com/photo/a-woman-lying-her-head-n-the-table-while-holding-a-laptop-7983358/',
    photographer: TO_VERIFY,
  }),
  futureToward: pexels({
    id: 'future-toward',
    base: '/media/landing/photos/future-toward',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A woman filming a cooking video in a bright kitchen, her phone on a stand recording her.',
    sourceUrl: 'https://www.pexels.com/photo/woman-filming-herself-while-preparing-food-8357265/',
    photographer: TO_VERIFY,
  }),
} as const

export type PhotoKey = keyof typeof PHOTOS

/** Which photo goes with each creator pain point in THE PEOPLE BEHIND THE POSTS, in order. */
export const PAIN_PHOTOS: readonly PhotoKey[] = ['unpredictableIncome', 'secondJob', 'planningBills']

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
