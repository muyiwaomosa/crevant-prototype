# Development backlog

The order the founder has set for the pilot builds, and smaller items
recorded so they aren't lost. A build starts only after its plan is
approved.

## Builds

| Build | Status | Scope |
|---|---|---|
| 5.1 Richer profiles and interests | on staging | identity, interests, bio, follow reason, Discover by interest |
| 5.2a Reporting and moderation | on staging | reports, founder moderation, audit trail, 90-day retention |
| 5.2b Profile pictures and profile experience | on staging | private avatars with server-side decode and re-encode, crop and zoom, avatars everywhere; Clique confirmation fix; consistent follow and Clique feedback |
| 5.2c User feedback and feature requests | **in review** | Send feedback (header on phones, sidebar on larger screens), three categories, safe feature context, founder-only inbox with status and private notes; required before external pilot invitations (`docs/FEEDBACK.md`) |
| 5.3 Photo publishing | next, after its performance spike | one photo per post, server-side re-encode, larger view; plan in `docs/MEDIA_PLAN.md` |
| 5.4 Video publishing | after 5.3, after its device investigation | one video per post on Supabase Storage, direct authorised uploads, quotas and monitoring; HEVC and captions decisions open (`docs/MEDIA_PLAN.md`) |
| Splitpost Flip | future discovery feature | both app-level and post-level insights; details to be defined. Not part of 5.2b |

5.2c, 5.3 and 5.4 are one sprint with separate PRs, migrations, staging
deployments and acceptance gates.

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
| Picture links: refetch when an image fails, and on returning to the tab | 5.2b acceptance | not a blocker; a changed picture can show initials in other open sessions for up to 50 minutes until a reload; planned with the shared media link cache in 5.3 |
| Feedback retention closeout | 5.2c | the founder runs the closeout checklist within 30 days of the pilot evaluation formally closing (`docs/FEEDBACK.md`) |
| Publish the pilot privacy notice feedback wording | 5.2c | approved wording in `docs/PRIVACY-NOTICE-PILOT-FEEDBACK-DRAFT.md`; its own reviewed PR and notice version; **required before external invitations** |
