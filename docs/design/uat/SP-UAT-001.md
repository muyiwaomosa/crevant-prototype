# SP-UAT-001: founder acceptance findings and remediation (Nov 27)

The full review, with the approved and current screens side by side:
https://claude.ai/artifact/9NGxS5b5b8ZeNkxV6ucwm1. Findings and status are
tracked in `docs/ACCEPTANCE-CHECKLIST.md`, section H (UAT-001-1 to -4).

| # | Finding | Severity | Root cause | Remediation |
|---|---|---|---|---|
| 1 | Mobile landing hero too crowded | P2 | The illustration sits between the headline and the value proposition, and carries a whole sample text post, statistics and a comment | Value proposition directly under the headline; the split post as a picture (creator's photo above, community below, apricot line between); no sample text, statistics or comment. Preview: `hero-mobile-proposed.webp` |
| 2 | Video unavailable | P1 | By design: uploads are refused until both phone device tests are recorded as passed and the storage cap is set (`ops.video_ready`). Not a defect or deployment issue; playback is on | Founder or tester: device tests on iPhone Safari and Android Chrome (`docs/video/DEVICE-TEST.md`); founder: record results, set the 50 GB cap, switch Video posts on; Claude: verify with check 029 and the video journey |
| 3 | Interface fidelity | P2, blocks the interface milestone | Little media on staging (photo posting founder-only, video off), plus real gaps against SP-DESIGN-002, SP-REFINE-001 and UX-04 | Home: full-bleed media cards, photo avatars, icon Feedback button, own photo in the tab bar. Discover: visual hero recommendation and the posts grid. Create: full-screen composer, Post top right, media preview, topic chips. Profile: open header, filled actions, cobalt insights card, three-column grid. Onboarding: the same card style |
| 4 | Gamification not obvious | P2 | Progress is accurate but sits on the second face, below the fold, and recognition messages don't show progress | Next goal directly under the split; My Goals as a path (done, you are here, next); a goal strip on Home; progress in recognition messages. Existing goals, thresholds, rules and economics only. Preview: `gamification-proposed.webp` |

No migration, new rule, currency, urgency, leaderboard or incentive. Front
end only, inside the December 10 interface target. Nothing is built before
the founder approves the previews and confirms the references.

## Remediation as built (Nov 27, approved direction)

**Finding 1, landing hero.** Phones: headline, value proposition, actions and
disclosure, then the picture with room around it. The split post is a
picture: a sample photo post (the verified creator photo from the asset
register) above, the community below (people and the ways they contribute),
the apricot line between. No sample text, statistics or comment. Desktop
keeps text left, picture right. Headline, copy, disclosures and every other
section unchanged. `src/public/landing/ui/SplitThePost.tsx`, `sections/Hero.tsx`.

**Finding 3, interface fidelity**, designed for members with no media:

| Screen | As built |
|---|---|
| Home | Full-bleed photo and video cards (unchanged); short text posts in the display face on their own brand tint; initials on brand tints for members without a photo; round Feedback icon button; your photo (or initials) on the Profile tab |
| Discover | Visual hero recommendation (cobalt with the split diagonal, large picture, name, reason), then "Posts you might value" as a two-column grid of photo and tinted text tiles |
| Create | Full-screen composer: close, New post, Post at the top right (last in reading and Tab order), your name and audience, large text area |
| Profile | Your profile: picture, name, Edit profile and See as others do, the cobalt insights card, a three-column post grid and a designed empty state. Someone else's: open header with a tinted cover band, counts, filled Following and apricot Join Clique, Support, a three-column grid. Your own public view keeps edit and delete |

**Finding 4, progression journey** (`src/app/journey.tsx`), every value from
`app_my_progress`:

| Where | What |
|---|---|
| Onboarding | The first steps say they also start your supporter goals, with a link to them |
| Home | A compact strip: ring, journey and count, the next step with its count, Go, and X to hide it for the day |
| Discover | A hint when a connection goal (support different creators, keep creators in your Clique) is open, with its count |
| Publishing | After a post, the creator goal for original posts with its new count and bar, read back from the server |
| Contributions | A recognized comment, save, repost or share shows the goal it moved, with a bar |
| My Split | Your next goal directly under the split: where you are, what's left, why it matters (the approved unlock rule), one action |
| My Goals | Each journey as what's left (in any order, the closest marked Suggested next, each with a bar, what remains and an action) and what's done |
| My Activity | Your achievements: goals met and qualification, as the server reports them |

Nothing is sequential, and nothing new is counted or awarded: the approved
goals, thresholds and economics only.
