# Production database deployment

The workflow **Deploy database to Production**
(`.github/workflows/deploy-db-production.yml`) applies approved migrations to
the Splitpost Production Supabase project only:

| | Staging | Production |
| --- | --- | --- |
| Supabase project | `kpudeppgokpjhvaqrprn` | `hmrliwoychnqrbbydorg` (splitpost-production, us-west-2, separate organization) |
| Workflow | `deploy-db-staging.yml` | `deploy-db-production.yml` |
| GitHub environment | `staging` | `production` |
| Secret | `STAGING_DATABASE_URL` | `PRODUCTION_DATABASE_URL` |
| Target check | `scripts/db/verify-staging-target.sh` | `scripts/db/verify-production-target.sh` |
| Rollback | staging only | none (the staging rollbacks refuse anywhere else) |

Neither workflow names the other's project, secret or environment; guard
tests in `scripts/db/test-guards.sh` fail if one ever does.

## What Production receives

Only the waitlist and its dependencies (`supabase/production-migrations.txt`),
pushed from a folder that holds just those (`scripts/db/production-subset.sh`):

| Migration | Why Production needs it |
| --- | --- |
| `20261106000000` foundations | The private schemas everything else lives in |
| `20261107000000` profiles and ops | `ops.invitations`, which the waitlist and acquisition use. It also creates `public.profiles` and its sign-up trigger, unused until members exist (one approved migration, not split) |
| `20261110000000` waitlist | The waitlist itself |
| `20261111000000` waitlist admin tools | Summary and invitation waves |
| `20261116000000` creator acquisition | `submit_v2` and `invite_preview`, which the `join-waitlist` function calls |
| `20261118000000` platform function access | Members and the waitlist logins can't run Supabase's `rls_auto_enable()` |
| ~~`20261117000000` social core~~ | **Not deployed.** Nothing above depends on it. When the social app launches, a reviewed PR adds it to the list; it is older than `20261118`, so that push needs `--include-all` (the CLI refuses it otherwise) |

The Production checks are `supabase/production-checks.txt` (all but the
social core's). Every run first applies this subset to an empty throwaway
database and runs those checks.

## Before the first run (founder, once)

**Supabase (Production project)**
1. **Plan with backups.** A paid plan (Pro or above) gives 7 days of daily
   backups; point-in-time recovery is a paid add-on on Pro and above. Wait
   until the dashboard (Database, Backups) shows a first backup before any
   `apply`. On the Free plan, restorable backups aren't something to rely on.
2. **Database settings:** SSL enforcement on.
3. **API settings:** expose only `public` (and `graphql_public` if Supabase
   requires it). Never `ops`, `social`, `waitlist_api`, `intent`, `sim` or
   `analytics`.
4. **Auth:** public sign up off; email confirmation on; minimum password
   length 10; Site URL `https://www.splitpost.ca`, redirect
   `https://www.splitpost.ca/auth/confirm`.
5. **The connection string** for `PRODUCTION_DATABASE_URL`: the **session
   pooler** (port 5432), user `postgres.hmrliwoychnqrbbydorg`, with the
   database password. Never the transaction pooler (6543).

**GitHub** (Settings, Environments, New environment `production`)
1. **Required reviewers:** you. **Prevent self-review** off (one reviewer).
2. **Deployment branches and tags:** selected branches, `main` only.
3. **Environment secret** `PRODUCTION_DATABASE_URL` (the session pooler
   string above). Never as a repository secret.
4. **Environment variable** `SUPABASE_PROJECT_REF` = `hmrliwoychnqrbbydorg`.

## Running it

1. Actions, **Deploy database to Production**, Run workflow, on `main`.
2. **plan** first: type `hmrliwoychnqrbbydorg`. It must list exactly the
   **six** migrations in `supabase/production-migrations.txt`: `20261106`,
   `20261107`, `20261110`, `20261111`, `20261116` and `20261118`. Not the
   social core (`20261117`).
3. **apply**, only with founder approval: type the reference, type
   `APPLY TO PRODUCTION`, and tick the backup confirmation. It applies the
   migrations, then runs all six check files against Production.
4. **check**: read-only, the listed checks pass and the six migrations are
   recorded. Then run `scripts/db/staging-diagnose-function-access.sql` in
   the Production SQL editor (read-only; it works on any project).

Each job approves through the `production` environment gate.
