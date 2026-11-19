# Activating pilot membership on staging

How `20261122000000_member_access` (docs/PILOT-ACCESS.md) goes live on the
staging (pilot) database **without locking the founder out and without any
partial state**. Workflow: `.github/workflows/staging-activate-member-access.yml`.
SQL: `scripts/db/staging-activate-member-access.sql`. Local tests:
`scripts/db/activation-test.sh` (also in CI's Database job).

## Why a dedicated workflow

The database deploy workflow (`supabase db push`) applies migrations and
commits them; it has no way to grant access in the same step. Applying the
gate and then granting the founder would leave a window in which the gate is
on and nobody, the founder included, is a member. Putting the founder's
account in the migration itself would commit a staging account id to the
repository and run it in CI, locally and eventually in Production.

So the activation runs **one database transaction**:

1. preconditions (nothing changed yet): the mode and phrase; the founder id
   is a UUID of an existing account **with a confirmed email**; the database
   has the staging social core through `20261121000000`; `20261122000000` is
   not yet recorded and none of its objects exist;
2. the approved migration file itself, unchanged (its checksum is verified
   first);
3. its record in `supabase_migrations.schema_migrations` (version and name,
   as the Supabase CLI records it), so `supabase migration list` and later
   deploys see it as applied;
4. the founder's membership (`ops.grant_member_access`, cohort `founder`,
   actor `founder`, reason `staging activation`; the history also records the
   database login that made it);
5. the critical security checks, inside the same transaction: the
   staging-safe checks `supabase/tests/002` to `007`, the read-only member
   authorization audit, and activation checks (the founder, and only the
   founder, is an active member; signed in as the founder the member app
   answers; an account without membership is refused);
6. `COMMIT` in activate mode, `ROLLBACK` in rehearse mode.

Any failure stops psql before step 6 and the database discards everything.
The existing migration safeguards are all kept (approved list and checksums,
a throwaway-database run first, target verification, the staging environment).
What changes is only *how* the one migration is executed: by psql inside the
activation transaction instead of by `supabase db push`, recorded the same way.

## Safeguards

* Started by hand, from `main`, by the repository owner, and re-run only by
  the repository owner; the staging environment (and its approval rule).
* The typed project reference, the environment variable and the connection
  string must all name the staging project (`verify-staging-target.sh`); full
  TLS verification. The SQL also refuses any database without the staging
  social core, which Production does not have.
* `20261122000000` must be the only migration not yet applied on staging.
* The founder id: only the **staging environment secret**
  `STAGING_FOUNDER_ACCOUNT_ID`; refused if the name exists at repository or
  organization level; passed to psql through the environment, never on a
  command line; never selected, printed or included in an error.
* Rehearse is the default; activate needs the phrase `ACTIVATE STAGING MEMBER ACCESS`.
* Shares the database deploy queue.
* Guard tests (`scripts/db/test-guards.sh`) enforce all of the above in the
  workflow and SQL files.

## Activation steps (each needs the founder's approval)

1. Merge PR #74, PR #76 and this PR to `main` (the workflow and the staging
   environment run only from `main`).
2. Find your account id: Supabase (staging project), Authentication, Users,
   your own row, copy the user id. Confirm its email shows as confirmed.
3. GitHub, the repository, Settings, Environments, `staging`, Environment
   secrets, Add secret: name `STAGING_FOUNDER_ACCOUNT_ID`, value the id.
   (Not a repository secret: the workflow refuses that.)
4. Actions, "Activate pilot membership on staging", Run workflow, on `main`:
   mode `rehearse`, project reference `kpudeppgokpjhvaqrprn`. Approve the
   staging environment when asked. Expect "Rehearsal only ... Nothing
   changed" and "Rehearsal left no migration record and no membership
   objects".
5. Run it again: mode `activate`, the same reference, phrase
   `ACTIVATE STAGING MEMBER ACCESS`. Expect "Activated ..." and the schema
   separation checks to pass.
6. Verify: run `scripts/db/staging-inventory.sql` in the SQL Editor (1
   membership, 1 active, 1 history row); sign in on the member app Preview
   (your feed loads; content of accounts without membership is hidden).
7. Optionally delete the secret afterwards: the workflow refuses a second
   activation anyway.

## After activation

The staging rollback (`scripts/db/staging-rollback-member-access.sql`)
refuses once any membership exists: from activation on, problems are fixed
forward with a new migration.
