# Platform function access (20261118000000)

**Status:** proposed. The migration is not on `supabase/approved-migrations.sha256`,
so CI's Database job stops at the approval gate until the founder approves its
checksum.

## What happened

Applying the waitlist, acquisition and social core migrations to staging
(2026-11-16) succeeded, then the staging check `003_waitlist.sql` failed:

```
FAIL: waitlist_writer can run functions it should not: rls_auto_enable()
```

`public.rls_auto_enable()` is not made by any migration in this repo. Supabase
installs it, with an event trigger, on hosted projects that use the option to
automatically enable row level security on new tables. Postgres lets PUBLIC
execute every new function, and Supabase's default privileges in `public` also
grant it to `anon`, `authenticated` and `service_role`. Every role inherits
PUBLIC, so the restricted waitlist logins, created by our waitlist migration,
could run it as well. Clean CI and local databases don't have the function,
which is why every check passed there.

Reproduced locally with a stand-in built the same way: the same check fails,
with the same message. Calling the function directly did not run its body in
any of four ways tried, but the grant breaks our rule that members and logins
can run only their own entry points, so it is fixed, not ignored.

## The fix

* **Migration** `20261118000000_platform_function_access.sql`: if the
  function exists, revoke EXECUTE from PUBLIC, `anon`, `authenticated`,
  `waitlist_writer` and `waitlist_admin`, then prove none of them can still run
  it, and stop with nothing changed if they can (for example if another role
  owns it). Where it doesn't exist, it does nothing. It creates, drops, alters
  and grants nothing. `service_role` keeps its grant.
* **New staging check** `supabase/tests/006_platform_functions.sql`: `anon`
  can run no function in the application schemas, and `authenticated` only the
  `public.app_*` functions, including functions this repo didn't make. It also
  checks `rls_auto_enable()` wherever it exists. Violations 71 and 72 prove it
  catches both cases.
* **Behaviour tests** `supabase/tests-local/080_platform_function_access.sql`:
  with a stand-in function and event trigger, the migration removes the
  grants, the event trigger still enables RLS on new tables, a second run is
  harmless, and a run by a role that can't change the grants stops and changes
  nothing.
* **Rollback** `scripts/db/staging-rollback-platform-access.sql` (phrase
  `REMOVE THE STAGING PLATFORM ACCESS RECORD`) removes only the migration
  record, so the earlier rollbacks can run. It deliberately gives no grants
  back. The rollback order is now: platform access, social core, creator
  acquisition, waitlist.

## Read-only diagnosis

`scripts/db/staging-diagnose-function-access.sql` reads only catalogs and
lists the recorded migrations, the function's owner and privileges, every
function a member or waitlist login can run beyond its own, the event
triggers, and the waitlist switches.
