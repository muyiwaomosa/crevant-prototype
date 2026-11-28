# Staging acceptance: SP-UX-003 (targeted)

This checklist covers only what PR #144 changed. It closes UAT-001-3 (interface) and UAT-001-4 (gamification and progression) together with the onboarding items, which make up the T3 milestone in `docs/ACCEPTANCE-CHECKLIST.md`.

Previously accepted items are not repeated. That includes sign-in, posting, media, governance, advertising, BL-001 to BL-008 and BL-009.

## Before you start

1. Merge PR #144. The staging frontend then deploys.
2. Keep the progression switch on for staging. Turn it off only for the one check that says so (row 12).
3. Use two accounts:
   * **Founder:** your own account.
   * **New tester:** a fresh account with nothing done yet.
4. Use a phone (about 390 px wide) and a laptop.
5. External access stays closed, and every amount stays simulated.

## Checks

| # | Area | Do this | Expect | Covers |
|---|---|---|---|---|
| 1 | Welcome | New tester: sign up through an invitation | The five welcome screens. Skip works on screens 1 to 4. Screen 4 says goals lead to an eligibility review and its badge reads "Reviewed at 5 of 5". Screen 5 says it can be replayed from Profile, Help & getting started. | Onboarding |
| 2 | Home guide | New tester: Home after setup | **Getting started** shows five steps, with the first post marked Optional. Below them, **Supporter goals** and **Creator goals** appear, each with a status. A one-time offer of the app tour sits inside the same card, and there is no other guidance card. | UAT-001-4 |
| 3 | Minimize and restore | Tap Minimize, reload the page, then tap Show | Minimized, the guide is one line that still shows both journeys, for example "Getting started 1 of 5 · Supporter 0/5 · Creator 0/5". It stays minimized after the reload. Show brings it back. | UAT-001-4 |
| 4 | Ticked from the server | New tester: follow 3 people, add one to your Clique, then save or comment on a post, and add a bio or interests | Each step ticks only after the action, on your next visit to Home. The Clique step says following doesn't add anyone to your Clique. | UAT-001-4 |
| 5 | Checklist retires, goals stay | After row 4 (no post needed) | The checklist leaves Home and the card's title becomes **Your goals**. Both journeys stay visible with their status, and the card can still be minimized and restored. Profile, Help & getting started still shows the checklist as "All done." | UAT-001-4 |
| 6 | My Split | New tester: My Split, and scroll | One page with no tabs, in this order:<br>1. Split, unlocked and locked, marked Simulated.<br>2. How My Split works.<br>3. Connection Points.<br>4. Your goals.<br>5. Recent activity.<br>6. Invite. | UAT-001-3, UAT-001-4 |
| 7 | Journeys | Collapse both journeys, then open them again; open one milestone | Collapsed, each journey still shows its title, "x of 5 goals met" and its status. The milestones open and close, the suggested one starts open, and each milestone opens to show what's left and one action. The page says: "Meeting all 5 goals starts an eligibility review. Nothing unlocks automatically…" | UAT-001-4 |
| 8 | Review states | A test member who has met all 5 goals of one journey (they go under review automatically); then the founder approves them in Control Center, Qualification review | That member sees one message: "All 5 … goals met · Your eligibility review has started", and the badge reads Under review. After approval they see one "Qualified as a …" message, and the badge reads Qualified. Locked amounts unlock only after approval. | UAT-001-4 |
| 9 | Recognition | New tester: add a creator to your Clique, then save a post | Joining the Clique shows the supporter goal's server count, such as "1 of 10". Saving shows "Save recognized", but only when the server recorded it. Only one message shows at a time. | UAT-001-4 |
| 10 | Insights | Founder, then the new tester: Profile → Your Insights | The same six sections for both: Reach, Content, Audience, Connection, Your support and Monetization. Each has What happened, What it means and What to do next, or "Not yet measured" with how to start. Reach shows **Available** and **Reached** separately. Simulated amounts appear only in My Split. | UAT-001-3 |
| 11 | Discover | New tester: Discover, then switch tabs and search | The header, search box and tabs stay in place; only the results change. Creators appear as compact rows with a reason, one line of bio, and one button that goes Follow, then Join Clique, then In Clique. Interest chips filter People. | UAT-001-3 |
| 12 | Switch off | Founder: turn progression off, look at Home and My Split as the tester, then turn it back on | No goals anywhere. Home shows only the checklist (if it isn't finished). My Split shows Connection Points, How My Split works and recent activity. | UAT-001-4 |
| 13 | Replay | New tester: Profile → Help & getting started | The checklist is there. **Take the app tour** runs five stops (Home, Discover, Create, My Split, Profile) with Skip, Back, Next and Escape. **How Splitpost works** replays the five welcome screens. | Onboarding |

**Record your result in `docs/ACCEPTANCE-CHECKLIST.md`.**
* If rows 1 to 13 behave as written, mark T3 "accepted", which also closes UAT-001-3 and UAT-001-4.
* Otherwise, list each finding with a priority from P0 to P2, and I'll fix it.

## Automated evidence (already green before staging)

Unit tests cover each check above, among them:

* "once getting started is done it leaves Home, the goals stay (with review status)…";
* "Home holds getting started and both journeys in one compact component that minimizes…";
* "each journey always shows its title, milestones met and status…";
* "Your Insights never hides a core section…";
* the app tour tests;
* "a goal met since the member last looked is acknowledged once…";
* "adding a creator to your Clique says how far the supporter goal has come…".

The browser journeys run in CI against a local Supabase.
