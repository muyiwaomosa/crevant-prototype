# SP-UX-REFINE-001: experience refinements before pilot release

Founder acceptance feedback, Nov 27. Design previews for approval before
implementation: `previews.html` in this folder, and the images beside it
(`my-split-phone.png`, `recognition-phone.png`, `my-split-desktop.png`,
`walkthrough-phone.png`, `first-use-tips.png`). Sample people and amounts.

Scope rule for every item below: no new point rules, weights, leaderboards,
financial incentives or qualification thresholds. Everything reads what the
approved progression engine (SP-PRG-001, migrations 20261217 to 20261219)
already records. No migration is needed for UX-03, UX-04 or UX-05.

## UX-01 Home settings

Home today has no settings section in the code (checked Nov 27 on the current
build, as founder and as a member, phone and desktop). What appears near Home:

* **Desktop:** the sidebar footer, under the navigation: your @username, a
  "Your account" link and the line "Splitpost pilot. Invitation-only, for
  adults 18 and older." It is on every page, not only Home.
* **Phone:** "Feedback" and "Your account" in the header, also on every page.
* **Profile** has the settings list (Your Clique, Saved posts, Notices, Your
  account, Your data and privacy, Advertise with Splitpost, then Moderation
  for moderators, Advertising and Control Center for the founder).

Proposed change, pending the founder's confirmation of which block was meant:
remove the desktop sidebar footer and the phone header's "Your account"
(account is reached from Profile, Settings, as it already is), and keep
Feedback. The pilot line moves to Your account. Permissions are unchanged:
each link keeps its own check.

## UX-02 Video readiness

Confirmed: video creation is hidden because the device gate is outstanding.
The composer offers video only while the "New video uploads" switch is on, and
the server refuses to turn it on until both the iPhone Safari and the Android
Chrome results are recorded as passed and the storage cap is set (staging
check 029). Nothing here bypasses that.

Shortest path (about an hour per phone, `docs/video/DEVICE-TEST.md`):

1. On each phone, sign in to the staging app and open Control Center, Video
   posts, the "Video device test" link (`/app/video-test`).
2. Upload a 1 minute and a 5 minute clip, play each back, repeat the 1 minute
   clip on mobile data (Android: also an HEVC clip). Press Copy results.
3. Control Center, Video posts: record each device as Passed with the copied
   results, set the cap (50 GB, approved), then turn on "New video uploads"
   in Operational switches with a reason. Staging only.

## UX-03 Gamification visibility

**State on staging:** on Nov 27 at 00:15 UTC (run 50) the progression switch
was off, the approved creator and supporter goals were recorded, and there
were 0 qualifications. Goals, recognition and review work end to end locally
and in CI (progression journey). A read-only staging check (run 51) reports
the current state once approved. While the switch is off, My Split shows the
earlier points view and no goals; turning it on in Control Center is the
founder's call (founder testing guide, before you start).

Proposed, using only the existing engine (previews 5 and 6):

| Need | Proposal | Reads |
|---|---|---|
| Immediate recognition | A short message after a contribution the server recognizes: "Thoughtful comment recognized. It counts toward your supporter goals: 22 of 30." Nothing for a contribution that is not recognized | The points ledger entry the server already writes; the goal step it counts toward |
| Visible progress | Each journey as a ring (goals done out of total) and each open goal as a bar with its count | Goal steps already returned to My Split |
| Goal completed | Shown once, at the top of My Goals: "Goal complete: Post in different weeks. 3 of 3 weeks. That's 3 of your 5 creator goals done." When every goal is met: "You've met every goal. We're checking it, then your split unlocks." | Step met; qualification status |
| Clear next action | One link per open goal, to where it is done: Create post, Find a post to support, Your Clique, Discover, Share your invitation link | Goal metric |

## UX-04 My Split

Three faces in the approved full-screen transition, in this order:

1. **My Split** (opens here): "Your split so far" with the total; As a creator
   and As a supporter; Unlocked and Locked on one bar; "Simulated" on the card;
   one plain sentence: "Locked means you've earned it, but it's held until you
   reach your goals. Reach them and it unlocks. During the pilot nothing is
   paid." Then "What do these mean?" (collapsed) and "Next for you" (the
   nearest journey and its next action).
2. **My Goals**: creator goals and supporter goals as above.
3. **My Activity**: Connection Points with "Recognition for how you help
   creators grow. Not money.", recent contributions with their status, ways to
   contribute; the full history and settled statements one tap deeper (today's
   History and Opportunities faces).

"What do these mean?" text:

* **Your split** is everything you've accumulated on Splitpost: as a creator,
  from ads shown with your posts, and as a supporter, for helping creators grow.
* **Locked** is earned but held until you reach your goals for that journey.
* **Unlocked** is yours once your goals are met and checked.
* **Settled** is what a monthly statement has closed. You'll see it under My
  Activity.
* **Simulated** means these are practice amounts for the pilot. Points are not
  money and nothing is paid.

Unchanged: the economic rules, the 40:20:40 split and its legal-review
safeguard (no percentages shown), the founder's review tools, the amounts and
their states. While progression is off, the My Split face shows Connection
Points and the simulated estimate instead of locked and unlocked amounts.

## UX-05 New member education

**Welcome walkthrough:** five screens after first-time setup (the existing
setup, already recorded once per account, so it is not shown twice). "Skip"
on every screen. Opened again from Profile, Settings, "How Splitpost works".

| # | Title | Text | Button |
|---|---|---|---|
| 1 | Welcome to Splitpost | A social platform where the value you help create is shared. Creators earn from their audience, and supporters earn for helping the creators they value grow. | Next |
| 2 | Build your Clique | Follow the creators you value, then choose the ones you want closest for your Clique. Their new posts come first on Home. You can change your Clique at any time. | Next |
| 3 | Contributions that count | A thoughtful comment, a save, a repost or a share helps a creator grow, and Splitpost recognizes it. Quick likes are welcome too; they just don't count toward your split. | Next |
| 4 | Connection Points and goals | Recognized contributions earn Connection Points. Your goals show what to do next. When you reach every goal for a journey, we check it and your split unlocks. | Next |
| 5 | Your split, unlocked | My Split shows what you've accumulated as a creator and as a supporter. It stays locked until you reach your goals. During the pilot everything is simulated: points are not money and nothing is paid. | Start exploring |

Under screen 5: "You can see this again any time in Profile, Settings, How
Splitpost works."

**First-use tips** (one each, "Got it" hides it on that device):

* **My Split:** "This is your split: what you've accumulated so far, simulated
  during the pilot. Locked amounts unlock when you reach your goals under My
  Goals."
* **Clique:** "Your Clique is the creators you want closest. Their new posts
  come first on Home, and supporting them counts toward your supporter goals.
  Add or remove people at any time."

## Decisions needed

1. UX-01: confirm the block meant (desktop sidebar footer and phone header
   "Your account", as proposed), or point to it on a screenshot.
2. UX-03 to UX-05: approve the previews and wording, with any changes.

Once approved, the work is front end only (no migration), about three days
including tests, inside the December 10 interface target.
