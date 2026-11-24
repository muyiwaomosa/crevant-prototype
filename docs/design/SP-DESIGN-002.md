# SP-DESIGN-002: Visual design proposal

Status: proposal for final visual design approval. November 24, 2026.
Builds on SP-DESIGN-001 (functional design, approved in direction).
Guiding principle: **as easy to use as a social network, as insightful as a business platform.**

| Preview | File |
|---|---|
| Mobile: Home, Discover, Create | `docs/design/hifi/previews/mobile-a.png` |
| Mobile: My Split, Profile, creator insights (Attention, Money) | `docs/design/hifi/previews/mobile-b.png` |
| Individual phone screens | `docs/design/hifi/previews/screen-*.png` |
| Desktop Home | `docs/design/hifi/previews/desktop-home.png` |
| Control Center | `docs/design/hifi/previews/control.png` |
| Landing page evolution | `docs/design/hifi/previews/landing.png` |
| Horizontal full-view transition (recorded demo) | `docs/design/hifi/previews/face-transition.mp4`; interactive: `docs/design/hifi/transition.html` |

Source: `docs/design/hifi/build.mjs` generates every screen from shared components, so a change to a card or token updates all previews. Sample people, photos and numbers only (the photos are the sample-persona images already in the repository).

## 1. Brand: retained, not changed

The live website at www.splitpost.ca and `src/index.css` (`--color-sp-*`) are the authority. No new colours were introduced.

| Role | Token | Value | Used for |
|---|---|---|---|
| Cobalt | sp-primary | #2447a6 | Primary actions, active navigation, My Split and website heroes |
| Cobalt raised | sp-primary-raised | #3156b5 | The diagonal panel behind heroes, as on the website |
| Deep cobalt | brand-800, brand-900 | #172f70, #12255a | Control Center navigation |
| Seafoam | sp-secondary | #a8d9cf | Website-style call-to-action buttons, recognized points, "available" in insights |
| Seafoam tint | sp-secondary-tint | #e7f4f1 | Simulated labels |
| Apricot | sp-accent | #f6b888 | Clique, redemption-eligible points, the second headline line |
| Apricot text | sp-accent-text | #94481a | Eyebrows and apricot text on light backgrounds |
| Ivory | sp-bg | #faf7f1 | App and page background |
| Ink and muted | sp-ink, sp-muted | #1b2430, #4e5a68 | Text |
| Logo | `src/logo/splitpost-logo.svg` | | Unchanged, used as is |
| Type | Archivo (display, wide, black weight) and Inter (text) | | As the website hero |

The earlier wireframes used a darker orange (#b35a22) from an older token set; the visual design uses only the website's apricot pair.

**Contrast (WCAG 2.2):** every text pairing used passes AA. Ink on ivory 14.6, muted on ivory 6.6, white on cobalt 8.3, light text on cobalt 6.1, apricot headline on cobalt 4.8 (large text), apricot text on ivory 6.1, text on seafoam buttons 9.0, Clique tag 6.9, Simulated tag 6.7. Inactive navigation labels were darkened from 3.4 to 6.6 during this review.

## 2. What changed from the wireframes

| Founder request | Design response |
|---|---|
| Recognizable icons | The lucide icon set the app already uses: Home (house), Discover (compass), Create (plus on a raised cobalt tile), My Split (gem), Profile (the member's own photo) |
| Immersive content | Full-bleed photo and video cards with the creator over the image, 26 px radius, soft shadow; text posts set in the display face so words carry the same weight as images |
| Stronger hierarchy | Archivo black, wide, for screen titles, numbers and story headlines; Inter for everything you read |
| Visual analytics | Each insight face leads with one sentence, then one picture (availability ring versus reach, source bars, the 40/20/40 split bar), then one suggestion |
| Smooth full-view swipe | The whole face moves, following the finger, with a 320 ms settle; see section 4 |
| Premium and uncluttered | One primary action per screen, generous spacing on a 4 px grid, ivory background, no borders where spacing does the job |
| Consistent brand | Cobalt heroes with the raised diagonal, apricot and seafoam accents, the official logo: the same language as the website |

**My Split icon:** a gem is proposed because it reads as "something you've earned" without suggesting cash. Alternatives if you prefer: a sparkle, or the Splitpost split mark.

## 3. Components

| Component | Specification |
|---|---|
| Post card | Media card (photo or video, 4:5 or shorter), creator overlay, Clique tag in apricot, caption, actions: like, comment, repost, share, save. Text card uses 21 px display type. Repost header names the original creator |
| Face switcher | Pill segmented control; active face in cobalt (white on blue heroes); lock icon marks owner-only faces |
| Clique strip | Ring avatars (apricot to seafoam gradient) with an unseen count; caught-up creators show a plain ring. This is connection, not discovery |
| Story insight | Eyebrow (apricot text), one-sentence headline with the key number in cobalt, one visual, one apricot-tinted suggestion |
| Points display | Recognized points in seafoam, redemption-eligible points in apricot, shown as one bar of two parts with plain-language labels; never a second currency |
| Value card | Dashed seafoam border plus the **Simulated** tag for every simulated amount; **Non-binding** tag for Support Intent; **Actual commitment** tag for agreed advertiser prices |
| Buttons | Seafoam pill (website style) for joining and following, cobalt pill for publishing and confirming, apricot for joining a Clique, outline for secondary |
| Empty, loading, error | As SP-DESIGN-001: one next action, skeletons in ivory tints, plain causes |

## 4. Multi-face transition

Demonstrated in `face-transition.mp4` and testable in `transition.html` (swipe with a mouse or finger, tap labels, or use arrow keys). Tested in the recording:
* two swipes left and one swipe right moved between faces as expected;
* tapping a label and pressing the arrow keys moved faces;
* **a mostly vertical drag did not change the face** (it stayed on face 3).

| Behaviour | Value |
|---|---|
| Movement | The whole face slides horizontally and follows the finger during the drag |
| Commit threshold | 48 px, and horizontal movement at least 1.5 times vertical; otherwise it springs back |
| Settle | 320 ms, ease-out curve; tabs and dots update together |
| Edges | Drags starting within 16 px of the screen edge are ignored so the browser's back gesture still works |
| Media | No swipe over video players or zoomed images |
| Reduced motion | No animation; the face changes instantly |
| Access | Tabs follow the WAI-ARIA tab pattern; the face is kept in the URL |

No 3D effects: the Rubik's Cube idea is expressed through the structure (each destination has faces you turn to), not through expensive animation.

## 5. Landing page evolution

Retained exactly: logo, colours, typography, the hero headline "You Create The Post. You Deserve a Split.", the approved body copy, the hero illustration (captured from the live site), and the approved sections in their influence-framework order (Hook: hero; Why: the problem; Who: who we're building for; How: what we're building and a better split; Where: our bigger vision; then the invitation).

Added or changed:

| Change | Detail |
|---|---|
| Signature line | **Don't just post. Get your split.** directly under the headline, with the logo mark |
| Registration wording | "A controlled pilot for adults 18+. Join with an invitation or a member's referral link, or join the waitlist." Secondary button "I have an invitation link" |
| Product section "See Splitpost" | Three phone screens with captions. Shown as design previews now; **replaced by real screenshots from the working app before publishing** |
| "Find your path" | Creators (apply), Members (join the waitlist), Advertisers (talk to us), using the site's existing photography |
| Pilot disclosure band | Adults only; points are not money; earnings, rewards and values simulated; nothing paid out; no guaranteed reach; availability is not viewing; features still in development |
| Header | Adds For creators, For members, For advertisers anchors |

Distribution wording everywhere: "Everything you post is available to everyone who follows you, in order. Who watches is always their choice." Nothing claims that followers will see a post.

## 6. Corrections applied (founder review of SP-DESIGN-001)

| # | Correction | Where |
|---|---|---|
| 1 | No suggested creators on desktop Home | Desktop Home right column shows only Your Clique and My Split; functional wireframe corrected too |
| 2 | Five destinations kept | All screens |
| 3 | Multi-face structure kept | All screens; transition demo |
| 4 | "Money" label | Profile insight faces |
| 5 | Availability versus reach | Attention face ring and copy; landing copy; functional wireframes |
| 6 | Controlled invitation and referral registration | Landing hero, disclosure band, wireframes |
| 7 | No unverified video promises | Create shows a format check and upload progress only; no automatic conversion or resumable upload claims in any interface copy |
| 8 | Recognized, redemption-eligible and simulated values distinct | My Split hero bar and legend, value card, desktop My Split card |

## 7. Effort

The visual design adds about **12 hours** to WP-09 (BRD-09): immersive media cards, the visual analytics components and the new landing sections. SP-TA-001 v2.1 and the matrix are updated (477 hours most likely). Applying the visual style happens inside each feature task; it does not block IP-1, whose navigation structure is already approved.

## 8. Decision requested

Approve SP-DESIGN-002 as the final visual direction, optionally choosing a different My Split icon. Recommended by December 1, so the design system consolidation lands before the December 7 internal demonstration.
