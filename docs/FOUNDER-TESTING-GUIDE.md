# Founder testing guide: the complete member journey on staging

**One URL:** https://splitpost-app-git-staging-crevant.vercel.app

Updated Nov 27 for staging at commit `6023da7`. This is the approved MVP
experience with SP-UX-002: the welcome walkthrough, personalized first steps,
My Split as three faces (My Split, My Goals, My Activity), Connection Goals
and Connection Points feedback.

Staging sits behind Vercel sign in, so open it in a browser where you are
signed in to Vercel. Everything on staging is a test: all money is simulated,
nothing is paid, and Production stays closed.

Allow about 90 minutes. Use your own phone for steps 1 to 11 and a laptop for
step 12. You need two test accounts: your founder account and one tester.
Invite the tester with your invitation link from **Profile, Settings, Your
account**. Anything that looks wrong goes in **Feedback** (top of every
screen), with a screenshot if you can.

The full checklist, with what Claude has already verified and what needs you,
is in `docs/ACCEPTANCE-CHECKLIST.md`.

## Before you start (5 minutes)

1. **Check staging is the latest build.** Open staging, View Source (or on a
   phone, open `view-source:` before the address), and find
   `<meta name="splitpost-commit" content="6023da7" />`. Any other value
   means Vercel has not finished deploying; wait a minute and reload.
2. **Approve the read-only database check** (run 52) if you have not: it
   confirms staging isolation, every migration through 20261219, and the
   switches. Claude reports the result.
3. **Turn on progression for staging.** Control Center, Operational switches,
   **Progression**, with a reason such as "founder acceptance, Nov 27". It is
   a founder-only control by design, so only your signed-in session can
   change it. The approved SP-PRG-001 v1.0 goals are already recorded, so
   goals start counting as soon as it is on. This affects staging only.
   Production and ordinary pilot members are not touched, and every
   safeguard stays in place: amounts are simulated, qualification approval
   is a manual click with a reason, holds and daily caps apply, and no cash
   can move.
4. **Optional, to test the media-led experience with testers: let staging
   testers post photos.** Photo posting is founder-only by default
   (`photos_audience = founder`), so testers can only post text. Widening it
   is a server-only, recorded action with an explicit phrase, on **staging
   only**. In the staging project's SQL editor (Supabase, project
   `kpudeppgokpjhvaqrprn`):

   ```sql
   select ops.set_photo_audience('founder', 'members', 'OPEN PHOTO POSTING TO ALL MEMBERS');
   select photos_enabled, photos_audience from ops.media_settings;
   ```

   The check should read `t`, `members`. Only invited staging members exist,
   so nobody outside the pilot gains anything; member Production is a
   separate project and stays founder-only (`invitationsApproved` is false).
   The 600 KB photo limit, the storage cap, moderation and deletion are
   unchanged. To return to founder-only (no phrase needed):
   `select ops.set_photo_audience('founder', 'founder');`

## The journey

| # | Where | Do this | You should see |
|---|---|---|---|
| 1 | Join | Open your invitation link in a private window and sign up as the tester | Registration, then the **welcome walkthrough**: five faces ("Don't just post. Get your split.", "Your people. Your feed.", "Your support counts.", "Grow. Qualify. Earn.", "Make it yours."). Try Back, Continue and swipe; Skip works on every face; the last face says Get started |
| 2 | Setup | Pick a username, display name and one or two interests, or skip | Then Home. Setup and the walkthrough never show again on their own |
| 3 | Home | Look at Home as the tester | No title and no composer; your Clique row at the top; a compact **goal strip** (your supporter goals, the next step and Go, with X to hide it for the day); **first steps** for a new member, worded for the interest you picked, saying they also start your supporter goals. Text posts are set large on a soft brand colour; members without a photo show initials on a brand tint |
| 4 | Discover | Tap the first step's Discover button, then try For you, People and Topics, and search for your founder username | Creators for your interest first; each way in opens a focused view; your founder profile is found |
| 5 | Profile (theirs) | Open your founder profile; Follow, then Add to Clique | Counts, Following and In your Clique; "···" holds Report and Block. Back on Home, the matching first steps are ticked (Follow them needs three follows) |
| 6 | Create | As the founder, tap the + button and publish a post with a topic | A full-screen **New post**: close at the top left, Post at the top right, your name and "Available to all your followers", then the text and Add photo. After posting, the post opens and a short message shows your creator goal for original posts with its new count (from the server). It appears first on the tester's Home |
| 7 | Engage | As the tester: like, comment, save, share and repost it. Open "···" on the post and look at Report (cancel it) | After a comment, save, share or repost, a short message: "… recognized", with what it counts toward (your supporter goals and where you stand, such as "2 of 10"). Report sits only in the "···" menu and only on other people's posts |
| 8 | Clique | Tester: Profile, Settings, Your Clique | The founder listed under My Clique and Following, with Remove, Mute and Unfollow. A one-time tip explains the Clique |
| 9 | My Split | Tester: My Split, then My Goals and My Activity | **My Split**: your split (creator and supporter, unlocked and locked, Simulated), then **Your next goal** straight under it: where you are, what's left, why it matters and one action. **My Goals**: each journey with what's left (in any order, the closest marked Suggested next, each with a bar, what remains and an action) and what's done. **My Activity**: Connection Points, **Your achievements** (goals met) and your contributions. No 40:20:40 percentages appear |
| 10 | Insights | Founder: Profile, Your insights, then Reach, Connection and Earnings | Your creator view, with Earnings labelled Simulated |
| 11 | Welcome again | Tester: Profile, Settings, How Splitpost works | The same five faces, ending with Done instead of Get started |
| 12 | Control Center | Founder, on a laptop: Control Center | The review queue marks each case Routine or Flagged with the reason and how long it has waited, plus turnaround and revocations. Approving stays a manual click with a reason. Insights shows Activation for creators, consumers and advertisers, plus the previous consumer metric until Dec 26 |
| 13 | Deletion | Tester: Profile, Settings, Your data and privacy, Delete my account (don't send it unless you mean to) | Before confirming, a box lists the recognition points removed, the eligible points cancelled and the simulated earnings closed, and says this pilot rule is not how real earnings would be treated |

## When you are done

* Send any defects through Feedback; Claude picks them up from the inbox.
* Leave progression on for further staging testing, or turn it off with a
  reason. Either way, nothing reaches ordinary members or Production.
* Reduced motion: with your phone's Reduce Motion setting on, the walkthrough
  changes faces without sliding.
* Reference screenshots: `docs/design/ux-refine/` (walkthrough, first steps,
  My Split faces) and `docs/design/acceptance/sheet-phone.png` and
  `sheet-desktop.png` (the rest of the app).

Full setup detail and earlier journeys: `docs/STAGING-ACCEPTANCE.md`.
