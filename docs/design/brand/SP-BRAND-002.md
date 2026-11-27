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

* Unit: all landing, claims, copy, photo, logo and public-site tests pass
  (410 in the public site and logo files; whole suite green).
* Browser (`scripts/e2e/public-site.sh`): 211 checks pass, including WCAG 2.2
  AA on every public page at phone and desktop, no sideways scrolling at 320
  to 1440 px, every screen and callout on screen, images sharp at 2x, every
  link working, no outside requests, no CSP violations.
* Speed (local production build): phone on Slow 4G with 4x CPU, first and
  largest paint 1.25 s, layout shift 0.001, 140 KB first load; desktop 0.17 s.
  Photos and screens load lazily (WebP, 43 to 112 KB each).
* Not run locally: the production-address launch rehearsal (the sandbox's
  browser forces HTTPS for vercel.app); it runs in CI.

## 4. Decisions for the founder

1. **Revenue sentence (legal safeguard).** "Whether you create content or
   help creators grow, work towards qualifying for a share of eligible
   content revenue." The claims checker reads it as revenue sharing that
   exists today, because the sentence itself has no "simulated" or "future".
   The disclosure sits directly beneath it. Kept word for word and listed in
   `FOUNDER_REVIEW`; please confirm, or approve a wording such as adding
   "simulated during the pilot".
2. **Connection Points "during the pilot".** "Connection Points are not money
   and cannot be exchanged for cash during the pilot." could be read as
   exchangeable after the pilot. The earlier approved disclosure ("can't be
   bought, sold, transferred or converted to cash") is kept beside it, so the
   page stays safe, but the two read differently. Please choose one.
3. **"Millions".** The WHY lines "millions of people" and "Millions more"
   are general, not a figure, but the statistics check flags them. Kept and
   listed for review.
4. **Source of eligible revenue.** The amendment asks to keep advertising and
   the source of eligible revenue disclosed. The new copy says "eligible
   content revenue" without naming advertising; the retained "Any ads you
   see are labelled demonstrations." is the only advertising line, and the
   app labels ads "Sponsored". Suggest approving one line, for example
   "Eligible revenue comes from advertising shown with content.", and
   checking whether "labelled demonstrations" is still accurate.
5. **Pilot body mentions businesses.** "We're inviting creators, supporters
   and businesses" is your section 7 copy, kept; the amendment focuses the
   page on creators and supporters. Keep or remove "and businesses"?
6. **Two new photos.** Supporters (Pexels 6697318) and the community table
   (Pexels 5738245) are licensed Pexels photos; please confirm the
   photographer credits on the listings, as for the first four. The
   metalworker and filmmaker photos are no longer used and were removed.
7. **My words, for approval.** The five screen callouts ("Three ways in,
   picked by your interests", "Your Clique, first on Home", "Your posts and
   your insights, together", "Recognized when it counts", "Your split, your
   goals, your next step"), the screen label, and the footer note now saying
   product screens "show the Splitpost app with illustrative sample people
   and data" (it said "concepts"). The image you shared included a photo
   with another site's watermark; nothing from those images is used.

## 5. Publication

Merging to `main` builds the public site, so this goes out only with your
approval (with the SP-UX-002 package in the same pull request).
