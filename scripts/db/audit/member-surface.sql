-- Member authorization surface audit (pilot milestone M1). READ ONLY.
--
-- What a signed-in Supabase account (role `authenticated`) or an anonymous
-- visitor (role `anon`) can reach in the parts of the database this
-- repository owns, checked against the exact allow-list the migrations
-- define. It reads only the system catalogs: no table rows, no personal
-- data. It changes nothing: the whole check runs in a READ ONLY transaction
-- that is rolled back.
--
-- Each check raises an exception starting with "FAIL:" on a problem, so
-- psql with ON_ERROR_STOP=1 stops with a non-zero exit. Each passing check
-- prints a NOTICE starting with "PASS:".
--
-- Where it runs:
--   * CI: against the empty throwaway database scripts/db/test.sh builds from
--     the migrations, with deliberate violations proving it catches problems
--     (scripts/db/audit/violations/).
--   * Hosted staging: ONLY with the founder's explicit approval, through
--     scripts/db/audit-member-surface.sh. It is deliberately NOT in
--     supabase/tests/, because the staging deploy workflow runs every file
--     there against hosted staging.
--
-- Scope: the schemas this repository owns (public, ops, social,
-- waitlist_api) and Supabase Storage. Supabase's own schemas (auth, graphql,
-- extensions, realtime, ...) grant members some built-in helpers by design;
-- they are not part of this allow-list.
--
-- When M3 (invitation security) changes the member functions, this file's
-- allow-list changes with it, in the same reviewed pull request.

begin transaction read only;

\ir member-surface-checks.sql

rollback;
