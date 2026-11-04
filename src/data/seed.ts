// Seeded demo content. All people, posts, and rewards here are fictional.
// Timestamps are stored as "minutes before the demo was first opened" so the
// feed always looks fresh on a first visit.

import type { Comment, Creator, Post, PostMedia, Profile, Reward } from '../types'
import { minutesAgo } from '../lib/time'

export const SELF_ID = 'me'

export const DEFAULT_PROFILE: Profile = {
  name: 'Jamie Rivera',
  handle: 'jamierivera',
  bio: 'Sketchbook diaries, slow travel, and the stories behind each drawing.',
  category: 'Art',
}

export const SELF_BASE_FOLLOWERS = 1284

export const CREATORS: Creator[] = [
  {
    id: 'amara',
    name: 'Amara Okafor',
    handle: 'amaracooks',
    category: 'Food',
    bio: 'Weeknight West African cooking from a tiny London kitchen. Big flavour, short shopping lists.',
    location: 'London, UK',
    baseFollowers: 48210,
    hue: 18,
    cover: 'bowl',
  },
  {
    id: 'theo',
    name: 'Theo Lindqvist',
    handle: 'theoontrail',
    category: 'Travel',
    bio: 'Long walks in the far north. Trail notes, route files, and honest gear reviews.',
    location: 'Abisko, Sweden',
    baseFollowers: 22940,
    hue: 205,
    cover: 'ridge',
  },
  {
    id: 'priya',
    name: 'Priya Raman',
    handle: 'priyabuilds',
    category: 'Tech',
    bio: 'Indie developer building a habit tracker in public. Weekly numbers, wins, and mistakes.',
    location: 'Bengaluru, India',
    baseFollowers: 15730,
    hue: 262,
    cover: 'terminal',
  },
  {
    id: 'sofia',
    name: 'Sofía Marín',
    handle: 'sofiamakes',
    category: 'Art',
    bio: 'Generative artist. I write code that paints, then paint over what the code gets wrong.',
    location: 'Valencia, Spain',
    baseFollowers: 31420,
    hue: 330,
    cover: 'shapes',
  },
  {
    id: 'marcus',
    name: 'Marcus Bell',
    handle: 'marcusbellmusic',
    category: 'Music',
    bio: 'Producer and keys player. Lo-fi, soul, and the occasional synth experiment that goes too far.',
    location: 'Atlanta, USA',
    baseFollowers: 67100,
    hue: 45,
    cover: 'vinyl',
  },
  {
    id: 'jordan',
    name: 'Jordan Hayes',
    handle: 'runwithjordan',
    category: 'Fitness',
    bio: 'Run coach for people who swear they are not runners. Easy miles, real progress.',
    location: 'Toronto, Canada',
    baseFollowers: 19880,
    hue: 140,
    cover: 'track',
  },
  {
    id: 'hana',
    name: 'Hana Sato',
    handle: 'hanareads',
    category: 'Books',
    bio: 'One book a week, reviewed in under 200 words. Translated fiction is my weakness.',
    location: 'Osaka, Japan',
    baseFollowers: 12460,
    hue: 0,
    cover: 'books',
  },
  {
    id: 'kofi',
    name: 'Kofi Mensah',
    handle: 'kofigrows',
    category: 'Wellness',
    bio: 'Balcony gardener growing food in four square metres. Plants, patience, and compost talk.',
    location: 'Accra, Ghana',
    baseFollowers: 9340,
    hue: 100,
    cover: 'leaves',
  },
]

export const DEFAULT_FOLLOWING = ['amara', 'theo', 'priya', 'sofia']

interface SeedPost {
  id: string
  creatorId: string
  minutesAgo: number
  text: string
  media?: PostMedia
  likes: number
  saves: number
}

const SEED_POSTS: SeedPost[] = [
  // Most recent first is not required; the feed sorts by time.
  {
    id: 'p_amara_1',
    creatorId: 'amara',
    minutesAgo: 14,
    text: 'Pepper soup weather in London today. Goat, uziza, utazi, and a very generous hand with the scent leaf. Full recipe is going up tonight for anyone who asked last week.',
    media: { type: 'art', art: 'bowl', alt: 'Illustration of a steaming bowl of soup seen from above' },
    likes: 1284,
    saves: 412,
  },
  {
    id: 'p_priya_1',
    creatorId: 'priya',
    minutesAgo: 47,
    text: 'Week 23 build log:\n\n• 1,912 active users (up 6%)\n• Shipped offline sync, finally\n• Broke streaks for 40 people for about 20 minutes. Sorry. Postmortem in the thread.\n\nMost requested feature right now is widgets. That is next.',
    likes: 386,
    saves: 51,
  },
  {
    id: 'p_marcus_1',
    creatorId: 'marcus',
    minutesAgo: 95,
    text: 'Visualiser for "Low Light", out Friday. Recorded the Rhodes part at 2am with the window open, so yes, that is a real cricket in the second verse.',
    media: { type: 'video', src: '/media/studio-light.mp4', poster: '/media/studio-light.jpg', alt: 'Slow moving warm gradient visualiser' },
    likes: 5210,
    saves: 880,
  },
  {
    id: 'p_theo_1',
    creatorId: 'theo',
    minutesAgo: 180,
    text: 'Day 4 on the Kungsleden. 21 km, one river crossing that was deeper than the map promised, and a sunset at 10:40pm that made every blister worth it.',
    media: { type: 'art', art: 'ridge', alt: 'Illustration of mountain ridges at dawn' },
    likes: 2033,
    saves: 655,
  },
  {
    id: 'p_sofia_1',
    creatorId: 'sofia',
    minutesAgo: 260,
    text: 'Eight seconds of falling into a fractal. This is the raw render before I pick frames to print. Watch to the end, the last second is my favourite.',
    media: { type: 'video', src: '/media/fractal-dive.mp4', poster: '/media/fractal-dive.jpg', alt: 'Zoom into a Mandelbrot fractal' },
    likes: 1740,
    saves: 512,
  },
  {
    id: 'p_jordan_1',
    creatorId: 'jordan',
    minutesAgo: 340,
    text: 'Reminder for the 10K group: easy means you can hold a conversation. If you cannot say a full sentence, slow down. Slow running builds the engine. Fast running just shows it off.',
    likes: 904,
    saves: 233,
  },
  {
    id: 'p_hana_1',
    creatorId: 'hana',
    minutesAgo: 470,
    text: 'This week: "The Memory Police" by Yōko Ogawa. A quiet island where things disappear and then the memory of them goes too. Calm, unsettling, and I have not stopped thinking about it. 4.5 out of 5.',
    media: { type: 'art', art: 'books', alt: 'Illustration of a stack of books' },
    likes: 611,
    saves: 198,
  },
  {
    id: 'p_kofi_1',
    creatorId: 'kofi',
    minutesAgo: 610,
    text: 'First proper harvest from the balcony: three garden eggs, a fistful of okra, and more basil than one person should own. Four square metres, ten weeks.',
    media: { type: 'art', art: 'leaves', alt: 'Illustration of leafy plants' },
    likes: 457,
    saves: 120,
  },
  {
    id: 'p_amara_2',
    creatorId: 'amara',
    minutesAgo: 1420,
    text: 'Small tip that changed my jollof: fry the tomato and pepper base until the oil separates and it turns brick red. That is the flavour. Rushing this step is why it tastes "raw".',
    likes: 3120,
    saves: 1902,
  },
  {
    id: 'p_sofia_2',
    creatorId: 'sofia',
    minutesAgo: 1560,
    text: 'New series: "Grid Weather". Each piece starts from the same 6 by 6 grid and the same seed. The only thing that changes is the forecast for Valencia that day.',
    media: { type: 'art', art: 'shapes', alt: 'Abstract composition of circles and rectangles' },
    likes: 2215,
    saves: 734,
  },
  {
    id: 'p_theo_2',
    creatorId: 'theo',
    minutesAgo: 1710,
    text: 'Gear honesty: the "ultralight" tent I was sent weighs 340 g more than the listing once you add the stakes it needs. Still a good tent. Just weigh your own kit.',
    likes: 812,
    saves: 140,
  },
  {
    id: 'p_marcus_2',
    creatorId: 'marcus',
    minutesAgo: 1890,
    text: 'Asked for chord progressions you are stuck on and got 600 replies. Going through them live on Thursday. Bring headphones.',
    media: { type: 'art', art: 'keys', alt: 'Illustration of piano keys' },
    likes: 3870,
    saves: 402,
  },
  {
    id: 'p_priya_2',
    creatorId: 'priya',
    minutesAgo: 2050,
    text: 'Unpopular opinion: your first 100 users should all have your personal email. Every single one of mine does, and half the roadmap came from those replies.',
    media: { type: 'art', art: 'terminal', alt: 'Illustration of a code editor window' },
    likes: 1290,
    saves: 377,
  },
  {
    id: 'p_jordan_2',
    creatorId: 'jordan',
    minutesAgo: 2600,
    text: 'Track Tuesday: 6 × 400 m with 90 seconds of walking between each. Run them at a pace you could repeat ten times, not one you can survive six times.',
    media: { type: 'art', art: 'track', alt: 'Illustration of running track lanes' },
    likes: 701,
    saves: 266,
  },
  {
    id: 'p_hana_2',
    creatorId: 'hana',
    minutesAgo: 2950,
    text: 'Reading slump fix that works for me: put a short story collection by the bed and nothing else. One story a night. Momentum comes back in about a week.',
    likes: 433,
    saves: 151,
  },
  {
    id: 'p_kofi_2',
    creatorId: 'kofi',
    minutesAgo: 3100,
    text: 'Compost question I get every week: yes, a bokashi bin works on a balcony and no, it does not smell if you drain it every few days.',
    likes: 214,
    saves: 77,
  },
  {
    id: 'p_amara_3',
    creatorId: 'amara',
    minutesAgo: 4300,
    text: 'Suya spice, my ratio: 4 parts ground kuli kuli, 1 part each of ginger, garlic, and paprika, a pinch of cayenne, half a stock cube crushed in. Keeps for a month in a jar.',
    media: { type: 'art', art: 'citrus', alt: 'Illustration of sliced citrus and spices' },
    likes: 2788,
    saves: 2201,
  },
  {
    id: 'p_theo_3',
    creatorId: 'theo',
    minutesAgo: 4500,
    text: 'Ferry to Lofoten booked. Ten days, no fixed plan except one: find the quietest beach on the islands and sit there with a thermos.',
    media: { type: 'art', art: 'coast', alt: 'Illustration of a coastline at sunset' },
    likes: 1460,
    saves: 301,
  },
  {
    id: 'p_sofia_3',
    creatorId: 'sofia',
    minutesAgo: 5800,
    text: 'People ask what tools I use. Honest answer: about 200 lines of code, a cheap inkjet, and a lot of crossed out sketchbook pages. The code is the easy part.',
    likes: 980,
    saves: 145,
  },
  {
    id: 'p_marcus_3',
    creatorId: 'marcus',
    minutesAgo: 6100,
    text: 'Pressed 300 copies of the EP on vinyl. 287 already went to people on the mailing list before I announced it anywhere else. That is the whole point of building your own list.',
    media: { type: 'art', art: 'vinyl', alt: 'Illustration of a vinyl record' },
    likes: 6402,
    saves: 512,
  },
  {
    id: 'p_priya_3',
    creatorId: 'priya',
    minutesAgo: 7400,
    text: 'Spent the weekend deleting code instead of writing it. App is 18% smaller and nothing broke. Most satisfying commit of the year.',
    likes: 740,
    saves: 62,
  },
  {
    id: 'p_jordan_3',
    creatorId: 'jordan',
    minutesAgo: 8700,
    text: 'Someone in the group ran their first 5K without stopping this morning, at 61 years old. I am not crying, you are crying.',
    media: { type: 'art', art: 'sunrise', alt: 'Illustration of a sunrise over a hill' },
    likes: 2540,
    saves: 190,
  },
  {
    id: 'p_hana_3',
    creatorId: 'hana',
    minutesAgo: 10100,
    text: 'November reading list is up: five translated novels under 250 pages. Perfect for short, dark afternoons.',
    likes: 521,
    saves: 388,
  },
  {
    id: 'p_kofi_3',
    creatorId: 'kofi',
    minutesAgo: 11500,
    text: 'Planted the seeds you voted for: scotch bonnet won by a landslide. Germination in about two weeks if the weather is kind.',
    media: { type: 'art', art: 'sunrise', alt: 'Illustration of a sunrise over a hill' },
    likes: 302,
    saves: 49,
  },
  // The visitor's own creator page starts with two posts so the studio is not empty.
  {
    id: 'p_me_1',
    creatorId: SELF_ID,
    minutesAgo: 2300,
    text: 'Sketchbook page from the train to Porto. Drew the same hillside four times as the light changed. The second one is the keeper.',
    media: { type: 'art', art: 'sunrise', alt: 'Illustration of a sunrise over a hill' },
    likes: 164,
    saves: 38,
  },
  {
    id: 'p_me_2',
    creatorId: SELF_ID,
    minutesAgo: 8200,
    text: 'Thank you for 1,000 followers. Every one of you chose to be here, and I do not take that lightly. Rewards for longtime followers are coming soon.',
    likes: 241,
    saves: 12,
  },
]

export function buildSeedPosts(seededAt: number): Post[] {
  return SEED_POSTS.map((p) => ({
    id: p.id,
    creatorId: p.creatorId,
    createdAt: minutesAgo(seededAt, p.minutesAgo),
    text: p.text,
    media: p.media,
    baseLikes: p.likes,
    baseSaves: p.saves,
  }))
}

const FANS = [
  { name: 'Lena Brooks', handle: 'lenab', hue: 190 },
  { name: 'Dami Adeyemi', handle: 'damicooks', hue: 25 },
  { name: 'Chris Ortega', handle: 'chriso', hue: 280 },
  { name: 'Yuki Tan', handle: 'yukitan', hue: 330 },
  { name: 'Sam Patel', handle: 'sampatel', hue: 120 },
  { name: 'Noor Haddad', handle: 'noorh', hue: 50 },
  { name: 'Eli Novak', handle: 'elinovak', hue: 210 },
]

const SEED_COMMENTS: Array<{ postId: string; fan: number; minutesAgo: number; text: string }> = [
  { postId: 'p_amara_1', fan: 1, minutesAgo: 9, text: 'Finally! My mum makes it with catfish, going to try goat this time.' },
  { postId: 'p_amara_1', fan: 0, minutesAgo: 6, text: 'Where do you find utazi in London? Asking for a very hungry friend.' },
  { postId: 'p_priya_1', fan: 2, minutesAgo: 30, text: 'Love that you share the broken streaks too. Makes the wins feel real.' },
  { postId: 'p_marcus_1', fan: 3, minutesAgo: 70, text: 'The cricket is the best feature on the track honestly.' },
  { postId: 'p_marcus_1', fan: 6, minutesAgo: 52, text: 'Rhodes at 2am hits different. Friday cannot come soon enough.' },
  { postId: 'p_theo_1', fan: 4, minutesAgo: 150, text: 'Which section is this? Planning Abisko to Nikkaluokta next summer.' },
  { postId: 'p_sofia_1', fan: 5, minutesAgo: 200, text: 'Watched it six times. The last second really is the best.' },
  { postId: 'p_jordan_1', fan: 0, minutesAgo: 300, text: 'Needed this. I have been "easy running" at race pace for a month.' },
  { postId: 'p_hana_1', fan: 3, minutesAgo: 420, text: 'Adding it to my list. Have you read Hotel Iris?' },
  { postId: 'p_amara_2', fan: 2, minutesAgo: 1300, text: 'This is exactly why mine never tasted like my aunt’s. Thank you.' },
  { postId: 'p_sofia_2', fan: 6, minutesAgo: 1500, text: 'Weather as a seed is such a beautiful idea.' },
  { postId: 'p_me_1', fan: 4, minutesAgo: 2200, text: 'The second one is perfect. Would buy a print of this.' },
  { postId: 'p_me_1', fan: 0, minutesAgo: 2100, text: 'Porto light is unreal. Lovely page.' },
  { postId: 'p_me_2', fan: 5, minutesAgo: 8000, text: 'Here since the first sketch. Congratulations!' },
]

export function buildSeedComments(seededAt: number): Comment[] {
  return SEED_COMMENTS.map((c, i) => {
    const fan = FANS[c.fan]
    return {
      id: `c_seed_${i}`,
      postId: c.postId,
      authorName: fan.name,
      authorHandle: fan.handle,
      authorHue: fan.hue,
      text: c.text,
      createdAt: minutesAgo(seededAt, c.minutesAgo),
    }
  })
}

// Reward costs are balanced for creator specific CP (Release 1).
// A fan can earn about 8 CP per post (like 2, save 1, comment 5), plus 3 for
// a finished video and 10 while following. Entry rewards (15 to 20 CP) are
// reachable in one session; higher tiers (60 to 150 CP) need a few weeks of
// regular engagement at roughly 24 CP per week for a creator posting 3 times.
type SeedReward = Omit<Reward, 'createdAt'> & { daysAgo: number }

const SEED_REWARDS: SeedReward[] = [
  { id: 'r_theo_wall', creatorId: 'theo', title: 'Arctic wallpaper pack', description: 'Twelve phone and desktop wallpapers from the Kungsleden trip.', cost: 15, kind: 'digital', stock: null, claimedByOthers: 318, daysAgo: 20 },
  { id: 'r_amara_card', creatorId: 'amara', title: 'Family recipe card: slow jollof', description: 'The printable recipe card my aunt wrote out for me, with my notes in the margins.', cost: 15, kind: 'digital', stock: null, claimedByOthers: 902, daysAgo: 30 },
  { id: 'r_hana_list', creatorId: 'hana', title: 'Annotated reading list', description: 'Twenty translated novels with a short note on why each one stayed with me.', cost: 15, kind: 'digital', stock: null, claimedByOthers: 144, daysAgo: 12 },
  { id: 'r_kofi_guide', creatorId: 'kofi', title: 'Balcony seed starting guide', description: 'My step by step guide for starting seeds in small spaces, with a planting calendar.', cost: 15, kind: 'digital', stock: null, claimedByOthers: 87, daysAgo: 9 },
  { id: 'r_sofia_sketch', creatorId: 'sofia', title: 'Behind the algorithm sketchbook', description: 'A digital flip through of the notebook where each generative series starts.', cost: 20, kind: 'access', stock: null, claimedByOthers: 210, daysAgo: 15 },
  { id: 'r_jordan_plan', creatorId: 'jordan', title: '8 week beginner 10K plan', description: 'The exact plan I use with my run group, with easy, steady, and rest days mapped out.', cost: 15, kind: 'digital', stock: null, claimedByOthers: 433, daysAgo: 18 },
  { id: 'r_theo_gpx', creatorId: 'theo', title: 'Route files: Kungsleden north', description: 'GPX files for every day of the route, with water sources and camp spots marked.', cost: 60, kind: 'digital', stock: null, claimedByOthers: 96, daysAgo: 6 },
  { id: 'r_priya_shout', creatorId: 'priya', title: 'Thank you in the build log', description: 'Your name in the supporters section of the next weekly build log.', cost: 15, kind: 'recognition', stock: 25, claimedByOthers: 19, daysAgo: 8 },
  { id: 'r_hana_club', creatorId: 'hana', title: 'Book club guest pass', description: 'Join one monthly online book club call as a guest.', cost: 75, kind: 'access', stock: 15, claimedByOthers: 9, daysAgo: 5 },
  { id: 'r_marcus_stems', creatorId: 'marcus', title: 'Unreleased stems pack', description: 'Stems from three unreleased beats for you to remix for personal use.', cost: 20, kind: 'digital', stock: null, claimedByOthers: 1204, daysAgo: 25 },
  { id: 'r_sofia_print', creatorId: 'sofia', title: 'Signed digital edition', description: 'A numbered, high resolution file from the Grid Weather series with a signed certificate.', cost: 100, kind: 'digital', stock: 20, claimedByOthers: 14, daysAgo: 3 },
  { id: 'r_jordan_form', creatorId: 'jordan', title: 'Running form check', description: 'Send a 20 second clip and get a short written review of your form.', cost: 90, kind: 'experience', stock: 10, claimedByOthers: 7, daysAgo: 4 },
  { id: 'r_amara_live', creatorId: 'amara', title: 'Seat at a live cook along', description: 'One seat at a small online cook along. Ingredients list sent a week ahead.', cost: 120, kind: 'experience', stock: 12, claimedByOthers: 10, daysAgo: 2 },
  { id: 'r_priya_call', creatorId: 'priya', title: '30 minute product chat', description: 'A short video call to talk through your side project or launch plan.', cost: 150, kind: 'experience', stock: 5, claimedByOthers: 4, daysAgo: 7 },
  { id: 'r_marcus_name', creatorId: 'marcus', title: 'Name a track on the next EP', description: 'Pick the title of one track on the next EP, credited in the liner notes.', cost: 150, kind: 'recognition', stock: 1, claimedByOthers: 0, daysAgo: 1 },
]

export function buildSeedRewards(seededAt: number): Reward[] {
  return SEED_REWARDS.map(({ daysAgo, ...r }) => ({ ...r, createdAt: minutesAgo(seededAt, daysAgo * 1440) }))
}

/** Demo follower gains for the visitor's creator page, oldest day first. */
export const SELF_FOLLOWER_TREND = [9, 14, 7, 21, 12, 18, 26]
