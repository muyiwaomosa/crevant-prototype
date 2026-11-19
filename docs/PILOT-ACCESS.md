# Pilot membership access control (Build 4, core of milestone M3)

Who may use the Splitpost member app during the 60-day invitation-only pilot,
and how that is enforced. Migration: `supabase/migrations/20261122000000_member_access.sql`
(staging only until separately approved for Production).

## Three separate layers

| Layer | What it means | Where it's decided |
|---|---|---|
| 1. Authenticated identity | A signed-in Supabase account | Supabase Auth (`auth.uid()`) |
| 2. **Authorized pilot membership** | An **active, unexpired** row in `ops.member_access` | Only `ops.grant_member_access` / `ops.revoke_member_access` (server code) |
| 3. Complete profile | A username and display name | `public.app_set_profile` (needs layer 2) |

**Signing in never grants membership.** Accepting an invitation, confirming an
email, or having an account from before this migration gives layer 1 only.

The database checks the layers in order for **every** member function:

* `social.current_access()`: signed in **and** an active membership, or
  `no_pilot_access`.
* `social.current_member()`: the above **and** a complete profile, or
  `profile_incomplete`.
* All 26 `public.app_*` functions go through one of them, except
  `app_access_state()`, which returns only the caller's own state (`active`,
  `none`, `revoked` or `expired`) so the app can explain it.
* Revoking or expiring a membership takes effect on the account's **next
  request**, whatever its session.
* Profiles and content of accounts without active membership (never granted,
  revoked or expired) **disappear** from every member's feed, profile pages,
  comments, Discover, Following, Unseen and Catch-up, and can't be followed,
  liked, commented on, viewed or added to an Inner Clique
  (`social.visible_members`). Nothing is deleted: they reappear if access is
  restored.
* A creator's invite link works only while the creator has active membership.

The app (`src/app/MemberArea.tsx`) asks for the access state first. Without
active membership it loads nothing else and shows:

| State | Wording |
|---|---|
| Heading (all states) | "Your pilot access isn't active" |
| Not granted | "Your account hasn't been approved for the Splitpost pilot yet." |
| Revoked | "Your pilot access has ended." |
| Expired | "Your pilot access has ended." (the same, so the screen never says why) |
| The check itself failed | "We couldn't verify your access right now. Please try again." |

with a **Sign out** button (this device). That screen is for explanation
only: the database refuses every member function regardless of what the app
does.

**Before the migration is applied** (compatibility, so the member app can be
deployed first): if PostgREST answers that `app_access_state` or
`app_set_profile` does not exist (PGRST202 naming that exact function), the
app behaves as before the gate (every signed-in account is a member, which is
exactly what such a database enforces) and saves profiles with the old
own-row update. Any other answer (an authorization error, a database
failure, a timeout, another function, an unexpected reply) is a failure or
"no access", never a reason to skip the gate. Once the migration is applied
the functions exist, the fallback is never taken, and the database refuses
direct profile updates anyway.

## Records and audit

* `ops.member_access`: one row per account (cohort `founder`, `creator`, `fan`
  or `tester`; status `active` or `revoked`; optional `expires_at`; who made
  the latest change and why).
* `ops.member_access_events`: **append-only** history, written by a trigger on
  every insert, update or delete, so no change can skip it: `granted`,
  `restored`, `revoked`, `changed`, `removed` (account deleted). It can't be
  edited, deleted or truncated, even by the table owner.
* No email addresses: actors and reasons refuse `@`. Use labels such as
  `founder`.
* Each history row also records, set by the database rather than typed:
  `db_session_user` (the database login that made the change, for example
  `postgres` for the SQL Editor or the staging workflow) and `db_role` (a role
  it had switched to, for example `service_role`, or `none`). A typed actor
  label can't impersonate them.
* The history protects against mistakes and members, not against the
  database owner, who can disable triggers. Owner-level access (the SQL Editor
  and the GitHub `staging` secret) stays with the founder only, with MFA.
* Members and visitors can't read, write or call any of it.
* **Retention:** the history has no foreign key, so it outlives a deleted
  account (the removal itself is recorded). The retention period must be
  decided with the pilot privacy notice before real participants.

## Granting and revoking (founder, server only)

Until the admin page (M4), in the Supabase SQL Editor of the **staging**
project, after finding the account's id under Authentication, Users:

```sql
-- Grant (or restore, or change cohort/expiry). The account must be confirmed.
select ops.grant_member_access('<account id>', 'founder', 'founder');
select ops.grant_member_access('<account id>', 'creator', 'founder', null, 'pilot creator wave 1');
select ops.grant_member_access('<account id>', 'fan', 'founder', now() + interval '60 days', 'pilot fan');

-- Revoke (effective on the next request).
select ops.revoke_member_access('<account id>', 'founder', 'reason without personal data');

-- Review.
select user_id, cohort, status, expires_at, updated_at, updated_by from ops.member_access order by updated_at desc;
select * from ops.member_access_events order by id desc limit 50;
```

## Verification

* `supabase/tests/007_member_access.sql`: staging-safe, catalog-only checks
  (run by the staging deploy workflow after every apply).
* `supabase/tests-local/070_member_access.sql`: behaviour, on throwaway
  databases:
  * accounts from before the migration keep every row (fingerprinted before
    and after by `supabase/tests-local/before/20261122000000.sql`) and get no
    access;
  * without membership, all 25 member functions refuse (checked generically,
    so a future function can't slip through);
  * active, revoked, expired and restored memberships behave correctly;
  * members can't grant, restore or revoke access by any route;
  * every change is recorded, and the history is append-only.
* `scripts/db/audit/member-surface-checks.sql`: the read-only audit, with
  deliberate violations 10 to 14 proving it catches a removed check, a
  bypassing function, a self-grant path, an editable history and direct
  profile updates.
* `scripts/db/staging-rollback-member-access.sql` and
  `scripts/db/rollback-member-access-test.sh`: the staging rollback (see below).

## Rollback

`scripts/db/staging-rollback-member-access.sql` restores every changed
function to its previous definition and removes the gate. It **refuses once
any membership or history row exists**: from the first grant, membership and
its history are audit data, and problems are fixed forward with a new
migration.

Rolling back **removes the gate**: every signed-in account with a complete
profile becomes a member again. If the gate ever blocks someone it shouldn't,
the fix is a grant, not a rollback.

## Pilot scope and milestones (as approved in planning)

* **M1** pilot environment: separate `splitpost-app` project, member-only
  routing, build guards (PR #74).
* **Build 4 / M3 core** pilot membership access control (this).
* **M2** email: custom SMTP through Resend (`mail.splitpost.ca`); Supabase
  Site URL and redirect URL move to `app.splitpost.ca`.
* **M3 remainder** invitation security: accepting a valid invitation grants
  membership automatically; revocation and expiry can't be bypassed by an
  earlier link.
* **M4** minimal admin page: grant, revoke and review membership; invitations.
* **R1** technical creator rehearsal, then **L1** creator launch (gated on the
  separate photo and video publishing workstream).
* **M5** verified waitlist and transfer, **M6** inviter follow, **R2** fan
  rehearsal, **L2** fan cohorts.

**Fan rewards decision (unchanged):** fans get their split through Connection
Points earned for qualifying contributions. During the pilot, reward
fulfillment is simulated and Connection Points have no cash value. Nothing in
this migration stores points, money or rewards.
