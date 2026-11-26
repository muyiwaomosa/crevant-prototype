# Backup and recovery

How Splitpost recovers from data loss during the pilot, using only what is
already in place: Supabase's own backups, the repository, Vercel and the
GitHub Actions workflows. No new system is added.

Applies to the staging project (`kpudeppgokpjhvaqrprn`, the pilot database
once testers join) and, with its own approvals, to member Production later.
Everything financial is simulated during the pilot.

## What protects what

| What | Where it lives | How it is recovered | Proposed recovery point (RPO) | Proposed recovery time (RTO) |
|---|---|---|---|---|
| **Database records** (accounts, profiles, posts, follows, comments, reports, moderation history, privacy requests, switches) | Supabase Postgres | Supabase daily backup, restored from the dashboard | **24 hours** (the last daily backup) | **4 hours** to restore, check and reopen |
| **Financial and rewards ledgers** (points, reviews, reversals, settlements, simulated revenue, campaign attributions) | The same database (`sim`, `ads`), append-only | The same backup, then the reconciliation must pass before reopening | **24 hours** | Included in the 4 hours |
| **Uploaded photos and videos** | Supabase Storage (`post-photos`, `post-videos`, `avatars`, `ad-creatives`) | **Not in database backups.** Storage keeps files durably (no loss from hardware failure), but a deleted file or bucket cannot be brought back | Files: none for deletions (see below). Their database rows come back with the backup | Affected posts show "This photo couldn't load" at once; no outage |
| **Security and access configuration in the database** (roles, grants, row level security, security definer functions, the account hook) | Migrations in this repository, applied by the approved workflow | In the backup, and rebuildable from the migrations; the restore drill proves they survive a restore | **0** (every change is a reviewed, recorded migration) | Checked in minutes by the staging checks run |
| **Settings outside the database** (Auth settings, Site and redirect URLs, the email sender, Storage upload limit, Edge Function secrets, Vercel variables) | Supabase and Vercel dashboards; written down in `docs/STAGING-ACCEPTANCE.md` section 2 and `docs/PILOT-ENVIRONMENT.md` | Re-entered from those steps; secrets re-issued (never restored from a copy) | **0** for the settings (documented); secrets are re-issued | **1 hour** |
| **The app itself** (front end, Edge Functions) | This repository; Vercel builds `staging`; functions deploy from the repo | Redeploy the last good commit | **0** | Minutes |

**Why 24 hours is proposed:** Supabase Pro takes a daily backup and keeps 7
days. For a closed pilot with simulated money, losing at most a day of
activity is acceptable, and every ledger is append-only, so what is restored
always reconciles. Point-in-time recovery (an add-on, about 2 minutes RPO) is
**not** proposed for the pilot; it becomes worth its cost before real money or
a large cohort. Both are founder decisions with a cost.

**Why photos and videos have no copy:** Storage is durable against hardware
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
4. **Re-apply what must not come back** (30 minutes). A restore brings back
   anything deleted after the backup point, including accounts deleted on a
   member's request. Supabase, Logs, Auth: list every account deleted after
   the backup time, and delete each again (Control Center, Privacy requests,
   or Authentication, Users). Do the same for any post a moderator removed in
   that window (the moderation log in the logs, or the reports themselves).
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

## Founder actions this depends on

* **Confirm the staging organization is on Supabase Pro** and that Database,
  Backups lists a backup. On the Free plan there are no restorable backups
  and nothing above applies (`docs/PILOT-ENVIRONMENT.md` already lists this
  as required before real pilot members). This is a monthly cost.
* **Accept the proposed objectives**: RPO 24 hours and RTO 4 hours for the
  database and ledgers, no copy of media for the pilot, no point-in-time
  recovery add-on for the pilot.
* Keep the organization access to the founder only, with multi-factor
  authentication.
