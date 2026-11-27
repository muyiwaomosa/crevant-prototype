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

const UNSPLASH_CHECK_BRAND3 =
  'Listing read Nov 27 (SP-BRAND-003): photographer as credited, "Free to use under the Unsplash License" (not Unsplash+), no "Sponsored by" line. Downloaded from the listing\'s images.unsplash.com file; checked for logos and text at the size shown.'

/** A small round portrait in the hero picture: a stock model, decorative, never presented as a member. */
export interface HeroPortrait {
  id: string
  src: string
  size: 160
  source: 'Unsplash'
  sourceUrl: string
  photographer: string
  photographerUrl: string
  verified: boolean
  verification: string
  licence: 'Unsplash License'
  licenceUrl: 'https://unsplash.com/license'
}
const portrait = (id: string, file: string, sourceUrl: string, photographer: string, photographerUrl: string): HeroPortrait => ({
  id,
  src: `/media/landing/photos/${file}-160.webp`,
  size: 160,
  source: 'Unsplash',
  sourceUrl,
  photographer,
  photographerUrl,
  verified: true,
  verification: UNSPLASH_CHECK_BRAND3,
  ...LICENCES.Unsplash,
})

/**
 * The hero picture (SP-BRAND-003): one sample post by a fictional creator,
 * David Mitchell, labelled SAMPLE, and the community below it. Every picture
 * is a stock photo of a model who is not a Splitpost member and does not
 * endorse Splitpost. The post photo and its profile picture are crops of the
 * same listing; none of these photos is used anywhere else on the page (the
 * WHY section keeps its own).
 */
export const HERO_POST = {
  creator: {
    name: 'David Mitchell',
    role: 'Personal Development',
    avatar: portrait('hero-creator', 'hero-creator', 'https://unsplash.com/photos/Yf_kyVn-k8s', 'Cody Board', 'https://unsplash.com/@codypboard'),
  },
  media: {
    id: 'hero-podcast',
    base: '/media/landing/photos/hero-podcast',
    widths: [640, 960] as const,
    width: 960,
    height: 600,
    source: 'Unsplash' as const,
    sourceUrl: 'https://unsplash.com/photos/Yf_kyVn-k8s',
    photographer: 'Cody Board',
    photographerUrl: 'https://unsplash.com/@codypboard',
    verified: true,
    verification: UNSPLASH_CHECK_BRAND3,
    ...LICENCES.Unsplash,
  },
  title: '3 habits that changed my life.',
  community: [
    portrait('community-1', 'community-1', 'https://unsplash.com/photos/woman-in-white-crew-neck-shirt-smiling-IF9TK5Uy-KI', 'Jake Nackos', 'https://unsplash.com/@jakenackos'),
    portrait('community-2', 'community-2', 'https://unsplash.com/photos/man-in-black-dress-shirt-wearing-black-framed-eyeglasses-_ObjhzjnMmc', 'Olawale Munna', 'https://unsplash.com/@shattathecreator'),
    portrait('community-3', 'community-3', 'https://unsplash.com/photos/smiling-woman-with-long-dark-hair-against-colorful-wall-ZoSb5J3jU28', 'Vitaly Gariev', 'https://unsplash.com/@silverkblack'),
    portrait('community-4', 'community-4', 'https://unsplash.com/photos/elderly-man-with-glasses-smiling-at-the-camera-oZ3zejPLEg8', 'Vitaly Gariev', 'https://unsplash.com/@silverkblack'),
  ],
} as const

/** Every hero picture, for the register checks. */
export const HERO_PICTURES = [HERO_POST.creator.avatar, HERO_POST.media, ...HERO_POST.community] as const

/**
 * Photos that appear inside the HOW screenshots (SP-BRAND-003). The screens
 * were captured through the actual app on a local, isolated test database with
 * a fictional demo community (never pilot data). Every profile picture and post
 * photo in them is one of these verified Unsplash photos; the HERO_POST photos
 * also appear (David Mitchell's post and picture). Names are fictional.
 */
export const DEMO_SCREEN_PHOTOS = [
  ['Grace Adeyemi (profile)', 'https://unsplash.com/photos/a-smiling-woman-poses-in-front-of-a-wall-xSEFkIAopxA', 'Brooke Balentine'],
  ['Samuel Okafor (profile)', 'https://unsplash.com/photos/man-in-maroon-suit-with-black-lapels-smiling-g9Et-rzQBkA', 'Jadon Johnson'],
  ['Helen Brooks (profile)', 'https://unsplash.com/photos/woman-in-white-long-sleeve-shirt-smiling-RBtFAZXlJDA', 'Maria Lupan'],
  ['Marcus Bell (profile)', 'https://unsplash.com/photos/a-man-wearing-a-blue-suit-and-white-shirt-xbB9xhLOc0I', 'Samson Balogun'],
  ['Lena Park (profile)', 'https://unsplash.com/photos/a-woman-with-glasses-smiles-against-a-gray-background-s3aDHKxHZSc', 'Vitaly Gariev'],
  ['Nina Patel (profile)', 'https://unsplash.com/photos/woman-in-gray-and-yellow-pussybow-top-_5_CBVCLBsY', 'Christina @ wocintechchat.com M'],
  ['Jordan Lee (profile)', 'https://unsplash.com/photos/a-smiling-young-man-in-a-dark-blue-sweater-rifCUO-4X8k', 'Josias Garibay'],
  ['Priya Shah (profile)', 'https://unsplash.com/photos/smiling-woman-in-white-and-black-checkered-dress-shirt-MQ2xYBHImKM', 'Compagnons'],
  ['Tom Walker (profile)', 'https://unsplash.com/photos/man-wearing-white-v-neck-shirt-iFgRcqHznqg', 'Joseph Gonzalez'],
  ['Ben Carter (profile)', 'https://unsplash.com/photos/man-wearing-grey-jacket-v7Jja2ChN6s', 'Ryan Hoffman'],
  ['Grace: Bible and mug', 'https://unsplash.com/photos/green-ceramic-mug-beside-book-4eWwSxaDhe4', 'Aaron Burden'],
  ['Samuel: candle and journal', 'https://unsplash.com/photos/white-candle-on-white-ruled-paper-beside-white-ceramic-mug-6Ahp8-YMoww', 'Sixteen Miles Out'],
  ['Helen: open notebook', 'https://unsplash.com/photos/open-notebook-with-pen-and-pencils-on-desk-n9AaeihA9HI', 'Clay Banks'],
  ['Marcus: laptop and notebook', 'https://unsplash.com/photos/laptop-phone-and-notebook-on-a-wooden-desk-Qw_WS6EFY00', 'Jakub Żerdzicki'],
  ['Lena: shop stock check', 'https://unsplash.com/photos/woman-reviews-inventory-in-a-clothing-store-Pvaaeer8kws', 'Vitaly Gariev'],
].map(([use, sourceUrl, photographer]) => ({ use, sourceUrl, photographer, verified: true, verification: UNSPLASH_CHECK_BRAND3, ...LICENCES.Unsplash }))
