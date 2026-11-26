# Supabase infrastructure: assessment and recommendation (Nov 26)

Facts about Supabase were checked against its official documentation on
Nov 26, 2026 (sources at the end). The project list and billing are as the
founder confirmed from the dashboard. Nothing here has been changed: every
step below needs the founder's approval and is done by the founder.

## 1. The four projects

| Project | Organization (plan) | What it is for | Still needed? |
|---|---|---|---|
| `crevant-staging` (`kpudeppgokpjhvaqrprn`), Nano, US West | Crevant (**Free**) | Staging: every merged migration, the staging app, hands-on acceptance, and the **pilot database** once testers join (`docs/PILOT-ENVIRONMENT.md`) | **Yes**, and it is the one that most needs protecting |
| `splitpost-members-production` (`brfdqkondnnzsguailcc`), Micro, Canada Central | Splitpost Production (Pro) | Member Production: foundation applied and the avatar function deployed and verified Nov 22 (`docs/function-evidence-log.md`); registration closed until PB-4 | **Yes** (for Dec 23) |
| `splitpost-production` (`hmrliwoychnqrbbydorg`), Nano, US West | Splitpost Production (Pro) | The public site's **waitlist** database, kept apart from members on purpose (its own logins and credentials; `scripts/waitlist-isolation.test.mjs`) | **Yes** while the public site may collect waitlist sign-ups. The form stays off until the privacy notice is approved |
| `splitpost-members-rehearsal-v2` (`zjyxtrrzwyvagfjqthin`), Micro, Canada Central | Splitpost Production (Pro) | A **disposable** project for the member Production activation rehearsal (commit e8467d5, Nov 22); nothing on `main` refers to it | **No**, once the founder confirms the rehearsal is finished. Future Production changes are rehearsed on throwaway databases in CI |

**Correction:** an earlier note said member Production would need its own Pro
subscription. It is already in the Pro organization, so it does not.

**Correction:** the staging project is on the **Free** plan, not Pro. The Free
plan has **no backups** and pauses a project after a week of inactivity. Until
it is moved, the recovery objectives cannot be met for staging (the pilot
database). The tracker, staging guide and recovery procedure now say so.

## 2. Answers

1. **Purpose and necessity:** the table above.
2. **Can `crevant-staging` move into the Pro organization?** Yes, from the
   dashboard (project Settings, General, Transfer project). The founder must
   be an **Owner** of the Crevant organization and a member of Splitpost
   Production, with the same login. Prerequisites: no overdue invoices, and
   disconnect the Supabase GitHub integration first if it is connected (the
   repository deploys through GitHub Actions, not that integration).
3. **What it keeps:** the project reference, API URL, anon and service keys,
   JWT secret, connection strings, database, Auth users, Storage buckets and
   files, Edge Functions and their secrets, cron jobs and region all stay the
   same. A move from Free to Pro has **no downtime**. Tokens scoped to the old
   organization stop working for the project. The workflows use the founder's
   personal access token and the project's own keys, so they should keep
   working; Claude verifies by running the staging checks straight after.
   Billing moves to the Pro organization.
4. **`splitpost-members-rehearsal-v2`:** it fulfilled its purpose on Nov 22,
   provided the founder confirms that rehearsal finished. It can then be
   **deleted** (Pro projects cannot be paused). Deleting is irreversible: if
   anything in it is worth keeping, export it first.
5. **Separate public site and member Production projects during the pilot?**
   Keep them separate. The waitlist was deliberately isolated from member
   data (separate database, logins and keys), and merging them would mean
   reworking reviewed security boundaries for about $10 a month. Revisit after
   the pilot.
6. **A requirement for separate organizations?** No technical requirement.
   One consideration: on Pro, roles apply to the **whole organization** (Owner,
   Administrator, Developer). Anyone given access to staging would also see
   Production. Per-project roles need Team ($599 a month). Today the founder
   is the only member and Claude has no dashboard access (it works only
   through GitHub Actions secrets), so one Pro organization is safe. If a
   collaborator ever needs the dashboard for staging only, keep staging in
   its own organization at that point.
7. **Minimum configuration for the approved MVP:** one Pro organization with
   three projects: staging (and pilot), member Production, and the waitlist.
   Each keeps its own database, keys, secrets, GitHub environment and
   approval gate. No add-ons (no point-in-time recovery, log drains,
   branching or custom domain) for the pilot.
8. **Monthly cost of the recommendation** (Pro pricing, Nov 26):

   | Item | Now | Recommended |
   |---|---|---|
   | Pro subscription | $25 | $25 |
   | Compute, about $10 per project (Nano in a paid org is billed as Micro) | 3 projects, $30 | 3 projects, $30 (staging in, rehearsal out) |
   | Pro compute credit (one project's compute) | -$10 | -$10 |
   | **Subtotal** | **about $45** (projection $46.78) | **about $45** |
   | Usage within the included quotas: 100 GB Storage, 250 GB egress, 100,000 monthly active users, 2 million function calls (organization-wide); 8 GB disk per project | $0 for the pilot | $0 for the pilot |

   Staging gains daily backups (7 days) and is never paused, at **no change**
   to the monthly total, because retiring the rehearsal project frees the same
   compute. Vercel Pro (about $20 a month) is separate.

   **Spend cap (keep it on):** it stops usage beyond the quotas instead of
   billing for it. It does **not** cover compute. With the cap on, if the pilot
   ever exceeds 250 GB of egress in a month (most likely from video), media
   would stop loading until the next cycle rather than costing more. Control
   Center's video delivery estimate shows this coming. Staying under the
   proposed 50 GB video storage cap leaves Storage well inside its quota.
9. **Safest sequence:**
   1. *Prerequisites (founder):* confirm the rehearsal is finished; confirm
      you are Owner of the Crevant organization; disconnect the GitHub
      integration on `crevant-staging` if it is connected.
   2. *Baseline (Claude):* run the staging checks (`deploy-db-staging.yml`,
      plan mode, which changes nothing) and record the result.
   3. *Transfer (founder):* `crevant-staging`, Settings, General, Transfer
      project, to Splitpost Production. The dashboard shows the added compute
      cost before you confirm.
   4. *Verify (Claude, same hour):* the staging checks again, the project
      reference unchanged, the staging app signs in, Edge Functions answer.
   5. *Next day (founder):* Database, Backups lists the first daily backup.
      Optionally, at a quiet time, raise staging from Nano to Micro (same
      price; a short restart).
   6. *Then (founder):* delete `splitpost-members-rehearsal-v2`.
   7. *Rollback:* transfer staging back to the Crevant organization. This is
      also downtime-free unless its compute was raised above Nano (then about
      a minute's restart), and it loses backups again. Nothing else changes.

## 2a. Transfer readiness baseline for `crevant-staging` (checked Nov 26)

**Project identity.** `crevant-staging`, reference `kpudeppgokpjhvaqrprn`,
US West, Nano, in the Crevant (Free) organization. The same reference is
pinned in `config/supabase-projects.json` (`staging.ref`), in
`supabase/functions/_shared/policy.ts` (generated) and in every staging
workflow's target check (`scripts/db/verify-staging-target.sh`). A transfer
keeps the reference, so none of these change.

**What depends on it, and whether a transfer affects it** (from the
repository; dashboard settings confirmed by the founder in step T1):

| Dependency | Where | After the transfer |
|---|---|---|
| Database connection for the workflows | GitHub secret `STAGING_DATABASE_URL` (21 uses in 7 workflows) | Unchanged: the host, user and password stay the same |
| Founder account id for activation | GitHub secret `STAGING_FOUNDER_ACCOUNT_ID` | Unchanged (Auth users move with the project) |
| Staging app | Vercel `splitpost-app`, Preview environment for `staging`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Unchanged: the API URL and keys stay the same |
| Edge Functions `avatar` and `post-media`, and their secrets (`MEDIA_DRAIN_KEY`) | The project | Kept as they are, with their deployed versions |
| Function deployments | `scripts/functions/deploy.mjs`, using the founder's own `supabase login` | Keeps working: the founder is a member of both organizations |
| Scheduled photo and video cleanup (pg_cron job calling `post-media/drain`) | The database | Kept, and keeps running |
| Auth settings, Site URL and redirect URLs, Resend SMTP sender | The project's Auth settings | Kept |
| Storage buckets, files and the upload size limit | The project | Kept |
| The Supabase GitHub integration | Not used: this repository deploys only through GitHub Actions | If it shows as connected, disconnect it first (a transfer prerequisite) |
| Anything tied to the Crevant organization id | None found (`git grep` for organization ids and access tokens: nothing) | Nothing to change |

**Access controls.** Both organizations: the founder only, with multi-factor
authentication. On Pro, roles cover the whole organization, so anyone added
later would see Production too (section 2, item 6). Claude has no
dashboard access; it reaches staging only through the GitHub secrets above.

**Cost.** About **$45 a month before and after** (section 2, item 8). The
transfer itself adds staging's compute (Nano is billed as Micro in a paid
organization, about $10); deleting the rehearsal project removes the same
amount. Until the rehearsal project is deleted the total is about $55. No new
subscription. The spend cap stays on.

**Environment isolation after the move.** Staging and member Production
keep separate databases, keys, Auth users, Storage, Edge Function secrets,
GitHub environments and approval gates, and the functions refuse each
other's origins (`supabase/functions/_shared/policy.ts`). Two things become
shared, and both are acceptable for the pilot: the organization's usage
quotas (staging video tests count against the same 250 GB egress as
Production; Control Center's estimate shows it), and the organization's
member list (the founder only).

**Rehearsal project retirement readiness.** `splitpost-members-rehearsal-v2`
(`zjyxtrrzwyvagfjqthin`) appears nowhere in code, configuration or workflows
on `main`, only in this document. Nothing depends on it. It is deleted
**only** after the founder confirms the rehearsal is finished and anything
in it worth keeping has been exported, and authorizes the deletion
explicitly (founder action T5).

**Exact transfer steps** (founder, about 15 minutes; staging stays up):

* **T1. Prerequisites (5 minutes).** Supabase dashboard: (a) Crevant
  organization, Team: you are **Owner**. (b) Splitpost Production
  organization, Team: you are a member with the same login. (c) Crevant,
  Billing: no overdue invoice. (d) `crevant-staging`, Project Settings,
  Integrations: if GitHub is connected, disconnect it. Tell Claude when done.
* **T2. Baseline (Claude).** The staging checks run after migration
  20261216000000 is applied serve as the before picture (all checks, the
  project reference, the drain schedule notice).
* **T3. Transfer (founder, 5 minutes).** `crevant-staging`, Project Settings,
  General, **Transfer project**, choose **Splitpost Production**. Read the
  added compute cost on the confirmation screen (about $10 a month), then
  confirm. Expected: the project now shows under Splitpost Production, same
  name and reference.
* **T4. Verify (Claude, the same hour).** The staging checks again (same
  results), the reference unchanged, the staging app signs in, the Edge
  Functions answer (Verify Edge Functions, staging), and the cleanup job
  still runs.
* **T5. Next day (founder).** `crevant-staging`, Database, Backups: a daily
  backup is listed. Only then, and only with your explicit go-ahead, delete
  `splitpost-members-rehearsal-v2` (Project Settings, General, Delete
  project). Deleting is irreversible.
* **Rollback.** Transfer staging back to Crevant the same way. No downtime at
  Nano; it loses daily backups again.

## 3. Backups and log retention after the change

| Project | Daily backups | Retention | Logs (API, Postgres, Auth audit) |
|---|---|---|---|
| Staging and pilot | **None today** (Free) → daily after the transfer | 7 days | 1 day today → 7 days |
| Member Production | Daily | 7 days | 7 days |
| Waitlist | Daily | 7 days | 7 days |

Database backups never include Storage files (photos and videos), on any
plan. Point-in-time recovery stays off (about $100 a month per project).

## Sources (checked Nov 26, 2026)

supabase.com/docs/guides/platform/project-transfer (and /requirements,
/what-changes, /pause-project); /platform/backups; /platform/compute-and-disk;
/platform/manage-your-usage/compute; /platform/billing-on-supabase;
/platform/spend-cap; /platform/access-control; /telemetry/logs;
supabase.com/pricing.
