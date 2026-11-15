// Photographs used on the homepage: stock images from the Canva content
// library, exported from Splitpost's Canva account. They show models, never
// Splitpost members, and are never presented as users or testimonials. The
// page says so (HOMEPAGE_COPY.peopleNote and the footer).

export interface StockPhoto {
  id: string
  src: string
  width: number
  height: number
  alt: string
  /** Where the image came from and under what terms it's used. */
  source: 'Canva content library'
  licence: 'Canva Content License'
  /** Cut-outs have a transparent background and sit on a coloured panel. */
  cutout: boolean
}

const photo = (p: Omit<StockPhoto, 'source' | 'licence'>): StockPhoto => ({ ...p, source: 'Canva content library', licence: 'Canva Content License' })

export const PHOTOS = {
  creatorSmiling: photo({
    id: 'creator-smiling',
    src: '/media/landing/sp-creator-smiling.webp',
    width: 690,
    height: 1032,
    alt: 'A smiling creator talking to her audience, hands open.',
    cutout: true,
  }),
  studioRoom: photo({
    id: 'studio-room',
    src: '/media/landing/sp-studio-room.webp',
    width: 1086,
    height: 1086,
    alt: '',
    cutout: false,
  }),
  ringLight: photo({
    id: 'ring-light',
    src: '/media/landing/sp-ring-light-studio.webp',
    width: 439,
    height: 851,
    alt: '',
    cutout: true,
  }),
  creatorFrustrated: photo({
    id: 'creator-frustrated',
    src: '/media/landing/sp-creator-frustrated.webp',
    width: 569,
    height: 726,
    alt: 'A tired creator late at night, head in her hand.',
    cutout: true,
  }),
  deskAtNight: photo({
    id: 'desk-at-night',
    src: '/media/landing/sp-desk-night.webp',
    width: 1200,
    height: 1200,
    alt: '',
    cutout: false,
  }),
  fanOnPhone: photo({
    id: 'fan-on-phone',
    src: '/media/landing/sp-fan-phone.webp',
    width: 511,
    height: 648,
    alt: 'A fan laughing at a post on his phone.',
    cutout: true,
  }),
  fansTogether: photo({
    id: 'fans-together',
    src: '/media/landing/sp-fans-friends.webp',
    width: 451,
    height: 687,
    alt: 'Two friends laughing together at something one of them is pointing to.',
    cutout: true,
  }),
} as const

export type PhotoKey = keyof typeof PHOTOS
