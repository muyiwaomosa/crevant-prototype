# Development backlog

The order the founder has set for the pilot builds, and smaller items
recorded so they aren't lost. A build starts only after its plan is
approved.

## Builds

| Build | Status | Scope |
|---|---|---|
| 5.1 Richer profiles and interests | on staging | identity, interests, bio, follow reason, Discover by interest |
| 5.2a Reporting and moderation | on staging | reports, founder moderation, audit trail, 90-day retention |
| 5.2b Profile pictures and profile experience | **in review** | private avatars with server-side decode and re-encode, crop and zoom, avatars everywhere; Clique confirmation fix; consistent follow and Clique feedback |
| **5.2c User feedback and feature requests** | **next; required before external pilot invitations** | see below |
| 5.3 Photo and video posts | later | needs 5.2b's validation pipeline extended to post media |
| Splitpost Flip | future discovery feature | both app-level and post-level insights; details to be defined. Not part of 5.2b |

### 5.2c User feedback and feature requests (must ship before external pilot invitations)

Goal: every invited member can tell the team what's broken, confusing or
missing, from inside the app, and the founder can review it in one place.

* **Send feedback** from Profile (and a small link on the empty Home and in
  setup's last step): a category (Something's broken, Something's
  confusing, Idea or feature request, Other), a message (up to 1,000
  characters) and, optionally, the page it was sent from. No screenshots
  in the first version.
* Clear confirmation ("Thanks. We read every message.") and a short note
  that it isn't for urgent safety issues (link to Report and the safety
  notice).
* Stored privately (`ops`), never visible to other members; rate limited
  (for example 10 a day); active pilot membership required, like every
  member function.
* A founder-only **Feedback** inbox next to Moderation: newest first, filter
  by category, mark as read, add a private note, and a status (new,
  planned, done, won't do). Recorded like moderation actions.
* Retention and privacy wording agreed before launch; included in the
  pilot privacy notice.
* Acceptance: a tester can send each category from a phone; the founder
  sees it within seconds; no other member can read it; database,
  integration, browser and accessibility tests as for 5.2a.

## Smaller items (not scheduled)

| Item | Found in | Notes |
|---|---|---|
| Scheduled 90-day report purge (pg_cron) | 5.2a | proposal in `docs/MODERATION.md`; needs the extension enabled |
| Report comments | 5.2a | only posts and profiles can be reported today |
| Tell authors when a moderator hides their post | 5.2a | the founder contacts them by hand for now |
| Staging rollback workflows for 5.1 and 5.2a | 5.1, 5.2a | scripts and tests exist; no workflow runs them on staging |
| Preview access for testers (Vercel Authentication) | tester grants | founder decision: shareable link, team access or password protection |
| Move the Preview to a long-lived branch | Build 4 | replaces `claude/pilot-membership-integration` |
| Close superseded PRs #76 and #77 | Build 4 | unmerged by design |
| Clean up storage objects of deleted accounts | 5.2b | done in 5.2b: the moderator's monthly "Picture storage" cleanup removes them |
| Scheduled picture-storage cleanup | 5.2b | today a monthly moderator task; could join the pg_cron proposal |
| Confirm hosted CDN behaviour for deleted pictures | 5.2b | unverified: how long a deleted file may still be served from cache on hosted staging |
| HEIC photos on Android Chrome | 5.2b | may not open; the editor asks for another photo |
| Undo after unfollow or removing from the Clique | 5.2b audit | approved for the backlog, not 5.2b |
