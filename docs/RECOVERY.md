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
> (`docs/INFRASTRUCTURE.md`). The deletion safeguard below is **not complete**:
> today's records cannot reliably say what was deleted after a backup.

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
   member's request. Re-delete every account and post deleted after the backup
   time, from the deletion register's Storage copy (next section), and check
   none is visible. **Until the deletion register exists, keep the restored app
   restricted** (registration paused, sharing and advertising off) and
   re-apply deletions from the request emails and Control Center notes, with
   the founder confirming the list is complete before reopening.
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
  paused) until it is. See the next section: this safeguard is **not complete**
  until the proposal there is built and demonstrated.
* **Infrastructure:** Vercel Pro and one Supabase Pro organization (founder).
  No further subscription or system is added for recovery.

## Deletions after a backup: what exists today, and the proposal

A restore puts the database back as it was at the backup. Anything deleted
since then comes back unless it is deleted again, so recovery needs a list of
those deletions that **does not live in the restored database**.

**What exists today, checked Nov 26:**

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

**Proposal (simplest reliable, existing infrastructure only), needs approval:**

1. A small append-only table, `ops.deletion_register`: what was deleted
   (account or post), its id, and when. Written **in the same transaction** as
   the deletion, by the founder deletion function, by post deletion and by
   moderator removal, so it records exactly the deletions that completed. A
   deletion that fails rolls back and leaves no row, so there is nothing
   partial to reconcile. It holds ids and times only: no names, emails or
   content.
2. The existing 15-minute media drain (the scheduled call to the `post-media`
   function) also copies any new register rows to a private Storage object,
   `ops-deletions/<date>.ndjson`. Storage is **not** rolled back by a database
   restore, so the copy survives it. Only the service key can read it.
3. After a restore, before reopening: Claude reads the Storage copy, deletes
   again every account and post it lists after the backup time, then checks
   that none of them exists or is visible. Deletions in the last 15 minutes
   before an incident may not have been copied yet. For that window the
   procedure falls back to the request emails and Control Center notes, and
   the app stays restricted until the founder confirms none is missing.
4. Retention: kept for 30 days (four times the backup window), then removed by
   the same drain. The privacy notice draft names this.
5. **Demonstration before it counts as done:** a recovery exercise on local
   Supabase (and then on staging, after its transfer): take a backup, delete
   an account and a post, restore the backup, run the reconciliation, and show
   that the account cannot sign in and the post is not visible, with the
   result recorded here.

This needs a migration (a D7 approval when merged) and a change to the
`post-media` function. It adds no service or subscription.

## Founder actions this depends on

* **Move `crevant-staging` into the Splitpost Production (Pro) organization**
  (`docs/INFRASTRUCTURE.md`, section 2, item 9). Until then staging has no
  backups.
* **Approve or amend the deletion register proposal** above.
* Keep the organization access to the founder only, with multi-factor
  authentication.
