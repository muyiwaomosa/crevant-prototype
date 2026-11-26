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
