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
