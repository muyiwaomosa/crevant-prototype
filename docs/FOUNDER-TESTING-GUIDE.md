# Founder acceptance procedure: the complete MVP on staging

**One URL:** https://splitpost-app-git-staging-crevant.vercel.app

Updated Nov 27 for staging at commit `00ee129`: the approved MVP with the
SP-UAT-001 remediation (approved interface restored, gamification visible
throughout the app). One procedure covers every area you accept: **interface,
onboarding, gamification, My Split, publishing and video**. Part A prepares
staging, part B is the member journey, part C is publishing, part D is the
video device validation, and part E is the sign-off sheet. Checklist items:
T1 to T5 in `docs/ACCEPTANCE-CHECKLIST.md`.

Staging sits behind Vercel sign in, so open it in a browser where you are
signed in to Vercel. Everything on staging is a test: all money is simulated,
nothing is paid, and Production stays closed.

Allow about 2 hours for parts A to C and E, and half a day for part D (it
can be a different day). Use your own phone for steps 1 to 11 and a laptop for
step 12. You need two test accounts: your founder account and one tester.
Invite the tester with your invitation link from **Profile, Settings, Your
account**. Anything that looks wrong goes in **Feedback** (top of every
screen), with a screenshot if you can.

The full checklist, with what Claude has already verified and what needs you,
is in `docs/ACCEPTANCE-CHECKLIST.md`.

## A. Before you start (5 minutes)

1. **Check staging is the latest build (live deployment verification).**
   Always in a **private window** (signed in to Vercel there): open
   `view-source:` followed by the staging address, and find
   `<meta name="splitpost-commit" content="00ee129" />`. A normal window can
   show a cached older page (on Nov 27 it showed `9d17683` while the address
   was serving `00ee129`). Any other value in a private window means Vercel
   has not finished deploying; wait a minute and reload. This check is
   required at the start of every acceptance session and after every
   deployment, on staging and on app.splitpost.ca.
2. The read-only database check already passed (run 52, Nov 27): staging
   isolation, every migration through 20261219, the switches. Nothing to do.
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

## B. The member journey (about 90 minutes)

| # | Where | Do this | You should see |
|---|---|---|---|
| 1 | Join | Open your invitation link in a private window and sign up as the tester | Registration, then the **welcome walkthrough**: five faces ("Don't just post. Get your split.", "Your people. Your feed.", "Your support counts.", "Grow. Qualify. Earn.", "Make it yours."). Try Back, Continue and swipe; Skip works on every face; the last face says Get started |
| 2 | Setup | Pick a username, display name and one or two interests, or skip | Then Home. Setup and the walkthrough never show again on their own |
| 3 | Home | Look at Home as the tester | No title and no composer; your Clique row at the top; a compact **goal strip** (your supporter goals, the next step and Go, with X to hide it for the day); **first steps** for a new member, worded for the interest you picked, saying they also start your supporter goals. Text posts are set large on a soft brand colour; members without a photo show initials on a brand tint |
| 3a | Discover hint | Open Discover as the tester | A short hint under the search says which supporter goal following creators counts toward, and where you stand |
| 4 | Discover | Tap the first step's Discover button, then try For you, People and Topics, and search for your founder username | Creators for your interest first; each way in opens a focused view; your founder profile is found |
| 5 | Profile (theirs) | Open your founder profile; Follow, then Add to Clique | Counts, Following and In your Clique; "···" holds Report and Block. Back on Home, the matching first steps are ticked (Follow them needs three follows) |
| 6 | Create | As the founder, tap the + button and publish a post with a topic | A full-screen **New post**: close at the top left, Post at the top right, your name and "Available to all your followers", then the text and Add photo. After posting, the post opens and a short message shows your creator goal for original posts with its new count (from the server). It appears first on the tester's Home |
| 7 | Engage | As the tester: like, comment, save, share and repost it. Open "···" on the post and look at Report (cancel it) | After a comment, save, share or repost, a short message: "… recognized", with what it counts toward (your supporter goals and where you stand, such as "2 of 10"). Report sits only in the "···" menu and only on other people's posts |
| 8 | Clique | Tester: Profile, Settings, Your Clique | The founder listed under My Clique and Following, with Remove, Mute and Unfollow. A one-time tip explains the Clique |
| 9 | My Split | Tester: My Split, then My Goals and My Activity | **My Split**: your split (creator and supporter, unlocked and locked, Simulated), then **Your next goal** straight under it: where you are, what's left, why it matters and one action. **My Goals**: each journey with what's left (in any order, the closest marked Suggested next, each with a bar, what remains and an action) and what's done. **My Activity**: Connection Points, **Your achievements** (goals met) and your contributions. No 40:20:40 percentages appear |
| 10 | Profile and insights | Founder: Profile | A cover band with your picture over it, Edit profile and See as others do, the **Your insights** card (Reach, Connection, Earnings labelled Simulated, or "Not yet" before there is anything to show) and your posts as a grid; tap a tile to open the post. Then open the tester's profile: the same grid, Follow and the "···" menu |
| 11 | Welcome again | Tester: Profile, Settings, How Splitpost works | The same five faces, ending with Done instead of Get started |
| 12 | Control Center | Founder, on a laptop: Control Center | The review queue marks each case Routine or Flagged with the reason and how long it has waited, plus turnaround and revocations. Approving stays a manual click with a reason. Insights shows Activation for creators, consumers and advertisers, plus the previous consumer metric until Dec 26 |
| 13 | Deletion | Tester: Profile, Settings, Your data and privacy, Delete my account (don't send it unless you mean to) | Before confirming, a box lists the recognition points removed, the eligible points cancelled and the simulated earnings closed, and says this pilot rule is not how real earnings would be treated |

## C. Publishing (15 minutes)

Text posts are accepted already (Nov 26); this covers photos and the full
publishing loop with progression on.

| # | Do this | You should see |
|---|---|---|
| C1 | As the founder, + then Add photo: pick a photo from your phone, add a caption and a topic, Post | The photo preview with "Keep your original" beside it; after Post, the post opens with the photo, and the creator goal message with its new count |
| C2 | Refresh, then open Home as the tester | The photo still shows; the post is first on the tester's Home with your picture and name |
| C3 | As the tester, try to post a photo | Founder-only by default: the tester can post text, not photos, unless you widened it in step A4 |
| C4 | As the founder, delete the photo post from its "···" menu | It disappears for both of you; Claude can confirm the files are cleaned up within 15 minutes |
| C5 | Change your profile picture, then refresh | The new picture on Profile, on your posts and in the tester's Clique row |

## D. Video device validation (optional since Nov 27; for diagnosis)

Since the founder's release decision (Nov 27, migration 20261220000000) these
tests no longer gate video: the switch needs only the 50 GB cap. Use them to
diagnose a phone members report problems with.

Video uploads stay off until this passes; everything else works without it.
The full procedure is `docs/video/DEVICE-TEST.md`. In short:

1. On staging, open `/app/video-test` on an **iPhone (Safari)** and an
   **Android phone (Chrome)**. On each, upload a 1 minute and a 5 minute
   clip recorded with the camera app, play each back with sound, and repeat
   the 1 minute clip on mobile data. On Android, also try a 30 second HEVC
   clip.
2. On a computer, upload one `.MOV` and one `.MP4` and play them.
3. Press **Copy results** after each device and paste them into Feedback.
4. Control Center, **Video posts**: record each device as Passed or Did not
   pass (with the copied results in Notes), then set the storage cap to
   **50 GB**.
5. Only if both phones passed: Operational switches, **New video uploads**
   on, staging only, with a reason. The server refuses it otherwise.
6. Post one video as the founder and watch it as the tester.

**Pass:** both phones check, convert (or pass through), upload and play both
clips; the computer plays both files; the posted video plays for the tester.
If a phone does not pass, record it anyway: the pilot can open with text and
photos and video follows later, with no code change.

## E. Sign-off sheet

Mark each area **Accepted**, **Accepted with findings** (list the Feedback
items) or **Not accepted**, and send it to Claude, who records it in the
checklist. Claude fixes P0 and P1 the same day; P2 items are fixed or
accepted by you before release.

| Area | Steps | Accepted when |
|---|---|---|
| Onboarding | B1, B2, B11 | The five faces, Skip, Back, Continue, swipe and Get started work; setup can be skipped; the walkthrough is available again from Settings |
| Interface | B3 to B5, B8, B10, B12 | Home, Discover, profiles and Control Center match the approved designs on your phone and laptop; nothing overlaps, clips or scrolls sideways |
| Gamification | B3, B3a, B6, B7, B9 | Goal strip, Discover hint, publish and contribution messages and the My Goals path all reflect what you just did, in any order; nothing claims progress the server did not record |
| My Split | B9, B13 | Split, Goals and Activity read clearly; every amount says Simulated; no percentages; the deletion preview explains the pilot rule |
| Publishing | B6, C1 to C5 | Text and photo posts publish, show for followers, survive a refresh and delete cleanly; profile pictures update everywhere |
| Video | D1 to D6 | Both phones pass and a posted video plays, or you decide the pilot opens without video |
| Speed and comfort | During B | Sign-in about 2 s and Home about 3 s on your phone with Wi-Fi off; Reduce Motion stops the sliding |

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
The consolidated release list: `docs/ACCEPTANCE-CHECKLIST.md`.
