# Reporting and moderation (Build 5, Stage 5.2a)

Status: **draft PR, local only.** Migration `20261124000000_moderation` is
staging only (not on `supabase/production-migrations.txt`) and has not been
applied anywhere. Nothing is deployed.

## What members get

* **Report** on other members' posts and profiles (never on your own).
* A short dialog that starts with a safety notice: reporting isn't an
  emergency service and isn't monitored around the clock; call 911 or the
  local emergency number if someone is in danger; call or text 988 (Canada
  and the US) for suicide or self-harm.
* Eight reasons: Spam or scam, Harassment or bullying, Hate or
  discrimination, Nudity or sexual content, Violence or threats, Self-harm,
  Impersonation, Something else. Optional details, up to 500 characters.
* Clear feedback: "Thanks for letting us know. We'll review this." The person
  reported isn't told who reported them, and content isn't removed just
  because it was reported. For threats and self-harm: "reviewed first, but
  not around the clock".
* A second report of the same thing: "You've already reported this."

## What the moderator gets

A **Moderation** link on Profile, shown only to moderators, leading to:

* **Queue:** open (or resolved) reports, safety reports first (flagged
  "Priority: safety"), then oldest first, with how many open reports each
  target has. Never who reported.
* **Report:** the reason, the reporter's details, a copy of what was
  reported, its state now (visible, hidden, deleted by its author, gone), and
  an optional note for the record.
* **Hide** (removes it for every member until restored), **Restore** (only
  what a moderator hid; never a post its author deleted) and **Dismiss**
  (closes the open reports on it, changes nothing). Each resolves every open
  report on the same target and is recorded.

## Security model

| Rule | Where it is enforced |
|---|---|
| Reporting needs active pilot membership and a complete profile | `app_report` through `social.current_member()` |
| Every moderation function needs active pilot membership AND a moderator row | `app_mod_*` through `social.current_moderator()`; staging check 009 and the member surface audit fail otherwise |
| Moderation is granted only by server code, never implied by `ops.admins` (invitation admins) | `ops.grant_moderator` (service role only); 009 fails if `ops.moderator_active` reads anything but `ops.moderators` |
| Reports, the audit trail and moderators are private | `ops` tables, row level security on, no member privileges, no policies (009, 002, the audit) |
| No member-facing function returns or takes a reporter | 009 checks every `app_*` signature; the behaviour test checks every queue and report row; the browser journey checks every answer the reported member's app receives |
| Reports never hide anything by themselves | no trigger on reports, `app_report` changes no content (009); behaviour and browser tests |
| A hidden post appears nowhere | hiding also sets `deleted_at`, which every existing function excludes; `posts_hidden_is_deleted` guarantees it (009); the behaviour test checks feed, profile, post, comments, likes, new comments, catch-up, unseen strip, counts, Discover and views for four members |
| Hidden profile details appear nowhere | the three profile detail functions return no bio, reason, identity or interests for a hidden profile; interest search skips it |
| One open report per member and target; 10 an hour, 30 a day | `app_report`, plus a unique index |
| Every moderator change and moderation action is recorded, append-only | `ops.moderator_events`, `ops.moderation_actions` (triggers refuse update, delete and truncate) |

## Granting the founder moderation (after the migration is on staging)

Not done by the migration, and not assumed from any other role. The founder
runs one statement in the **staging** project's SQL Editor (Supabase
dashboard, signed in as the founder), with their own account id from
Authentication > Users. The id is never committed or sent anywhere else.

```sql
select ops.grant_moderator('<your account id>', 'founder', 'initial moderator');
```

It refuses unless the account is confirmed and an active pilot member. It is
recorded automatically (who, when, the reason, and the database login and
role that made it). To check, without showing any id:

```sql
select action, actor, reason, db_session_user, db_role, occurred_at from ops.moderator_events order by id;
select count(*) as moderators from ops.moderators;
```

To revoke: `select ops.revoke_moderator('<account id>', 'founder', '<reason>');`
(also recorded). Moderation also stops at once if pilot membership is revoked.

## Retention (90 days) and holds

* **What is erased:** the reporter's details and the copy of what was
  reported, for reports resolved more than 90 days ago. The reason, status,
  dates and the audit trail are kept.
* **How it runs:** `ops.purge_expired_report_data()` runs inside every new
  report and every moderation queue load, and records each purge in the
  audit trail. **It is not a timer:** if nobody reports or opens the queue,
  nothing is erased until someone does. Operational task: if the queue hasn't
  been opened for a month, the founder opens it once (or runs
  `select ops.purge_expired_report_data();` in the SQL Editor). See "Known
  limitation" below for the proposed scheduled job.
* **Holds:** `select ops.set_report_hold('<report id>', true, 'founder', '<reason>');`
  keeps a report's details and copy past 90 days (legal or safety reasons);
  `false` lifts it. Both are recorded. Report ids are visible in the
  moderation page's address.

## Known limitation: retention is event-triggered, not scheduled

The 90-day erasure only runs when someone reports something or a moderator
loads the queue. If neither happens, resolved reports' details and copies
stay past 90 days until the next report or queue load. Until a scheduled job
exists, the founder's monthly task is to open the moderation queue once (or
run `select ops.purge_expired_report_data();` in the SQL Editor). Each run
that erases anything is recorded in `ops.moderation_actions`.

### Proposed for a later stage: a scheduled purge with pg_cron

Recommended: Supabase's **pg_cron** extension, running inside the staging
database itself, so it needs no secret, no GitHub runner and no approval per
run.

1. Enable pg_cron for the staging project (Dashboard > Database >
   Extensions), with the founder's approval.
2. A small reviewed migration schedules one job, daily at a quiet hour:
   `select cron.schedule('purge-report-data', '17 3 * * *', 'select ops.purge_expired_report_data()');`
3. A staging check confirms the job exists, is active, and runs exactly that
   statement; `cron.job_run_details` shows each run and any error, and the
   purge records what it erased in the audit trail.
4. A weekly read-only check (the existing health workflow pattern) fails if
   the last successful run is older than two days, so a stopped job is
   noticed.
5. The event-triggered purge stays as a second safety net.

Why not a scheduled GitHub workflow: staging jobs need the founder's
environment approval for every run, so an unattended schedule would simply
wait. An Edge Function on a timer would need a service key and a manual
deploy, which this repository avoids.

## Operational notes for the pilot

* Safety reports (threats, self-harm) are flagged and listed first. Nobody
  monitors them around the clock, and the app says so.
* If a report suggests someone is in immediate danger, contact emergency
  services; the app is not a substitute.
* Repeated or severe problems: revoke pilot membership as today
  (`docs/PILOT-ACCESS.md`), which removes the member and all their content
  from every member at once.
* Comments can't be reported yet (posts and profiles only).
* The author of hidden content isn't notified in the app; contact them
  directly if needed.

## Rollout and compatibility

* Additive, except that the three profile detail functions now also respect
  hidden profiles (same signatures). The app already deployed keeps working.
* The new app hides Report and Moderation on a database without the
  migration (only on a definite "function not found").
* Every staging check is state-aware: before the migration, 009 confirms
  none of it exists; after, every check must pass.
* Deploy path: the ordinary "Deploy database to staging" (plan, then apply),
  as for 5.1. Then the founder grant above, then the Preview update.
* Rollback: `scripts/db/staging-rollback-moderation.sql` (phrase
  `REMOVE THE STAGING MODERATION`), tested by
  `scripts/db/rollback-moderation-test.sh`. It refuses once any moderator,
  report, action or hidden item exists: those are safety and audit records,
  so problems are fixed forward. No workflow runs it on staging yet.

## Acceptance checklist

| # | Criterion | Evidence |
|---|---|---|
| 1 | Report a post and a profile with a reason and optional details; clear feedback | unit tests; browser journey |
| 2 | Safety notice before every report; not an emergency service; not 24/7 | unit test; browser journey |
| 3 | Duplicate reports refused politely; 10 an hour, 30 a day; no self-reports | behaviour test 085 sections 2; unit test |
| 4 | Threats and self-harm flagged and listed first | 085; unit and browser tests |
| 5 | Nothing hidden because of reports alone | 085; 009; browser journey |
| 6 | Every moderation function needs membership and a moderator row; invitation admins aren't moderators | 085 section 1; 009; audit; integration |
| 7 | Reported members can't identify reporters through any member-facing API | 009; 085 section 3 and 4; browser journey (every answer the reported member receives) |
| 8 | Hidden posts don't reappear in feeds, profiles, posts, comments, likes, catch-up, counts, Discover or views | 085 section 5 (four members); browser journey |
| 9 | Hidden profile details don't appear on profiles, Discover, interest search or suggestions | 085 section 6 |
| 10 | Restore returns hidden content; never revives author-deleted posts; Dismiss changes nothing | 085; unit and browser tests |
| 11 | Append-only audit trail of every moderator change and moderation action | 085 sections 1, 7, 9; 009; violation 99 |
| 12 | 90-day erasure of resolved report data, holds respected and recorded | 085 section 8 |
| 13 | Founder moderation granted by server code only, recorded | 085 section 1; browser journey |
| 14 | WCAG 2.2 AA on the report dialog, queue and report page; no sideways scrolling at 390 and 320 px | browser journey (axe-core) |
| 15 | Earlier features unchanged | all earlier unit, integration, rollback and browser suites pass |

## Founder test (after approval, deployment and the grant)

1. With a second granted account, report one of your posts as "Spam or
   scam" and your profile as "Self-harm". Check the safety notice and the
   "already reported" message on a second try.
2. As yourself, open Profile > Moderation. The self-harm report is first,
   flagged "Priority: safety". No report shows who sent it.
3. Open the post report, add a note, **Hide**. From the second account, the
   post is gone from Home, your page and its own link.
4. **Restore** it; it's back. **Dismiss** the profile report; nothing changes.
5. In the SQL Editor: `select action, note, occurred_at from ops.moderation_actions order by id;`
   shows hide, restore, dismiss.
6. With an account that isn't a moderator, `/app/moderation` says the page
   isn't available.
