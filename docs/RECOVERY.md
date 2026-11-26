# Backup and recovery

How Splitpost recovers from data loss during the pilot, using only what is
already in place: Supabase's own backups, the repository, Vercel and the
GitHub Actions workflows. No new system is added.

Applies to the staging project (`kpudeppgokpjhvaqrprn`, the pilot database
once testers join) and, with its own approvals, to member Production later.
Everything financial is simulated during the pilot.

> **Status (Nov 26): not yet in force for staging.** Staging is in the Crevant
> organization on the **Free** plan, which has no backups. The objectives below
> apply once it is moved into the Splitpost Production (Pro) organization
> (`docs/INFRASTRUCTURE.md`). The deletion safeguard (below) is **built and
> demonstrated on local Supabase**, and runs in every CI run. It counts as
> complete only once the same exercise has passed on staging after its
> transfer (on Free, Edge Function logs are kept 1 day and there are no
> backups to restore).

## What protects what

| What | Where it lives | How it is recovered | Proposed recovery point (RPO) | Proposed recovery time (RTO) |
|---|---|---|---|---|
| **Database records** (accounts, profiles, posts, follows, comments, reports, moderation history, privacy requests, switches) | Supabase Postgres | Supabase daily backup, restored from the dashboard | **24 hours** (the last daily backup) | **4 hours** to restore, check and reopen |
| **Financial and rewards ledgers** (points, reviews, reversals, settlements, simulated revenue, campaign attributions) | The same database (`sim`, `ads`), append-only | The same backup, then the reconciliation must pass before reopening | **24 hours** | Included in the 4 hours |
| **Uploaded photos and videos** | Supabase Storage (`post-photos`, `post-videos`, `avatars`, `ad-creatives`) | **Not in database backups.** Storage keeps files durably (no loss from hardware failure), but a deleted file or bucket cannot be brought back | Files: none for deletions (see below). Their database rows come back with the backup | Affected posts show "This photo couldn't load" at once; no outage |
| **Security and access configuration in the database** (roles, grants, row level security, security definer functions, the account hook) | Migrations in this repository, applied by the approved workflow | In the backup, and rebuildable from the migrations; the restore drill proves they survive a restore | **0** (every change is a reviewed, recorded migration) | Checked in minutes by the staging checks run |
| **Settings outside the database** (Auth settings, Site and redirect URLs, the email sender, Storage upload limit, Edge Function secrets, Vercel variables) | Supabase and Vercel dashboards; written down in `docs/STAGING-ACCEPTANCE.md` section 2 and `docs/PILOT-ENVIRONMENT.md` | Re-entered from those steps; secrets re-issued (never restored from a copy) | **0** for the settings (documented); secrets are re-issued | **1 hour** |
| **The app itself** (front end, Edge Functions) | This repository; Vercel builds `staging`; Edge Functions are published from this repository by the reviewed workflow | Redeploy the last good commit | **0** | Minutes |

**Why 24 hours (approved Nov 26):** on Pro, Supabase takes a daily backup and keeps 7
days (member Production and the waitlist today; staging after its transfer). For a closed pilot with simulated money, losing at most a day of
activity is acceptable, and every ledger is append-only, so what is restored
always reconciles. Point-in-time recovery (an add-on, about 2 minutes RPO) is
**not** proposed for the pilot; it becomes worth its cost before real money or
a large cohort. Both are founder decisions with a cost.

**Why photos and videos have no copy (accepted for the pilot, Nov 26):** Storage is durable against hardware
loss; the remaining risk is deletion by mistake (a bucket, the project, or a
bug). Copying every file elsewhere would add a new system and, for video,
large storage costs. Proposed for the pilot: accept it, and reduce the risk
instead: only the founder can delete the project or buckets (organization
access is the founder only, with multi-factor authentication); files are
deleted only by the reviewed cleanup, which never deletes a live post's file
or held evidence (`docs/PHOTOS.md`). If members later depend on their media
(Production), revisit this with a copy of the photo bucket.

## Evidence that recovery works

* **Every CI run** (Browser job): after all 19 journeys, `scripts/db/restore-drill.sh`
  takes a full backup of the database, restores it into a new, empty database,
  and checks that every table has the same row count, that the financial and
  advertising reconciliation (`scripts/db/audit/reconciliation.sql`) passes and
  matches the original, and that the member authorization audit passes on the
  restored copy. It runs in about 3 seconds on a database holding every
  journey's data.
* **Reconciliation** can be run read-only on staging at any time (paste
  `scripts/db/audit/reconciliation.sql` into the SQL editor). Every row must say
  `ok = true`. It checks that each closed month allocates exactly its pool,
  settled points never exceed approved redeemable points, recognition points
  are never redeemed, the monthly cap held, ad clicks only follow views,
  placements are attributed correctly, frequency caps held, and every
  operational switch matches its recorded change.
* **Staging checks** (`deploy-db-staging.yml` in plan mode) rerun every
  security and separation check against the live project.

## Recovery procedure (staging, once testers are on it)

Time it from the moment the problem is noticed. Everything below is the
founder's, in the Supabase and Vercel dashboards, unless marked Claude.

1. **Stop changes** (5 minutes). Control Center, Operational switches:
   registration off, advertising off, sharing off, "Stop all video now" if
   videos are involved, each with the reason "Recovery". Members can still
   read; nothing new is written that a restore would then discard.
2. **Decide the restore point** (15 minutes). Supabase, Database, Backups:
   choose the newest backup from before the problem. Note its time. Claude
   can tell from the run logs and the reconciliation which day is clean.
3. **Restore** (about 30 to 60 minutes for a pilot-sized database). Restore
   that backup from the dashboard. The project is unavailable while it runs.
4. **Re-apply what must not come back** (30 minutes; mandatory). A restore brings back
   anything deleted after the backup point, including accounts deleted on a
   member's request. Before reopening:
   * In Supabase, Logs, Edge Functions, `post-media`, filter on
     `deletion_register` for the period from the backup time to now, and
     download the lines (JSON).
   * Claude converts them: `node scripts/db/recovery/deletion-log-to-events.mjs <download> > events.json`
     (ids and times only).
   * In the SQL editor, run `select ops.reapply_deletions('<events.json contents>'::jsonb, '<backup time>');`.
     It deletes the accounts again, marks the posts and comments deleted
     again, and re-applies any later restores. Running it twice is safe.
   * Check that none of the listed accounts exists and none of the listed
     posts or comments is visible.
   * **Deletions in the last 15 minutes before the incident** may not have
     reached the log yet (the drain runs every 15 minutes). Re-apply those from
     the request emails and Control Center notes, and keep the app restricted
     (registration paused, sharing and advertising off) until the founder
     confirms the list is complete. If the log cannot be read, the whole
     restore falls back to that, and the app stays restricted until it is done.
5. **Check** (30 minutes; Claude). Run the staging checks
   (`deploy-db-staging.yml`, plan mode) and the reconciliation. Both must pass.
   Claude compares the migration history with the repository and, if a
   migration merged after the backup, reapplies it with the normal approved
   run.
6. **Settings and secrets** (only if the project itself was lost; 1 hour).
   Re-enter the Auth, URL, sender and Storage settings from
   `docs/STAGING-ACCEPTANCE.md` section 2, issue new secrets (Resend key,
   drain key), and put them where the steps say. Never paste a secret into
   chat or a file.
7. **Reopen** (10 minutes). Turn the switches back on with the reason
   "Recovered from the backup of <time>". Tell testers that activity after
   that time (posts, likes, points) was lost and needs redoing; simulated
   points are not compensated with anything real.
8. **Record** it in `docs/DELIVERY-TRACKER.md`: what happened, the backup
   used, the time taken, and what was re-applied.

Photos and videos uploaded after the backup point stay in Storage without a
post; the cleanup leaves them alone, and they are removed at pilot close.
Posts restored whose file was deleted after the backup show "This photo
couldn't load"; their authors can delete and repost them.

## Decisions (founder, Nov 26)

* **Approved provisional pilot objectives:** RPO at most 24 hours of data
  loss; RTO restoration within 4 hours. These are pilot objectives, not
  guaranteed service commitments, and are not promised to members.
* **Accepted:** the existing database backup, restore drill, security
  verification and financial reconciliation approach.
* **Accepted for the controlled pilot only:** no separate copy of photos and
  videos, on these conditions:
  * **Disclosure to creators.** When a photo or video is attached to a post,
    the composer says: "Keep your original. During the pilot, Splitpost does
    not keep a separate backup of photos and videos." The pilot privacy notice
    draft says the same (`docs/policies/PRIVACY-NOTICE-MEMBER-DRAFT.md`).
  * **Creators keep their originals** (the same line encourages it; say it
    again in the pilot welcome).
  * **Unavailable media is handled gracefully:** a post whose photo file is
    missing shows "This photo couldn't load" with Try again, the rest of the
    feed is unaffected (the link service skips a missing file rather than
    failing the whole request), and the author can delete and repost it.
  * **Required before wider commercial launch:** a media backup and recovery
    approach (tracked in `docs/DELIVERY-TRACKER.md`, Production readiness).
* **Deleted accounts and content must not come back after a recovery.**
  Reconciling deletions is mandatory before reopening, and if it cannot be
  done reliably the restored app stays restricted (switches off, registration
  paused) until it is. See the last section: built and demonstrated locally; **complete**
  once demonstrated on staging after its transfer.
* **Infrastructure:** Vercel Pro and one Supabase Pro organization (founder).
  No further subscription or system is added for recovery.

## Deletions after a backup: the deletion register

A restore puts the database back as it was at the backup. Anything deleted
since then comes back unless it is deleted again, so recovery needs a list of
those deletions that **does not live in the restored database**.

**What existed before, checked Nov 26:**

| Record | Captures | Survives a restore? | Enough? |
|---|---|---|---|
| `ops.member_requests` and `ops.member_request_events` (the deletion request, its completion, who did it) | Founder deletions, with time | No: inside the database | No |
| `auth.audit_log_entries` | Auth API events | No: inside the database | No |
| Supabase **Auth logs** (Logs explorer) | Calls to the Auth service | Yes (7 days on Pro, 1 day on Free) | **No:** the founder deletion removes the account with a direct database delete (`app_founder_delete_member`), which never passes through the Auth service, so nothing is logged there |
| Supabase **Postgres and API logs** | Errors and requests; not statement contents by default | Yes (7 days on Pro) | No: they show that a deletion function was called, not which account or post |
| Post deletion (`app_delete_post`) | Marks the post deleted (`deleted_at`) | No: inside the database | No: a restore makes the post's text visible again (its photo file is gone for good) |
| Photo and video files (Storage) | Deleted for real by the cleanup | Yes (Storage is not restored) | Only for the files, not the posts or accounts |

Nothing existing reliably lists completed account and post deletions outside
the database, and failed deletions are not recorded anywhere (the function
either completes in one transaction or changes nothing).

**What was built (migration `20261216000000`, needs D7 approval when merged):**

1. `ops.deletion_register`: one row per completed deletion or restore of an
   account, post or comment (kind, id, deleted or restored, time). Written by
   triggers **in the same transaction** as the change, so it records exactly
   the deletions that completed, whichever function made them (member post
   deletion, moderator removal, founder account deletion). A deletion that
   fails rolls back and leaves no row. Ids and times only: no names, emails or
   content. Members cannot read it; history cannot be edited.
2. The existing 15-minute drain (the scheduled `post-media` call) writes each
   new row to the **Edge Function log** as a `deletion_register` line, then
   marks it reported. Supabase keeps those logs outside the database (7 days
   on Pro, the same as the backups), so a restore does not touch them.
   *Correction to the earlier proposal:* a private Storage copy was proposed
   first, but it would not survive a restore. Storage keeps its file index
   (`storage.objects`) in the database, so a restore would make a newer copy
   unreachable.
3. `ops.reapply_deletions(events, backup_time)`: run by the founder in the SQL
   editor (never members or the service key). It applies the logged events
   after the backup in order, skips older ones, and is safe to repeat.
4. Retention: register rows are removed by the drain 30 days after they are
   logged (four times the backup window); log lines expire after 7 days. The
   privacy notice draft names both.
5. Gap: the 15 minutes before an incident, covered by step 4 of the procedure
   (request emails, restricted app until confirmed).

**Demonstration (Nov 26, local Supabase; also every CI run):**
`scripts/db/recovery-exercise.sh` runs the real `post-media` drain in the Edge
runtime, creates two members and their posts, takes a full backup, then
deletes one account and the other member's post. The drain logs both. The
backup is restored into a new database, and the exercise shows that, without
reconciliation, the deleted account and post are back. It then reads the
deletions from the function's log (not the database), runs
`ops.reapply_deletions`, and checks that the account no longer exists (it
cannot sign in), is not visible, and neither its posts nor the deleted post
are visible. Result: **passed**. The database tests
(`supabase/tests-local/290_deletion_register.sql`) also cover rolled-back
deletions, later restores, older events, repeats and access.

**Still to do before it counts as complete:** the same exercise on staging
after its transfer to Pro, with the result recorded here.

## Founder actions this depends on

* **Move `crevant-staging` into the Splitpost Production (Pro) organization**
  (`docs/INFRASTRUCTURE.md`, section 2, item 9). Until then staging has no
  backups.
* **Approve migration `20261216000000` (D7)** when its pull request is ready, then redeploy `post-media` to staging (`docs/STAGING-ACCEPTANCE.md`, section 0).
* Keep the organization access to the founder only, with multi-factor
  authentication.
