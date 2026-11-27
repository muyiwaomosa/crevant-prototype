# SP-BRAND-002: landing page, as built (Nov 27)

Founder brief SP-BRAND-002 with the marketing positioning amendment. Built
on the existing landing architecture (sections, `landing/copy.ts`,
`landing/claims.ts`, photos, tests). Full pages: `sp-brand-002-desktop.webp`
and `sp-brand-002-phone.webp` in this folder.

## 1. What the page is

Eight sections, one story, for creators and supporters:
HOOK, WHY, WHO, WHAT, HOW, ONE ACCOUNT, PILOT, INVITATION.

* **HOOK:** "Don't just post. / Get your split." is the headline (the second
  line in apricot), the two approved sentences, Join the Waitlist and
  Discover Splitpost, and the disclosure. The picture is the existing split
  post: what a creator made and what her community grew (shared value, no
  money).
* **WHY:** the full script; a creator at work with a drawn "your month"
  card (sample, no figures, no companies named).
* **WHO:** creators and supporters only, each with a photo.
* **WHAT:** the vision without the advertiser line, a community photo, the
  three commitments and "This is our long-term vision, not a promise of
  income during the pilot."
* **HOW:** the product demonstration. Five steps, each with a different
  screen captured from the real app (Discover, Home with the Clique row, a
  creator's profile and insights, a recognized contribution, My Split), each
  labelled "The Splitpost app, with illustrative sample people and data.
  Amounts are simulated." No video publishing is shown. Contribute and Earn
  carry their disclosures beside them.
* **ONE ACCOUNT, PILOT, INVITATION:** the amended copy; the pilot list is
  your seven points followed by the six earlier approved disclosures that
  still apply (none removed); one Join the Waitlist.

Header: How it works, Discover Splitpost (opens WHY), Sign in, the waitlist
button. Footer: Why Splitpost, How It Works, The Pilot, the waitlist, Sign
In. Discover Splitpost opens the story at WHY; How it works opens HOW.

## 2. Confirmations

* **Script preserved:** every approved sentence is in `landing/copy.ts` word
  for word, and `copy.test.ts` checks each section against the script.
* **Waitlist and invitation unchanged:** every call to action goes to the
  one `/join`; the waitlist stays closed ("Waitlist Opens Soon"), registration
  and limits untouched; Sign In and invitation links unchanged.
* **No advertiser proposition** in WHO, WHAT, ONE ACCOUNT or the closing
  (tested). The advertising engine and managed requests are untouched.
* **Retired items removed:** the Following feed tabs, the three-path cards,
  Better Split's referral walk-through and its provisional point values.

## 3. Test results

* Unit: 901 pass (whole suite), including the claims checker over every
  sentence with no exceptions.
* Browser (`scripts/e2e/public-site.sh`): 211 checks pass, including WCAG 2.2
  AA on every public page at phone and desktop, no sideways scrolling at 320
  to 1440 px, every screen and callout on screen, images sharp at 2x, every
  link working, no outside requests, no CSP violations.
* Speed (local production build): phone on Slow 4G with 4x CPU, first and
  largest paint 1.24 s, layout shift 0.001, 140 KB first load; desktop 0.15 s.
  Photos and screens load lazily (WebP, 43 to 112 KB each).
* Not run locally: the production-address launch rehearsal (the sandbox's
  browser forces HTTPS for vercel.app); it runs in CI.

## 4. Founder decisions (Nov 27), as implemented

1. **Revenue language:** the Earn body is the approved two sentences ("a
   future share of eligible content revenue"; "your simulated split"), with
   the existing qualification, verification and simulated disclosures.
2. **Connection Points:** "Connection Points recognize your contributions.
   They are not money and have no cash value." in Contribute and the pilot
   list; the earlier safeguard (can't be bought, sold, transferred or
   converted to cash) stays in the list.
3. **No numerical claims:** the WHY opening is the approved four lines.
4. **Source of eligible revenue:** added to Earn, and the outdated "labelled
   demonstrations" disclosure replaced. **One word added to each of two
   sentences, for confirmation:** with the claims checker unchanged, both
   sentences as written read as revenue sharing that exists today. Adding
   "future" (the word decision 1 uses) satisfies the checker without any
   exception:
   * "Splitpost is designed to share **future** eligible revenue from
     advertising shown with content with the creators and qualifying
     supporters who help that content succeed."
   * "Sponsored content is clearly labelled. Advertising and **future**
     revenue sharing are being tested during the pilot, and all pilot
     earnings are simulated."
   Consistency with the economic framework: only advertising shown with
   content is described as shared (general feed advertising is not), and
   supporters' share is from the platform-wide pool, which "qualifying
   supporters who help that content succeed" describes at this level.
5. **Pilot audience:** "We're inviting creators and supporters to help us
   test a better way for social media to work."
6. **Photography:** recorded in the asset register (`landing/photos.ts`:
   source URL, licence, filenames, `verified`). The two new photos are
   **unverified**: pexels.com cannot be reached from the build environment
   and search does not return either listing, so their credits could not be
   confirmed. They are flagged (`PHOTOS_TO_VERIFY`) for verification or
   replacement before publication:
   * supporter-phone (`supporter-phone-600.webp`, `-960.webp`):
     https://www.pexels.com/photo/smiling-woman-using-mobile-phone-at-home-6697318/
   * community-table (`community-table-640.webp`, `-1200.webp`):
     https://www.pexels.com/photo/a-group-of-friends-laughing-while-sitting-near-the-table-5738245/
   No watermarked reference imagery is used.
7. **Callouts:** exactly as approved. The labels say the screens are the
   actual app, with illustrative sample people and data and simulated amounts.

The claims checker is unchanged and nothing on the page needs an exception:
`FOUNDER_REVIEW` and every allowance in the tests are gone.

## 5. Publication

Merging to `main` builds the public site, so this goes out only with your
approval (with the SP-UX-002 package in the same pull request).
