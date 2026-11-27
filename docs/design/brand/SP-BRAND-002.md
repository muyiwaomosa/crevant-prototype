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
   demonstrations" disclosure replaced. **Approved Nov 27** with the word
   "future" in both sentences; the claims checker is unchanged and needs no
   exception:
   * "Splitpost is designed to share future eligible revenue from
     advertising shown with content with the creators and qualifying
     supporters who help that content succeed."
   * "Sponsored content is clearly labelled. Advertising and future revenue
     sharing are being tested during the pilot, and all pilot earnings are
     simulated."
   Consistency with the economic framework: only advertising shown with
   content is described as shared (general feed advertising is not), and
   supporters' share is from the platform-wide pool, which "qualifying
   supporters who help that content succeed" describes at this level.
5. **Pilot audience:** "We're inviting creators and supporters to help us
   test a better way for social media to work."
6. **Photography:** the asset register (`landing/photos.ts`) records each
   photo's source, listing, photographer, licence, files and how it was
   verified. The two Pexels photos whose listings could not be verified were
   **replaced** (founder authorization, Nov 27), and so was the hero's small
   sample avatar, whose credit had also never been confirmed. Each
   replacement's listing was read on Nov 27 and shows the photographer and
   "Free to use under the Unsplash License" (not Unsplash+), with no sponsor
   or brand. Nothing unverified is published (tested: `PHOTOS_TO_VERIFY` is
   empty and every asset is `verified`).

   | Slot | Files | Listing | Photographer | Licence |
   | --- | --- | --- | --- | --- |
   | WHY, creator | creator-editing-640/1200 | [Pexels 7014401](https://www.pexels.com/photo/focused-female-freelancer-editing-photos-on-laptop-7014401/) | George Milton | Pexels License (founder verified Nov 24) |
   | WHO, creators | teacher-recording-640/1200 | [Pexels 9040544](https://www.pexels.com/photo/teacher-recording-herself-teaching-9040544/) | Alena Darmel | Pexels License (founder verified Nov 24) |
   | WHO, supporters | supporter-phone-600/960 | [Unsplash TRkyQgyb4c0](https://unsplash.com/photos/a-woman-sitting-on-a-couch-looking-at-her-cell-phone-TRkyQgyb4c0) | [Ninthgrid](https://unsplash.com/@ninthgrid_) | [Unsplash License](https://unsplash.com/license) |
   | WHAT, community | community-table-640/1200 | [Unsplash UrzN-8K1PCE](https://unsplash.com/photos/outdoor-dinner-party-with-oud-UrzN-8K1PCE) | [Considerate Agency](https://unsplash.com/@considerateagency) | [Unsplash License](https://unsplash.com/license) |
   | HOOK, sample avatar | priya-avatar-160 | [Unsplash HVbaH3p9B8k](https://unsplash.com/photos/a-young-woman-with-dark-wavy-hair-smiles-brightly-smiling-HVbaH3p9B8k) | [IMANA](https://unsplash.com/@imanaindia) | [Unsplash License](https://unsplash.com/license) |

   The Unsplash License allows free commercial use without attribution; it
   does not allow selling unaltered copies or compiling a competing image
   service, neither of which applies. Like Pexels, it gives no model release,
   so the page keeps its note that photos show models, not members, and never
   presents anyone as a user or endorsement. No watermarked reference imagery
   is used.
7. **Callouts:** exactly as approved. The labels say the screens are the
   actual app, with illustrative sample people and data and simulated amounts.

The claims checker is unchanged and nothing on the page needs an exception:
`FOUNDER_REVIEW` and every allowance in the tests are gone.

## 5. Publication

Merging to `main` builds the public site, so this goes out only with your
approval (with the SP-UX-002 package in the same pull request). Once
published, the landing page's messaging and design are frozen until we have
meaningful feedback from prospective members.
