# SP-DESIGN-001: Product experience proposal

Status: proposal for one consolidated founder review. November 24, 2026.
Visual previews: `docs/design/previews/*.png`, rendered from `docs/design/wireframes.html`. All names and numbers in the previews are sample data.

Principle: **simplicity on the surface, intelligence underneath.** Members see five places to go. The seven business engines never appear as separate products.

## 1. Information architecture

| Destination | Purpose | Faces (swipe, tap or arrow keys) | Who sees what |
|---|---|---|---|
| **Home** | Relationships you chose | Clique first (default) · My Clique · Following | Everyone |
| **Discover** | Find new value | Relevant (default) · Creators · Content; search above the faces | Everyone |
| **Create** | Publish | No faces: one composer for text, photo, video, with topic | Everyone |
| **My Split** | Your contributions and simulated rewards | Overview · History · Opportunities | Owner only |
| **Profile** | Identity, content and insights | Profile and content · Attention · Retention · Money | Visitors see only the first face; insights are owner-only, enforced on the server |

Outside the five: Settings and account (from Profile), Send feedback (header on phones, sidebar on desktop), Control Center (only for the founder and authorised operators, linked from Profile), public post previews and registration (signed-out).

"Clique first" replaces the earlier "For you" label because it describes what the feed does and avoids any suggestion of algorithmic ranking.

## 2. Multi-face view component

One reusable component, `FaceView`, used by Home, Discover, My Split and Profile.

| Requirement | Design |
|---|---|
| Swipe | Horizontal swipe changes face only when horizontal movement exceeds vertical by 1.5× and passes 48 px; vertical scrolling never triggers it |
| Not swipe-only | Labelled tabs above the content (tap or click) and dot indicators; arrow keys move between tabs (WAI-ARIA tabs pattern) |
| State | Each face keeps its own scroll position and loaded data; the face is in the URL (`/app?face=clique`) so Back and shared links work |
| Conflicts | No swipe over video players, image zoom, carousels or text selection; disabled near screen edges (16 px) so the browser's own back gesture keeps working |
| Motion | A simple 200 ms slide; none when the member prefers reduced motion; no 3D effects |
| Performance | Faces load when first shown, then stay mounted; CSS transforms only |
| Access control | Faces a viewer isn't allowed to see are not rendered and their data is never requested |

Effort: about 14 hours including tests (keyboard, reduced motion, gesture thresholds, URL state), counted under FND-08.

## 3. Design system

Built from the existing tokens in `src/index.css` (Inter and Archivo, brand blue #2447a6 and #3156b5, spark #b35a22, paper #faf7f1, mint secondary #a8d9cf). Nothing new is invented; inconsistencies are removed.

| Component | Notes |
|---|---|
| Type scale | Display (Archivo) for headings and numbers; Inter for text; 14 px minimum body on mobile |
| Colour roles | Primary, accent (Clique), simulated (mint), sponsored (neutral with spark border), danger, success; WCAG 2.2 AA contrast checked |
| Spacing and radius | 4 px grid; 14 px card radius; 16 px phone gutter |
| Buttons and controls | Primary, secondary, quiet, destructive; 44 px touch targets |
| Content card | One `PostCard` for text, photo, video, repost header, sponsored variant, Clique badge, actions (like, comment, repost, share, save) |
| Analytics card | Label, big number, short explanation, optional trend line; never a chart without words |
| Financial card | Always shows its class badge: **Simulated**, **Non-binding** or **Actual**; amounts never appear without one |
| States | Skeleton loading, empty state with one next action, error with a plain cause and Try again |
| Navigation | Bottom bar on phones (five items, Create raised), left rail on desktop |
| Motion | Short fades and slides only; reduced-motion respected |

Effort: about 10 hours to consolidate tokens and components (part of BRD-09), then applied as features are built.

## 4. Journeys (preview `journeys.png`)

Creator, consumer, advertiser and platform journeys are drawn end to end in the preview, matching the founder's journey definitions. Each step maps to one screen in the previews and to an end-to-end test in SP-TA-001 section 9.

## 5. Public website

Keep the existing site and its approved copy; evolve, don't rebuild (preview `site.png`).

1. Add the approved signature **"Don't just post. Get your split."** under the existing headline, keeping "You Create The Post. You Deserve a Split."
2. Three clear paths: For creators (apply), For members (join the waitlist or use an invitation), For advertisers (talk to us).
3. Replace long explanatory passages with real application screenshots from the December 7 internal build. No fabricated numbers, testimonials or traction.
4. Pilot disclosure beside every economic claim: rewards and earnings are simulated, nothing is paid out, nothing is guaranteed, adults only.
5. Move the sharing image to the Splitpost domain and remove the `/tour` sample economy, which shows the retired creator-specific points model.

Effort: about 6 hours beyond the existing site (part of BRD-09), plus screenshots after December 7.

## 6. Accessibility and gestures

* Every swipe has a visible tap and keyboard equivalent.
* Focus order follows the visual order; tabs announce "Face 2 of 3".
* Reduced motion disables transitions.
* Videos have captions support when a caption file is provided (caption authoring itself is not in the MVP).
* Automated axe checks in every journey; manual screen reader pass (VoiceOver on iPhone, TalkBack on Android) before release.

## 7. Effort and dependencies

| Item | Hours | Counted under |
|---|---|---|
| Multi-face component and navigation | 14 | FND-08 |
| Design system consolidation | 10 | BRD-09 |
| Website evolution | 6 | BRD-09 |
| Applying states and cards across features | included in each feature | |
| **Additional effort versus the original lean plan** | **about 30 hours** | |

Dependencies: founder approval of this proposal (one review) before the navigation work in the first implementation package; real screenshots after the December 7 internal demonstration.

## 8. Decisions requested in the one review

1. Approve the five destinations and the faces in section 1.
2. Approve "Clique first" as the default Home face name.
3. Approve Profile insights as three faces (Attention, Retention, Money) or one combined Insights face.
4. Approve the website changes in section 5.
