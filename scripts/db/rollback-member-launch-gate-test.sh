#!/usr/bin/env bash
# Tests 20261129000000 (the member launch gate) and its staging rollback,
# scripts/db/staging-rollback-member-launch-gate.sql, against a LOCAL Supabase
# database, where postgres is a non-superuser login as on hosted Supabase.
# Local only: it refuses any other database. Called by scripts/db/rollback-test.sh
# first, because 20261129000000 is the newest migration.
#
#   1. Bypass probes: service_role cannot skip triggers
#      (session_replication_role) or alter the table. postgres CAN: Supabase
#      allows it to set session_replication_role (supautils), which skips the
#      gate, and as the owner it can disable the trigger. Both are documented
#      bypasses; check 014 catches a disabled trigger, and the member
#      Production check catches membership given while bypassed.
#   2. Every rollback refusal: the gate closed, a bad mode, a missing or wrong
#      phrase, a later migration, a missing record. Each changes nothing.
#   3. The migration with zero, one (plus expired and revoked ones) and two
#      active founder-cohort accounts: the founder is set only when there is
#      exactly one; otherwise it fails closed, and existing access is kept.
#   4. check changes nothing; apply removes exactly the gate's objects and
#      record and keeps every membership; a second run refuses.
#
# Leaves the migration removed, ready for the earlier rollback tests.
# rollback-test.sh reapplies everything at the end.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-member-launch-gate.sql
MIGRATION=supabase/migrations/20261129000000_member_launch_gate.sql
PHRASE='REMOVE THE STAGING MEMBER LAUNCH GATE'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  member launch gate: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  member launch gate: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
open_gate() { q "select ops.set_external_access('rollback-test', true, 'APPROVE EXTERNAL MEMBER ACCESS')" >/dev/null; }
reapply() {
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -f "$MIGRATION" >/dev/null 2>&1 \
    && q "insert into supabase_migrations.schema_migrations (version, name) values ('20261129000000', 'member_launch_gate')" >/dev/null
}
gate_state() { q "select coalesce(founder_user_id::text, 'none') || '|' || case when external_access_approved then 't' else 'f' end from ops.member_launch_settings"; }
U() { printf '00000000-0000-4000-8000-0000000d%04d' "$1"; }
make_users() { # make_users <n...>: test accounts with no membership
  for n in "$@"; do
    q "insert into auth.users (id, email, email_confirmed_at) values ('$(U "$n")', 'lg-$n@example.test', now()) on conflict do nothing" >/dev/null
  done
}
# Cleanup on this throwaway local database: the membership history is append
# only, so the test's own records are removed with triggers skipped
# (session_replication_role = replica, the documented bypass), leaving no
# membership data for the rollback tests that follow.
drop_users() {
  psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" \
    -c "delete from ops.member_access_events where user_id in (select id from auth.users where email like 'lg-%@example.test')" \
    -c "delete from ops.member_access where user_id in (select id from auth.users where email like 'lg-%@example.test')" \
    -c "delete from public.profiles where id in (select id from auth.users where email like 'lg-%@example.test')" \
    -c "delete from auth.users where email like 'lg-%@example.test'" -c "commit" >/dev/null 2>&1 || true
}
founders() { q "select count(*) from ops.member_access where cohort = 'founder' and status = 'active' and (expires_at is null or expires_at > now())"; }
trap drop_users EXIT
drop_users

[ "$(q "select rolsuper from pg_roles where rolname = current_user")" = f ] && ok "runs as a non-superuser postgres login, as on hosted Supabase" || bad "expected a non-superuser login"
[ "$(founders)" = 0 ] || { bad "this test needs a database with no active founder-cohort accounts (found $(founders))"; echo "Member launch gate tests: $pass passed, $failed failed"; exit 1; }

# --- 1. Bypass probes --------------------------------------------------------------
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "set role service_role; set session_replication_role = replica" 2>&1); code=$?
[ $code -ne 0 ] && grep -qi 'permission denied' <<<"$out" \
  && ok "service_role cannot skip triggers (session_replication_role)" || bad "service_role set session_replication_role (exit $code): $out"
# postgres can (Supabase's supautils allows it), and it skips the gate: shown in a rolled-back transaction.
make_users 9
out=$(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 -c "begin" -c "select ops.set_external_access('rollback-test', false)" \
  -c "set local session_replication_role = replica" \
  -c "insert into ops.member_access (user_id, cohort, status, updated_by) values ('$(U 9)', 'founder', 'active', 'probe')" \
  -c "select 'bypassed ' || count(*) from ops.member_access where user_id = '$(U 9)'" -c "rollback" 2>&1); code=$?
[ $code -eq 0 ] && grep -q 'bypassed 1' <<<"$out" && [ "$(q "select count(*) from ops.member_access where user_id = '$(U 9)'")" = 0 ] \
  && ok "postgres CAN skip the gate with session_replication_role = replica (a documented bypass; rolled back here)" \
  || bad "the replica-mode probe did not behave as documented (exit $code): $out"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "set role service_role; alter table ops.member_access disable trigger member_access_launch_gate" 2>&1); code=$?
[ $code -ne 0 ] && grep -qi 'must be owner\|permission denied' <<<"$out" && ok "service_role cannot disable the gate trigger" || bad "service_role altered the table (exit $code): $out"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin; alter table ops.member_access disable trigger member_access_launch_gate;" -f supabase/tests/014_member_launch_gate.sql -c "rollback;" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'FAIL: the launch gate trigger is disabled' <<<"$out" \
  && ok "the table owner (postgres) can disable the trigger (a documented bypass), and check 014 then fails" || bad "owner bypass not caught by check 014 (exit $code)"
[ "$(q "select tgenabled from pg_trigger where tgname = 'member_access_launch_gate'")" = O ] && ok "and the probe left the trigger enabled" || bad "the trigger is not enabled after the probe"

# --- 2. Rollback refusals ------------------------------------------------------------
# Start closed (earlier suites may have opened it for their own accounts): recorded, takes nobody's access.
q "select ops.set_external_access('rollback-test', false)" >/dev/null
[ "$(gate_state | cut -d'|' -f2)" = f ] || bad "could not close the gate for the test"
out=$(rollback apply "$PHRASE"); code=$?
[ $code -ne 0 ] && grep -q 'external member access is not approved' <<<"$out" && [ "$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261129000000'")" = 1 ] \
  && ok "refuses while the gate is closed (removing it would widen access), changing nothing" || bad "rollback with the gate closed (exit $code)"
open_gate
for case in "bogus|" "apply|" "apply|remove the staging member launch gate"; do
  out=$(rollback "${case%%|*}" "${case#*|}"); code=$?
  [ $code -ne 0 ] && [ "$(q "select to_regclass('ops.member_launch_settings') is not null")" = t ] && ok "refuses mode '${case%%|*}' with phrase '${case#*|}'" || bad "accepted mode '${case%%|*}' (exit $code)"
done
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261130000000', 'later_test')" >/dev/null
out=$(rollback apply "$PHRASE"); code=$?
q "delete from supabase_migrations.schema_migrations where version = '20261130000000'" >/dev/null
[ $code -ne 0 ] && grep -q 'later migration' <<<"$out" && ok "refuses while a later migration is recorded" || bad "later migration (exit $code)"
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(q "select to_regclass('ops.member_launch_settings') is not null")" = t ] \
  && ok "check mode passes once open, and changes nothing" || bad "check mode (exit $code): $(tail -2 <<<"$out")"

# --- 3. The migration with zero, one and two founders ------------------------------
make_users 1 2 3 4 5
q "insert into ops.member_access (user_id, cohort, status, updated_by) values ('$(U 5)', 'tester', 'active', 'test') on conflict do nothing" >/dev/null
# Zero.
rollback apply "$PHRASE" >/dev/null && reapply
st=$(gate_state)
[ "$st" = "none|f" ] && [ "$(q "select detail from ops.member_launch_events where action = 'founder_not_set_by_migration'")" = '0 active founder-cohort accounts; set it with ops.set_launch_founder' ] \
  && ok "zero founder-cohort accounts: no founder is set (recorded), and the gate starts closed" || bad "zero founders ($st)"
out=$(q "select ops.grant_member_access('$(U 1)', 'founder', 'test')" 2>&1); code=$?
out2=$(q "select ops.grant_member_access('$(U 2)', 'tester', 'test')" 2>&1); code2=$?
[ $code -ne 0 ] && [ $code2 -ne 0 ] && [ "$(q "select ops.member_access_active('$(U 5)')")" = t ] \
  && ok "  with no founder, nobody can be given membership (fail closed), and existing access is kept" || bad "  no founder: grants (exit $code/$code2)"
# One active, plus an expired and a revoked founder-cohort record (written while the gate is absent).
open_gate; rollback apply "$PHRASE" >/dev/null
q "insert into ops.member_access (user_id, cohort, status, updated_by) values ('$(U 1)', 'founder', 'active', 'test');
   insert into ops.member_access (user_id, cohort, status, expires_at, updated_by) values ('$(U 2)', 'founder', 'active', now() - interval '1 day', 'test');
   insert into ops.member_access (user_id, cohort, status, revoked_at, updated_by) values ('$(U 3)', 'founder', 'revoked', now(), 'test')" >/dev/null
reapply
[ "$(gate_state)" = "$(U 1)|f" ] && [ "$(q "select count(*) from ops.member_launch_events where action = 'founder_set_by_migration'")" = 1 ] \
  && ok "one active founder (plus an expired and a revoked record): that account is the launch founder (recorded)" || bad "one founder ($(gate_state))"
out=$(q "select ops.grant_member_access('$(U 1)', 'founder', 'test')" 2>&1); code=$?
out2=$(q "select ops.grant_member_access('$(U 2)', 'founder', 'test')" 2>&1); code2=$?
[ $code -eq 0 ] && [ $code2 -ne 0 ] && grep -q 'only the launch founder may hold the founder cohort' <<<"$out2" \
  && ok "  the founder can be renewed; the expired founder-cohort account cannot be re-activated as founder" || bad "  one founder renewals (exit $code/$code2)"
# Two active founders: ambiguous.
q "delete from ops.member_access where user_id in ('$(U 2)', '$(U 3)')" >/dev/null
open_gate; rollback apply "$PHRASE" >/dev/null
q "insert into ops.member_access (user_id, cohort, status, updated_by) values ('$(U 2)', 'founder', 'active', 'test')" >/dev/null
reapply
[ "$(gate_state)" = "none|f" ] && [ "$(q "select detail from ops.member_launch_events where action = 'founder_not_set_by_migration'")" = '2 active founder-cohort accounts; set it with ops.set_launch_founder' ] \
  && ok "two active founders: ambiguous, so no founder is set (recorded), fail closed" || bad "two founders ($(gate_state))"
[ "$(q "select ops.member_access_active('$(U 1)') and ops.member_access_active('$(U 2)') and ops.member_access_active('$(U 5)')")" = t ] \
  && ok "  and every existing membership is kept (both founders and the tester)" || bad "  existing access was disrupted"
out=$(q "select ops.grant_member_access('$(U 1)', 'founder', 'test', now() + interval '1 year')" 2>&1); code=$?
out2=$(q "update ops.member_access set reason = 'kept' where user_id = '$(U 2)'" 2>&1); code2=$?
out3=$(q "select ops.revoke_member_access('$(U 2)', 'test')" 2>&1); code3=$?
[ $code -ne 0 ] && [ $code2 -eq 0 ] && [ $code3 -eq 0 ] \
  && ok "  nothing can be widened (even for either founder), while unrelated updates and revoking still work" || bad "  ambiguous founder writes (exit $code/$code2/$code3)"
out=$(psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin; select ops.set_launch_founder('test', '$(U 1)', 'SET THE LAUNCH FOUNDER'); select ops.grant_member_access('$(U 1)', 'founder', 'test'); rollback;" 2>&1); code=$?
[ $code -eq 0 ] && ok "  the founder can then be set once, with its phrase, after which renewing works (tried in a rolled-back transaction)" || bad "  setting the founder (exit $code): $out"

# --- 4. Apply removes exactly the gate --------------------------------------------
open_gate
members_before=$(q "select count(*) || '|' || count(*) filter (where status = 'active') from ops.member_access")
out=$(rollback apply "$PHRASE"); code=$?
after=$(q "select concat_ws('|',
  not exists (select 1 from supabase_migrations.schema_migrations where version = '20261129000000'),
  exists (select 1 from supabase_migrations.schema_migrations where version = '20261128000000'),
  to_regclass('ops.member_launch_settings') is null, to_regclass('ops.member_launch_events') is null,
  to_regprocedure('ops.member_launch_gate()') is null, to_regprocedure('ops.set_external_access(text, boolean, text)') is null,
  not exists (select 1 from pg_trigger where tgname = 'member_access_launch_gate'),
  to_regprocedure('ops.grant_member_access(uuid, text, text, timestamptz, text)') is not null)")
[ $code -eq 0 ] && grep -q 'Applied' <<<"$out" && [ "$after" = "t|t|t|t|t|t|t|t" ] && [ "$(q "select count(*) || '|' || count(*) filter (where status = 'active') from ops.member_access")" = "$members_before" ] \
  && ok "apply removes exactly the gate's objects and record, and keeps every membership" || bad "apply (exit $code, state $after)"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'missing' <<<"$out" && ok "a second run refuses (nothing left to remove)" || bad "a second run did not refuse (exit $code)"
drop_users
left=$(q "select (select count(*) from ops.member_access) + (select count(*) from ops.member_access_events)")
[ "$left" = 0 ] && ok "the test leaves no membership data behind" || bad "membership data left behind ($left rows)"

echo "Member launch gate tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
