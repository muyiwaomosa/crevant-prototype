// Photographs on the homepage: licensed stock photos from Pexels and
// Unsplash, chosen as a set so that, together, they show different kinds of
// creative work, settings, visible ages and genders. They show models, never
// Splitpost members, and are never presented as users, testimonials or
// endorsements: the page says so (HOMEPAGE_COPY.peopleNote and the footer).
// Alt text describes what the person is doing, not who they are.
//
// Each file is cropped for its slot from the original, resized, converted to
// WebP and stripped of metadata. Both licences allow free commercial use
// without attribution; we keep the source and credit anyway. This file is the
// asset register (SP-BRAND-002, decision 6): nothing unverified is published.

export type PhotoSource = 'Pexels' | 'Unsplash'

const LICENCES = {
  Pexels: { licence: 'Pexels License', licenceUrl: 'https://www.pexels.com/license/' },
  Unsplash: { licence: 'Unsplash License', licenceUrl: 'https://unsplash.com/license' },
} as const

export interface StockPhoto {
  id: string
  /** Base path; files are `${base}-${width}.webp` for each width in `widths`. */
  base: string
  widths: readonly number[]
  /** Aspect ratio of every size, width / height. */
  ratio: '4/3' | '4/5'
  alt: string
  source: PhotoSource
  sourceUrl: string
  /** The photographer as credited on the listing. */
  photographer: string
  /** The photographer's profile on the source site, where the listing links one. */
  photographerUrl?: string
  /**
   * Whether the listing, credit and licence have been confirmed on the source
   * page. An unverified photo is never published (SP-BRAND-002, decision 6).
   */
  verified: boolean
  /** How and when it was verified. */
  verification: string
  licence: (typeof LICENCES)[PhotoSource]['licence']
  licenceUrl: (typeof LICENCES)[PhotoSource]['licenceUrl']
}

const stock = (source: PhotoSource, p: Omit<StockPhoto, 'source' | 'licence' | 'licenceUrl'>): StockPhoto => ({
  ...p,
  source,
  ...LICENCES[source],
})

const FOUNDER_CHECK = 'Confirmed by the founder on the Pexels listing (Nov 24).'
const UNSPLASH_CHECK =
  'Listing read Nov 27: photographer as credited, "Free to use under the Unsplash License" (not Unsplash+), no sponsor or brand. Downloaded from the listing\'s images.unsplash.com file.'

export const PHOTOS = {
  creatorEditing: stock('Pexels', {
    id: 'creator-editing',
    base: '/media/landing/photos/creator-editing',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A creator editing photos on a laptop at a bright desk at home, a camera on the table beside it.',
    sourceUrl: 'https://www.pexels.com/photo/focused-female-freelancer-editing-photos-on-laptop-7014401/',
    photographer: 'George Milton',
    verified: true,
    verification: FOUNDER_CHECK,
  }),
  teacherRecording: stock('Pexels', {
    id: 'teacher-recording',
    base: '/media/landing/photos/teacher-recording',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'A teacher recording a lesson to a camera on a tripod, notebook in hand.',
    sourceUrl: 'https://www.pexels.com/photo/teacher-recording-herself-teaching-9040544/',
    photographer: 'Alena Darmel',
    verified: true,
    verification: FOUNDER_CHECK,
  }),
  /** Replaced Nov 27: the earlier Pexels photo could not be verified. Files: supporter-phone-600.webp, supporter-phone-960.webp. */
  supporterPhone: stock('Unsplash', {
    id: 'supporter-phone',
    base: '/media/landing/photos/supporter-phone',
    widths: [600, 960],
    ratio: '4/5',
    alt: 'A person smiling at their phone, relaxing on a sofa at home.',
    sourceUrl: 'https://unsplash.com/photos/a-woman-sitting-on-a-couch-looking-at-her-cell-phone-TRkyQgyb4c0',
    photographer: 'Ninthgrid',
    photographerUrl: 'https://unsplash.com/@ninthgrid_',
    verified: true,
    verification: UNSPLASH_CHECK,
  }),
  /** Replaced Nov 27: the earlier Pexels photo could not be verified. Files: community-table-640.webp, community-table-1200.webp. */
  communityTable: stock('Unsplash', {
    id: 'community-table',
    base: '/media/landing/photos/community-table',
    widths: [640, 1200],
    ratio: '4/3',
    alt: 'Friends gathered around a long table outdoors in the evening under string lights, talking and laughing, an oud resting on the blankets.',
    sourceUrl: 'https://unsplash.com/photos/outdoor-dinner-party-with-oud-UrzN-8K1PCE',
    photographer: 'Considerate Agency',
    photographerUrl: 'https://unsplash.com/@considerateagency',
    verified: true,
    verification: UNSPLASH_CHECK,
  }),
} as const

/** Photos not yet verified on their listing: must be empty before the public site is published. */
export const PHOTOS_TO_VERIFY = Object.values(PHOTOS).filter((p) => !p.verified)

export type PhotoKey = keyof typeof PHOTOS

/** The photo for each group in WHO WE'RE BUILDING FOR, in order: creators, supporters. */
export const WHO_PHOTOS: readonly PhotoKey[] = ['teacherRecording', 'supporterPhone']

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
  /** Replaced Nov 27: the earlier Pexels avatar's credit could not be verified. */
  source: 'Unsplash',
  sourceUrl: 'https://unsplash.com/photos/a-young-woman-with-dark-wavy-hair-smiles-brightly-smiling-HVbaH3p9B8k',
  photographer: 'IMANA',
  photographerUrl: 'https://unsplash.com/@imanaindia',
  verified: true,
  verification: UNSPLASH_CHECK,
  ...LICENCES.Unsplash,
} as const
