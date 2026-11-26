# Founder testing guide: the complete member journey on staging

**One URL:** https://splitpost-app-git-staging-crevant.vercel.app

Staging sits behind Vercel sign in, so open it in a browser where you are
signed in to Vercel. Everything on staging is a test: all money is simulated,
nothing is paid, and Production stays closed.

Allow about 90 minutes. Use your own phone for steps 1 to 8 and a laptop for
step 9. You need two test accounts: your founder account and one tester
(invite the tester with your invitation link from Profile, Your account).
Anything that looks wrong goes in **Feedback** (top of every screen), with a
screenshot if you can.

## Before you start (5 minutes)

1. Confirm migration 20261219000000 is applied on staging (Claude reports this
   after the D7 approval and the staging run).
2. **Turn on progression for staging.** Control Center, Operational switches,
   **Progression**, with a reason such as "founder acceptance, Nov 26". The
   approved SP-PRG-001 v1.0 goals are already recorded, so goals start
   counting as soon as it is on. This affects staging only. Production and
   ordinary pilot members are not touched.

## The journey

| # | Where | Do this | You should see |
|---|---|---|---|
| 1 | Join | Open your invitation link in a private window and sign up as the tester | Short setup (username, display name, interests), then Home. Setup can be skipped and never shows again |
| 2 | Home | Look at Home as the tester | No title and no composer; your Clique row at the top; three first steps for a new member; immersive post cards |
| 3 | Discover | Tap Discover. Try For you, People and Topics, then search for your founder username | "Ways into Discover" first; each opens a focused view; your founder profile is found |
| 4 | Profile (theirs) | Open your founder profile from Discover; Follow, then Add to Clique | Counts, Following and In your Clique; "···" holds Report and Block |
| 5 | Create | As the founder, tap the + button and publish a post with a topic | The post opens on its own page and appears on the tester's Home |
| 6 | Engage | As the tester: like, comment, save, share and repost it. Open "···" on the post and look at Report (cancel it) | Counts update; Report sits only in the "···" menu and only on other people's posts |
| 7 | Clique | Tester: Profile, Settings, Your Clique | The founder listed under My Clique and Following, with Remove, Mute and Unfollow |
| 8 | My Split | Tester: My Split. Founder: Profile, Your insights, then Reach, Connection and Earnings | The tester sees the week, Connection Points and goals (now that progression is on), all labelled Simulated. The three faces each open full screen: what happened, what it means, what to do next |
| 9 | Control Center | Founder, on a laptop: Control Center | The review queue marks each case Routine or Flagged with the reason and how long it has waited, plus turnaround and revocations. Approving stays a manual click with a reason. Insights shows Activation for creators, consumers and advertisers, plus the previous consumer metric until Dec 26 |
| 10 | Deletion | Tester: Your account, Privacy, Delete my account (don't send it unless you mean to) | Before confirming, a box lists the recognition points removed, the eligible points cancelled and the simulated earnings closed, and says this pilot rule is not how real earnings would be treated |

## When you are done

* Send any defects through Feedback; Claude picks them up from the inbox.
* Leave progression on for further staging testing, or turn it off with a
  reason. Either way, nothing reaches ordinary members or Production.
* Reference screenshots of every screen above, on a phone and a desktop:
  `docs/design/acceptance/sheet-phone.png` and `sheet-desktop.png`.

Full setup detail and earlier journeys: `docs/STAGING-ACCEPTANCE.md`.
