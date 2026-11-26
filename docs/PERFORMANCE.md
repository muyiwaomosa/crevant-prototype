# Performance and responsiveness

What a first visit costs on a phone over a slow connection, how it was
measured, and what to check on real devices during acceptance.

## First load (measured Nov 26)

`scripts/perf/first-load.cjs` serves a build gzip-compressed with the SPA
fallback (as Vercel does) and opens each page as a **first visit with an
empty cache** in Chromium at a 390 px phone viewport, with the network and
CPU throttled the way Lighthouse emulates mobile. "Ready" is when the person
can read and act: the landing heading, the sign-in email field, or Home
showing a post (signed in). Median of 5 visits each.

**Member app** (the staging app and `app.splitpost.ca`, what testers use):

| Page | Slow 4G, mid-range phone: before | after | 3G, low-end phone: before | after |
|---|---|---|---|---|
| Sign in (ready) | 2.7 s | **2.1 s** | 5.0 s | **4.3 s** |
| Home, signed in (shows a post) | 3.1 s | **3.1 s** | 6.4 s | **5.9 s** |
| JavaScript downloaded | 300 KB | 266 KB | 300 KB | 266 KB |

**Public site** (`www.splitpost.ca`, its own build):

| Page | Slow 4G: before | after | 3G: before | after |
|---|---|---|---|---|
| Landing page (heading shown) | 1.7 s | **1.5 s** | 3.2 s | **2.6 s** |
| JavaScript downloaded | 152 KB | 113 KB | 152 KB | 113 KB |

Slow 4G: 150 ms latency, 1.6 Mbps, CPU 4 times slower (Lighthouse's mobile
default). 3G: 300 ms, 0.75 Mbps, CPU 6 times slower. "Before" is `main` at
9270ea5; "after" is the release hardening pull request.

The full app build used by developer previews (`crevant-prototype`) gets the
same faster landing page and sign-in (2.4 to 1.7 s, 2.6 to 1.5 s on Slow 4G),
but a cold signed-in Home there is about 0.5 s slower than before, because
only the member app build lists the members area for early download. No
tester or member uses that build, so it is left as it is.

**What changed:** the members area (91 KB compressed) and the sample demo
(41 KB) are no longer in the main bundle. In the full app build the landing
page and sign-in load 42% less JavaScript; the public site loads 26% less;
the member app build loads 11% less, since it fetches the members area
alongside the page on purpose. Sign-in and registration fetch the
members area in the background while the person types, and opening `/app`
directly starts it at once. In the member app build (the staging app and
`app.splitpost.ca`), the page itself lists the members area for the browser
to fetch alongside the main bundle. When its code has already arrived, the
members area renders directly instead of through React's suspended-page
step, which on its own had cost about half a second on a throttled phone
(found by measuring, and fixed before merging).

**Reading the numbers:** emulation stands in for a phone consistently, so
builds can be compared; it is not a real device. A returning member's phone
has the files cached (`/assets` are cached for a year and change name with
each build), so after the first visit only data is fetched.

## Database at scale (measured Nov 26)

Measured on the test database at roughly 30 times a pilot's size: 1,480
accounts, 153,000 posts, 90,000 follows, 50,000 likes, 40,000 comments.
Fastest of 5 calls, as a member following 60 creators:

| Request | Time |
|---|---|
| Home feed (Following, Clique first, My Clique) | 2 to 31 ms |
| Discover (posts, people), suggestions | 2 to 12 ms |
| My Split points, ad choice | under 1 ms |
| Search posts | 294 ms |
| Creator intelligence (30 days) | 211 ms |
| Control Center overview (founder) | 872 ms |

Every member-facing request at pilot size takes tens of milliseconds. Search,
creator intelligence and the Control Center grow with the number of posts;
they are well within limits for the pilot and are the first to look at
(an index, or a summary table) before a larger Production cohort. No change
is proposed now: an index is a migration with its own approval.

## Real-device check (during acceptance)

Once staging works, on your own phone with **Wi-Fi off** (mobile data), in a
private tab so nothing is cached:

1. Open the staging app's sign-in page and count to when the form appears.
2. Sign in and count to when Home shows posts.
3. Scroll Home, open a post, like it, go back: nothing should stutter or jump.
4. Repeat on an older or cheaper phone if you have one (and an Android if you
   use an iPhone, or the reverse).

Note anything slower than about 3 seconds, or anything that jumps or freezes,
in Feedback. Claude reruns `scripts/perf/first-load.cjs` on any change to
loading.

To rerun the measurement locally:

```bash
node scripts/perf/first-load.cjs dist "label"
```

(with `API_URL`, `DB_URL` and `SERVICE_ROLE_KEY` of the local Supabase set for
the signed-in visit; `RUNS` and `TARGETS` are optional).
