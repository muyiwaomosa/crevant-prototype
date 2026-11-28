#!/usr/bin/env bash
# TEST ONLY (throwaway databases): the staging review fixture
# (scripts/db/staging-review-fixture.sql) on a database where every migration
# and the local behaviour tests have run. Run by scripts/db/test.sh.
#
# Proves, through the real script and psql exactly as the workflow runs it:
#   * it refuses member Production (env_identity.marker), a database whose
#     launch founder isn't the given one, and an address that belongs to a
#     real account; refusals change nothing;
#   * dry-run rehearses everything and leaves nothing behind;
#   * seed brings a dedicated fixture supporter to "Under review" through the
#     real check, with every APPROVED supporter goal met and the goals unchanged;
#     every fixture account is a 'tester' (test data); the founder's approval
#     then works on it;
#   * the metrics that exclude test accounts do not move (North Star, active
#     members, activation, the progression scorecard); any other founder
#     overview figure that moves is reported, not changed;
#   * seed again changes nothing;
#   * remove deletes every fixture account and everything they made, writes
#     the deletion register, and the deletion register check still passes.
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?Set DATABASE_URL to the throwaway test database}"
case "$DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing to run: throwaway databases only." >&2; exit 1 ;;
esac
P=(psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -X)
q() { "${P[@]}" -At -c "$1"; }
fail() { echo "FAIL: staging review fixture: $1" >&2; exit 1; }
run() { # mode, then extra env: runs the fixture as the workflow does
  local mode=$1; shift
  env "$@" "${P[@]}" -v mode="$mode" -v journey=supporter -f scripts/db/staging-review-fixture.sql
}
marked() { q "select count(*) from auth.users where raw_user_meta_data ->> 'staging_review_fixture' = 'true'"; }

# Setup: a launch founder (the one the tests left, or a new one), external
# access open as on staging, sharing on and rewards running.
founder=$(q "select coalesce(founder_user_id::text, '') from ops.member_launch_settings where id")
if [ -z "$founder" ]; then
  founder=$(q "insert into auth.users (email, email_confirmed_at) values ('fixture-test-founder@example.test', now()) returning id")
  q "select ops.set_launch_founder('fixture-test', '$founder', 'SET THE LAUNCH FOUNDER')" >/dev/null
  q "select ops.grant_member_access('$founder', 'founder', 'fixture-test')" >/dev/null
  q "update public.profiles set username = 'fixture_test_founder', display_name = 'Fixture test founder' where id = '$founder'" >/dev/null
  q "insert into ops.age_attestations (user_id, wording_version, source) values ('$founder', 'test', 'test') on conflict do nothing" >/dev/null
fi
# External access is opened by the local test setup (supabase/tests-local/005), as on staging.
[ "$(q "select external_access_approved from ops.member_launch_settings where id")" = t ] || fail "external member access is closed: run after supabase/tests-local/005, as scripts/db/test.sh does"
q "update ops.feature_switches set enabled = true where feature in ('sharing', 'progression')" >/dev/null
q "insert into ops.feature_switches (feature, enabled) select 'progression', true where not exists (select 1 from ops.feature_switches where feature = 'progression')" >/dev/null 2>&1 || true
q "update sim.reward_settings set paused = false where id" >/dev/null
# The local tests' auto-attestation trigger would hide whether the fixture confirms age itself.
q "drop trigger if exists zz_test_auto_attest on ops.member_access" >/dev/null
# Earlier local tests leave test goal values in force; staging has the approved
# supporter benchmarks, so put those back (as the founder, through the founder
# function) before the fixture runs. The fixture itself refuses anything else.
APPROVED='{"clique_creators": 10, "meaningful_engagements": 30, "engaged_creators": 3, "supporting_weeks": 4, "external_shares": 5, "qualified_referrals": 5}'
if [ "$(q "select (select targets from sim.goal_versions where audience = 'consumer' order by id desc limit 1) is distinct from '$APPROVED'::jsonb")" = t ]; then
  q "select pg_catalog.set_config('request.jwt.claims', '{\"sub\":\"$founder\",\"role\":\"authenticated\"}', false);
     set role authenticated;
     select public.app_founder_set_goals('consumer', '$APPROVED', 'test setup: the approved supporter benchmarks, as on staging')" >/dev/null
fi
EMAIL=review-supporter@example.test
GOALS="$(q "select pg_catalog.md5(pg_catalog.string_agg(id || ':' || targets::text, ',' order by id)) from sim.goal_versions")"
[ "$(marked)" = 0 ] || fail "the database already holds fixture accounts"

# 1. Refusals change nothing.
if run seed STAGING_FOUNDER_ACCOUNT_ID=00000000-0000-4000-8000-000000000000 STAGING_FIXTURE_MEMBER_EMAIL=$EMAIL 2>/tmp/fx.err; then fail "ran with another founder"; fi
grep -q "launch founder is not the staging founder account" /tmp/fx.err || fail "wrong refusal for another founder: $(cat /tmp/fx.err)"
founder_email=$(q "select email from auth.users where id = '$founder'")
if run seed STAGING_FOUNDER_ACCOUNT_ID="$founder" STAGING_FIXTURE_MEMBER_EMAIL="$founder_email" 2>/tmp/fx.err; then fail "used a real account's address"; fi
grep -q "belongs to an existing account that is not the fixture supporter" /tmp/fx.err || fail "wrong refusal for a real address: $(cat /tmp/fx.err)"
q "create schema env_identity; create table env_identity.marker (id int)" >/dev/null
if run seed STAGING_FOUNDER_ACCOUNT_ID="$founder" STAGING_FIXTURE_MEMBER_EMAIL=$EMAIL 2>/tmp/fx.err; then fail "ran on a database marked as member Production"; fi
grep -q "member Production database" /tmp/fx.err || fail "wrong refusal for member Production: $(cat /tmp/fx.err)"
q "drop schema env_identity cascade" >/dev/null
if run seed STAGING_FOUNDER_ACCOUNT_ID="$founder" 2>/tmp/fx.err; then fail "ran without the supporter's address"; fi
[ "$(marked)" = 0 ] || fail "a refusal left fixture accounts behind"
echo "PASS: staging review fixture refuses member Production, another founder, a real account's address and a missing address, changing nothing"

# 2. Dry run: everything, then nothing.
run dry-run STAGING_FOUNDER_ACCOUNT_ID="$founder" STAGING_FIXTURE_MEMBER_EMAIL=$EMAIL >/tmp/fx.out 2>&1 || fail "dry run failed: $(cat /tmp/fx.out)"
grep -q "Dry run: rolled back; nothing changed" /tmp/fx.out || fail "dry run did not confirm: $(cat /tmp/fx.out)"
grep -q "status under_review" /tmp/fx.out || fail "dry run did not reach review: $(cat /tmp/fx.out)"
[ "$(marked)" = 0 ] || fail "the dry run left fixture accounts behind"
echo "PASS: staging review fixture dry run reaches review, then leaves nothing behind"

# 3. The metrics that exclude test accounts, before.
snapshot() {
  q "select pg_catalog.set_config('request.jwt.claims', '{\"sub\":\"$founder\",\"role\":\"authenticated\"}', false);
     set role authenticated;
     select pg_catalog.jsonb_build_object(
       'north_star', (select pg_catalog.jsonb_agg(w - 'test' - 'week_start') from pg_catalog.jsonb_array_elements(o -> 'north_star' -> 'weeks') w),
       'active_members', o -> 'members' -> 'active_members',
       'retained', o -> 'members' -> 'retained',
       'activation', public.app_founder_activation(),
       'scorecard', pg_catalog.jsonb_build_object('creator', r -> 'creator', 'consumer', r -> 'consumer'),
       'other', (o - 'generated_at' - 'week_start' - 'north_star')
                || pg_catalog.jsonb_build_object('scorecard', r - 'creator' - 'consumer' - 'definitions'))::text
     from (select public.app_founder_overview() as o, public.app_founder_progression_report() as r) x" | tail -1
}
before=$(snapshot)

# 4. Seed.
run seed STAGING_FOUNDER_ACCOUNT_ID="$founder" STAGING_FIXTURE_MEMBER_EMAIL=$EMAIL >/tmp/fx.out 2>&1 || fail "seed failed: $(cat /tmp/fx.out)"
grep -q "status under_review" /tmp/fx.out || fail "seed did not reach review: $(cat /tmp/fx.out)"
grep -q "$EMAIL" /tmp/fx.out && fail "the output shows the supporter's address"
member=$(q "select id from auth.users where email = '$EMAIL'")
[ "$(q "select sim.qualification_status('$member', 'consumer')")" = under_review ] || fail "the supporter is not under review"
[ "$(q "select count(*) from sim.qualifications where member_id = '$member' and audience = 'consumer'")" = 1 ] || fail "no qualification record"
[ "$(q "select sim.goals_met(sim.goal_values('$member', 'consumer'), (select targets from sim.goal_versions where audience = 'consumer' order by id desc limit 1), sim.goal_metrics('consumer'))")" = t ] \
  || fail "not every approved supporter goal is met: $(q "select sim.goal_values('$member', 'consumer')")"
[ "$(q "select pg_catalog.md5(pg_catalog.string_agg(id || ':' || targets::text, ',' order by id)) from sim.goal_versions")" = "$GOALS" ] || fail "the goals changed"
[ "$(marked)" = 16 ] || fail "expected 16 fixture accounts (the supporter, 10 creators, 5 referrals), found $(marked)"
[ "$(q "select count(*) from auth.users u join ops.member_access a on a.user_id = u.id
        where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true' and a.cohort = 'tester' and a.status = 'active' and a.updated_by = 'staging-review-fixture'")" = 16 ] \
  || fail "not every fixture account is an active tester granted by the fixture"
[ "$(q "select count(*) from public.profiles p join auth.users u on u.id = p.id
        where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true' and p.display_name like 'Review fixture %' and p.username like 'review\_fixture\_%'")" = 16 ] \
  || fail "not every fixture account is named as fixture data"
[ "$(q "select count(*) from sim.points_ledger where source_key like 'review:%:staging-review-fixture'")" = 5 ] || fail "expected the five referral reviews marked as the fixture's"
[ "$(q "select count(*) from sim.points_ledger l join auth.users u on u.id = l.member_id
        where u.raw_user_meta_data ->> 'staging_review_fixture' = 'true' and l.created_at < now() - interval '1 day'")" = 3 ] \
  || fail "expected exactly three backdated awards (the documented supporting weeks)"
echo "PASS: staging review fixture seed: a dedicated tester supporter meets every approved supporter goal and is under review, through the real check; goals unchanged; 16 accounts, all testers, all named as fixture data"

# 5. Test data stays out of the metrics that exclude testers.
after=$(snapshot)
for k in north_star active_members retained activation scorecard; do
  [ "$(q "select (\$j\$$before\$j\$::jsonb -> '$k') = (\$j\$$after\$j\$::jsonb -> '$k')")" = t ] || fail "the fixture moved $k, which excludes test accounts"
done
moved=$(q "select coalesce(pg_catalog.string_agg(s.k || '.' || f.k, ', ' order by s.k, f.k), 'none')
           from pg_catalog.jsonb_each(\$j\$$before\$j\$::jsonb -> 'other') s(k, v)
           cross join lateral pg_catalog.jsonb_each(s.v) f(k, v)
           where f.v is distinct from (\$j\$$after\$j\$::jsonb -> 'other' -> s.k -> f.k)")
echo "PASS: staging review fixture data is excluded from the North Star, active members, retention, activation and the progression scorecard"
echo "NOTE: founder overview figures that count every account and moved with the fixture (reported, not changed): $moved"

# 6. Seed again: nothing new.
count_all() { q "select (select count(*) from social.posts) + (select count(*) from sim.points_ledger) + (select count(*) from social.shares) + (select count(*) from auth.users)"; }
n=$(count_all)
run seed STAGING_FOUNDER_ACCOUNT_ID="$founder" STAGING_FIXTURE_MEMBER_EMAIL=$EMAIL >/tmp/fx.out 2>&1 || fail "second seed failed: $(cat /tmp/fx.out)"
grep -q "already has its supporter qualification recorded: nothing changed" /tmp/fx.out || fail "second seed did not say nothing changed"
[ "$(count_all)" = "$n" ] || fail "a second seed added data"
echo "PASS: staging review fixture seed is idempotent"

# 7. The founder's real decision works on it (check 8).
q "select pg_catalog.set_config('request.jwt.claims', '{\"sub\":\"$founder\",\"role\":\"authenticated\"}', false);
   set role authenticated;
   select public.app_founder_decide_qualification('$member', 'consumer', 'approved', 'staging review fixture check', null, null)" >/dev/null
[ "$(q "select sim.qualification_status('$member', 'consumer')")" = qualified ] || fail "the founder's approval did not qualify the fixture supporter"
echo "PASS: staging review fixture: the founder's approval qualifies the fixture supporter"

# 8. Remove: nothing fixture-related remains; the register has each account.
ids=$(q "select string_agg(id::text, ',') from auth.users where raw_user_meta_data ->> 'staging_review_fixture' = 'true'")
started=$(q "select now()")
run remove STAGING_FOUNDER_ACCOUNT_ID="$founder" >/tmp/fx.out 2>&1 || fail "remove failed: $(cat /tmp/fx.out)"
[ "$(marked)" = 0 ] || fail "fixture accounts remain after remove"
[ "$(q "select count(*) from ops.deletion_register where kind = 'account' and event = 'deleted' and target_id::text = any(string_to_array('$ids', ',')) and occurred_at >= '$started'")" = 16 ] \
  || fail "the deletion register does not hold every removed account"
leftover=$("${P[@]}" -At 2>&1 <<SQL | sed -n 's/.*LEFT://p'
do \$\$
declare
  c record;
  n bigint;
  found text := '';
begin
  for c in select table_schema, table_name, column_name from information_schema.columns
           where data_type = 'uuid' and table_schema not in ('pg_catalog', 'information_schema', 'pg_toast')
             -- Kept on purpose for every deleted account (ids and times, no foreign key):
             -- the deletion register and the membership history, which ends with 'removed'.
             and not (table_schema = 'ops' and table_name in ('deletion_register', 'member_access_events'))
             and (table_schema, table_name) in (select table_schema, table_name from information_schema.tables where table_type = 'BASE TABLE') loop
    execute format('select count(*) from %I.%I where %I::text = any(\$1)', c.table_schema, c.table_name, c.column_name) into n using string_to_array('$ids', ',');
    if n > 0 then found := found || format('%s.%s.%s=%s ', c.table_schema, c.table_name, c.column_name, n); end if;
  end loop;
  raise notice 'LEFT:%', found;
end \$\$;
SQL
)
[ -z "${leftover// /}" ] || fail "fixture ids remain after remove: $leftover"
[ "$(q "select count(*) from (select distinct on (e.user_id) e.action from ops.member_access_events e
        where e.user_id::text = any(string_to_array('$ids', ',')) order by e.user_id, e.id desc) x where x.action = 'removed'")" = 16 ] \
  || fail "the membership history of a removed fixture account does not end with its removal"
[ "$(q "select count(*) from social.posts where body like 'Review fixture %'")" = 0 ] || fail "fixture posts remain after remove"
"${P[@]}" -f supabase/tests/032_deletion_register.sql >/dev/null || fail "the deletion register check fails after remove"
echo "PASS: staging review fixture remove: every fixture account and everything they made is gone, each account is in the deletion register, and the register check still passes"

# Restore the local tests' attestation trigger for anything that runs after.
"${P[@]}" -f supabase/tests-local/006_adult_attestation_for_tests.sql >/dev/null
