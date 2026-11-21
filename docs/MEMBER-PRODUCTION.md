# Member Production database (Phase 1B-1)

The member app's Production database is its own Supabase project,
`splitpost-members-production` (organization Splitpost Pro, Canada Central,
`ca-central-1`, Micro compute). It is separate from staging
(`kpudeppgokpjhvaqrprn`) and from the waitlist project
(`hmrliwoychnqrbbydorg`), and nothing in this repository can point one at
another.

**State at the end of 1B-1: nothing exists yet.** The project is not
provisioned, `memberProduction.ref` in `config/supabase-projects.json` is
`null` (every member workflow and every member app Production build fails
closed while it is), and both approvals in `config/member-production.json` are
`false`. This PR adds the migration, the workflows, the checks and this
runbook. It changes no database. Edge Functions are Phase 1B-2; cleanup is 1B-3.

Photo posting stays off. External members stay out: only the launch founder
can hold membership until external access is separately approved and
recorded, and invitations stay blocked until the privacy notice is published.

## What is in this PR

| Piece | File |
| --- | --- |
| Founder-only launch gate (migration) | `supabase/migrations/20261129000000_member_launch_gate.sql` |
| Shared, staging-safe gate check | `supabase/tests/014_member_launch_gate.sql` |
| Member Production check | `supabase/tests-members/001_member_production.sql` |
| Which shared check runs after which migration | `supabase/members-checks.txt` |
| Approvals (both false) | `config/member-production.json` |
| Database workflow (check, plan, apply-foundation, apply) | `.github/workflows/deploy-db-members-production.yml` |
| Activation workflow (rehearse, activate, verify) | `.github/workflows/members-activate-member-access.yml` |
| Target check (connects to nothing) | `scripts/db/verify-members-target.sh` |
| Identity marker: provisioning and check | `scripts/db/members-identity-provision.sql`, `scripts/db/verify-members-identity.sh` |
| Waitlist login lock | `scripts/db/members-lock-waitlist-roles.sql` |
| Migration sets | `scripts/db/members-subset.sh` |
| Activation (one transaction) and its read-only verification | `scripts/db/members-activate-member-access.sql`, `scripts/db/members-verify-activation.sql` |
| Check runner, pending list | `scripts/db/members-run-checks.sh`, `scripts/db/members-pending-migrations.sh` |
| Staging rollback of the gate | `scripts/db/staging-rollback-member-launch-gate.sql` |
| Tests | `scripts/db/members-workflow-test.sh`, `scripts/members-workflows.test.mjs`, `scripts/db/rollback-member-launch-gate-test.sh`, `supabase/tests-local/117_member_launch_gate.sql`, violations 100 to 105, `scripts/db/test-guards.sh` |

## The launch gate (20261129000000)

A row trigger, `member_access_launch_gate`, runs **before every insert and
update on `ops.member_access`**, for every role (triggers apply to
`service_role` and `postgres` too), through every path: the grant function, a
direct write, or any future function. It is not detection; the write is
refused.

* Only the **launch founder** (`ops.member_launch_settings.founder_user_id`)
  may hold the `founder` cohort, open or closed.
* While `external_access_approved` is false, only the launch founder may be
  **given or widened** membership: a new active row, re-activation, a change
  of account or cohort, removing an expiry, or extending one.
* **Narrowing is always allowed**: revoking, pausing, shortening an expiry,
  unrelated updates. So the gate never blocks taking access away, and
  existing members are never disrupted by it.
* With no launch founder set, nobody can be given or widened membership:
  **fail closed**.

Settings and records are server only: no role can write them directly (not
even `service_role`); members and visitors can't read them. Changes go
through two functions, executable by `service_role` only (and by the
database owner), each recorded in the append-only `ops.member_launch_events`:

* `ops.set_external_access(actor, approved, confirm)`: opening needs the
  phrase `APPROVE EXTERNAL MEMBER ACCESS`; closing needs none. An actor label
  is required; email addresses are refused.
* `ops.set_launch_founder(actor, user, confirm)`: needs `SET THE LAUNCH
  FOUNDER`, only while no founder is set; it never replaces one.

`ops` is not exposed through the Data API, so neither function can be called
with an API key over HTTP; it needs a direct database session as
`service_role` or the owner.

### How the migration picks the founder: zero, one or several

The migration never opens the gate (`external_access_approved` starts false
everywhere, staging included) and never takes access away.

| Active founder-cohort accounts | Result |
| --- | --- |
| Exactly one | That account becomes the launch founder (recorded: `founder_set_by_migration`). |
| Zero | No founder (recorded: `founder_not_set_by_migration`). Nobody can be given membership until `ops.set_launch_founder` is run. Existing members keep their access. |
| Two or more (ambiguous) | No founder, recorded the same way. Every existing member keeps access; widening is refused; revoking and unrelated updates work. Resolve it by revoking the extra founder-cohort accounts, then `ops.set_launch_founder`. |

`scripts/db/rollback-member-launch-gate-test.sh` runs all three cases on real
local Supabase, including expired and revoked founder records.

### Staging rollout: non-disruptive, nothing opened automatically

Applying 20261129000000 to staging (the ordinary `deploy-db-staging.yml`
apply, when separately approved) sets the founder if exactly one active
founder-cohort account exists and leaves external access **closed**. Existing
staging testers keep their access; only new grants or widenings to accounts
other than the founder are refused. If staging needs new testers after that,
opening external access on staging is a **separate, approved operation**,
recorded in `ops.member_launch_events` and in the evidence log below. Nothing
in this PR runs it against staging.

Rollback on staging: `scripts/db/staging-rollback-member-launch-gate.sql`
(modes `check` and `apply`, phrase `REMOVE THE STAGING MEMBER LAUNCH GATE`).
It **refuses while external access is closed**, because removing a closed
gate would widen access; open it first (separately approved) or fix forward.
The earlier staging rollbacks refuse while the gate is recorded.

## Database identity marker

The URL can look right and still point at the wrong database. Every member
workflow therefore checks, as its first database connection, that the
database holds the marker:

1. On your own computer: `openssl rand -hex 32`. That is the marker. Never
   paste it into chat, an issue, a PR or the SQL editor.
2. Store it only as the GitHub `members-production` environment secret
   `MEMBERS_DB_IDENTITY_MARKER`.
3. Compute its SHA-256 locally: `printf '%s' '<marker>' | sha256sum` (or
   `openssl dgst -sha256`), 64 lowercase hex characters.
4. In the **new** project's dashboard SQL editor, paste
   `scripts/db/members-identity-provision.sql`, replace
   `PASTE_THE_MARKER_SHA256_HERE` with the hash (not the marker), and run it.
   It refuses a project that already has app schemas or migrations (staging
   and the waitlist project both do), refuses the placeholder or a malformed
   hash, and refuses to replace an existing marker.

The row (`env_identity.marker`, label `splitpost-members-production`) is
single, immutable (update, delete and truncate are refused) and unreadable by
the API roles. `scripts/db/verify-members-identity.sh` requires exactly one
row, the right label and a matching hash, and fails closed on a missing
secret, schema or row, or any mismatch. The marker is masked, never printed
and never passed to `psql`; only its hash is compared.

What it proves: the database behind the URL is the one where the founder
recorded the hash. It is a guard against a wrong or mistyped connection
string, not against someone with owner access, who can read the hash and copy
it elsewhere (see the bypass table).

## Waitlist logins: CONNECTION LIMIT 0

The full migration chain creates `waitlist_writer` and `waitlist_admin`, which
member Production never uses (the waitlist is its own project).
`members-lock-waitlist-roles.sql` sets `CONNECTION LIMIT 0` on both, during
`apply-foundation`, after the identity check. NOLOGIN isn't possible: check
003 (shared, unchanged) requires both roles to have LOGIN. Neither role has a
password either, so the limit is a second, independent lock. The lock refuses,
changing nothing, if a session for either role is already open (a limit stops
only new sessions).

Tested in CI (`scripts/db/members-workflow-test.sh`, `REQUIRE_POOLER_TEST=1`)
with a control password: both roles log in before the lock, and after it are
refused with `too many connections for role`, **directly and through a
PgBouncer pooler** in session mode (a fresh pooler per attempt, so no pooled
connection is reused). Check 003 passes with the lock in place.

**Rehearsal on the real project** (before any member signs up), recorded in
the evidence log: in the SQL editor set a temporary random password on
`waitlist_writer`, try to connect as it through the session pooler
(`waitlist_writer.<ref>@<pooler host>:5432`) and directly
(`db.<ref>.supabase.co:5432`), expect `too many connections for role` on
both, then `alter role waitlist_writer password null`. The direct host is
IPv6 only unless the IPv4 add-on is enabled, so run the direct attempt from a
network with IPv6. The pooler on hosted Supabase is Supavisor, not
PgBouncer, which is why this rehearsal is required as well as the CI test.

## Approvals: `config/member-production.json`

```json
{ "photosApproved": false, "invitationsApproved": false }
```

Changing either needs a reviewed PR, and only **allows** a separate, recorded
change in the database; it never makes one. While a flag is false,
`supabase/tests-members/001_member_production.sql` fails, and the workflow
stops, if the database shows that feature on: photo posting on, external
member access open, or any row in `ops.invitations`. The structure tests fail
if either flag is not false, or if `memberProduction.ref` is not null, in this PR.

## Member Production check

`supabase/tests-members/001_member_production.sql`, run in a read-only
session by every member workflow:

1. exactly one immutable identity marker, unreachable by the API roles;
2. `waitlist_writer` and `waitlist_admin` at connection limit 0, waitlist
   submissions off;
3. no rows in any waitlist or creator acquisition table; no invitations
   unless approved;
4. the launch gate trigger present and enabled; external access closed unless
   invitations are approved, and then nobody but the launch founder holding
   active membership (this catches membership given around the gate);
5. photo posting off unless approved;
6. no `pg_net` extension and no `net` schema.

Each part applies once its migration is recorded; until then it says so.
The shared checks in `supabase/tests` run per `supabase/members-checks.txt`;
at the end of `apply`, none may be skipped.

## Workflows

Both: started by hand, from `main`, by the repository owner only (start and
re-run), at the commit typed into `expected_commit` (must equal the run's
commit), with the typed project reference, after approval of the GitHub
`members-production` environment. A first job with no environment refuses if
any member secret is visible at repository or organization level. Full TLS
verification (`verify-full`, committed CA). One shared queue,
`deploy-database-members-production`; no member workflow names a staging or
waitlist secret, environment or script, and none of theirs names a member one
(`scripts/db/test-guards.sh`).

Environment `members-production`: secrets `MEMBERS_PRODUCTION_DATABASE_URL`
(postgres login, port 5432), `MEMBERS_DB_IDENTITY_MARKER`,
`MEMBERS_FOUNDER_ACCOUNT_ID`; variable `MEMBERS_PROJECT_REF`; a required
reviewer.

`deploy-db-members-production.yml`:

| Mode | What it does |
| --- | --- |
| `check` (default) | Read only: identity, member check, shared checks for what is applied. |
| `plan` | The same, then a dry run of what the next apply would push. |
| `apply-foundation` | New, empty project only: pushes 20261106000000 to 20261121000000, locks the waitlist logins, runs the checks. Phrase `APPLY MEMBER PRODUCTION FOUNDATION`, backup confirmed. |
| `apply` | Only after activation: pushes 20261123000000 onwards (the gate included); every migration must then be recorded and every check must run. Phrase `APPLY TO MEMBER PRODUCTION`, backup confirmed. |

`members-activate-member-access.yml` applies 20261122000000 and the founder's
grant in one transaction (`rehearse` by default, `activate` with
`ACTIVATE MEMBER PRODUCTION ACCESS`, `verify` read only). 20261122000000 is
never pushed by `db push`.

## Sequence (each step separately approved; none is done by this PR)

1. Provision `splitpost-members-production` (Pro org, `ca-central-1`, Micro).
   Confirm `pg_net` is not enabled.
2. Identity marker (above). Create the `members-production` environment,
   its secrets, variable and reviewer.
3. Reviewed PR setting `memberProduction.ref`.
4. `check`, then `plan`, then `apply-foundation`. The waitlist login
   rehearsal (above).
5. The founder signs up in the member app against this project (needs 1B-2),
   confirms their email; store their account id as `MEMBERS_FOUNDER_ACCOUNT_ID`.
6. Activation: `rehearse`, then `activate`.
7. `apply` (the later migrations, the gate included; the gate names the
   founder, the only founder-cohort member, as the launch founder). Then `check`.

Between steps 6 and 7 there is no launch gate yet. Nothing can grant
membership in that window except a direct database session (no Edge Function
is deployed, `ops` is not exposed over HTTP, and `ops.invitations` is empty
and checked), so run step 7 straight after step 6.

## Privileged bypasses

The gate, the marker and the login lock bind every ordinary path. These
privileged paths can get around them; each is listed with what detects it.

| Who or what | Can bypass | How it is limited or detected |
| --- | --- | --- |
| **Table owner** (`postgres`, which owns `ops.*` and `env_identity.*`) | `alter table ... disable trigger` or `drop trigger` on the gate or the marker; direct update of the settings (owners bypass grants); drop or replace the gate functions; edit or delete the marker row after disabling its triggers; truncate the events. | Not prevented. Detected by check 014 and the member check (trigger enabled, rules present, records append only), run by every member workflow and the staging checks. The `postgres` password is held by the founder only, and never in CI except as the environment secret. |
| **`session_replication_role = replica`** (skips ordinary triggers for a session) | The gate, the marker's immutability and the append-only log, for that session's writes. | **`postgres` can set it**: Supabase's supautils extension lets its privileged role set this parameter, although `postgres` is not a superuser (proven on local Supabase, Postgres 17, in a rolled-back transaction; assume hosted Supabase is the same). `service_role` cannot (also proven). Not preventable from SQL. Detected afterwards: while invitations are not approved, the member Production check fails if anyone but the launch founder holds active membership, and check 014 fails on a second active founder. |
| **Logical replication and restore** | A subscription applies rows with replication role `replica`, so triggers don't fire; `pg_restore --disable-triggers` likewise. | Needs replication or superuser rights (`pg_create_subscription` or superuser). No subscriptions are configured; adding one is a reviewed change. Run check 014 and the member check after any restore. |
| **Supabase superuser and platform** (`supabase_admin`, Supabase staff) | Everything. | Outside this repository's control; the provider's access controls. |
| **`service_role` session** | Can call `ops.set_external_access` and `ops.set_launch_founder` with their phrases (the phrase is a confirmation, not an authorization). | No HTTP path (`ops` not exposed). Needs a direct database session as `service_role`. Every change is recorded; the member check fails if external access is open while invitations are not approved. |
| **`CONNECTION LIMIT 0`** | Stops new sessions only. A member of the role (or a superuser) can `SET ROLE waitlist_writer` inside an existing session; the owner can raise the limit or set a password. | No one is granted those roles. The member check fails if the limit is not 0; the lock refuses if a session is open. |
| **Identity marker** | Proves the hash is present, not who put it there; anyone with owner access can read the hash and copy it into another database, or (after disabling the triggers) change it. | A guard against a wrong connection string, not an insider. The member check fails if the marker's triggers are disabled. |

## Evidence log

Record each step here (date, run link, commit, result). No secrets, ids or
connection strings.

| Date | Step | Run or record | Commit | Result |
| --- | --- | --- | --- | --- |
| | | | | |
