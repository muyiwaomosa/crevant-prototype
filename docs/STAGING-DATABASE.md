# Staging database deployment

How approved database migrations reach the Crevant staging Supabase project (`crevant-staging`, reference `kpudeppgokpjhvaqrprn`). Workflow: `.github/workflows/deploy-db-staging.yml`, named **Deploy database to staging**.

This workflow can only ever touch staging. Production, the live demo and its Vercel deployment are never involved. The pilot takes no real payments, so there is no payment schema, key or service anywhere in this process.

## One time setup (founder, in GitHub)

Settings, Environments, **New environment**, name it `staging`, then:

1. **Deployment branches and tags:** choose *Selected branches and tags* and add only `main`. This is the guard that matters most, because it stops a workflow started from any other branch from reading the staging secret.
2. **Required reviewers:** add yourself. Every run then waits for your approval before it can read the secret.
3. **Environment secret** `STAGING_DATABASE_URL`: the Supabase **session pooler** connection string for `crevant-staging` (Supabase dashboard, Connect, Session pooler, port 5432), with the real database password filled in. Paste it only into GitHub, never into chat, email or a file.
4. **Environment variable** `SUPABASE_PROJECT_REF`: `kpudeppgokpjhvaqrprn`.

Recommended: a branch protection rule on `main` that requires a pull request and the CI checks, so the approved list and the workflow itself can only change through review.

## Running it

Actions, **Deploy database to staging**, **Run workflow**:

1. Branch: `main`.
2. Mode: `plan` first. It runs every check and lists what would be applied, and changes nothing.
3. Confirm project reference: type `kpudeppgokpjhvaqrprn`.
4. Approve the `staging` environment when GitHub asks.
5. Read the plan output. If it lists exactly the migrations you expect, run again with mode `apply`.

`apply` repeats every check, applies the pending approved migrations, runs the security and separation checks in `supabase/tests/` against staging, and prints the applied migration list. Running `apply` again when nothing is pending is harmless: it reports that the database is up to date.

## What it checks, in order

| Step | Fails when |
| --- | --- |
| Run from `main` | Started from any other branch (both jobs are skipped) |
| Guard self tests | The target and approved list checks themselves stop working |
| Approved list | A migration is not on `supabase/approved-migrations.sha256`, is missing, or its contents changed since approval |
| Throwaway database | Any migration or separation check fails on an empty PostgreSQL 16 |
| Target check | The secret or variable is missing; the variable, the typed reference or the project inside the connection string differs from `kpudeppgokpjhvaqrprn`; the host is not Supabase; the port is not 5432; TLS is switched off |
| Pinned CLI | The installed Supabase CLI is not exactly 2.122.1 |
| Plan / apply | The credentials are wrong, the database is unreachable, or a migration errors (the CLI stops at that migration) |
| Staging checks | Any schema separation or permission check fails on staging |

The connection string is never printed. The password is masked in logs, and the target check reports only the project reference, the connection kind and the port.

## Keeping data areas apart

The checks in `supabase/tests/001_schema_separation.sql` run against staging after every apply. They confirm that Connection Points and other real activity (`public`), hypothetical Support Intent amounts (`intent`), simulated advertising (`sim`) and `analytics` stay separate: members and anonymous visitors have no direct access to the private schemas, new tables there start locked, and no view or function combines two amount schemas.

## Approving a new migration

In the pull request that adds the migration:

```bash
sha256sum supabase/migrations/*.sql > supabase/approved-migrations.sha256
```

Commit the updated list with the migration. Reviewing and merging that pull request is the approval. Never edit a migration after it has been applied to staging: add a new one instead. The check rejects edits to approved files.

## If something fails

Nothing is applied until every earlier check passes. If an apply step fails part way, the CLI stops at the failing migration; any migrations before it stay applied. Check what landed with `supabase migration list` (shown at the end of a successful run) or in the Supabase dashboard. Fix it with a new migration in a reviewed pull request, then run `plan` and `apply` again. If the password may have leaked, reset it in Supabase (Project Settings, Database) and update the `STAGING_DATABASE_URL` secret.
