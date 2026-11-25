#!/usr/bin/env bash
# Tests the staging rollback of 20261130000000 (foundation v2),
# scripts/db/staging-rollback-foundation-v2.sql, against a LOCAL Supabase
# database. Local only: it refuses any other database. Called first by
# scripts/db/rollback-test.sh, because 20261130000000 is the newest migration.
#
#   1. Every refusal: a bad mode, a missing or wrong phrase, member data present
#      (each kind), a later migration. Each changes nothing.
#   2. check changes nothing; apply removes exactly the migration's objects and
#      record and restores the earlier access check; a second run refuses.
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
SQL=scripts/db/staging-rollback-foundation-v2.sql
PHRASE='REMOVE THE STAGING FOUNDATION V2'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  foundation v2 rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  foundation v2 rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
present() { q "select to_regclass('ops.registrations') is not null and to_regclass('analytics.events') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261130000000')"; }
refuses() { # refuses <what> <mode> <phrase> <expected message>
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261130000000 is not applied here"; echo "Foundation v2 rollback tests: $pass passed, $failed failed"; exit 1; }

# Test setup: the local-only automatic confirmation (scripts/db/local-open-launch-gate.sh)
# depends on ops.age_attestations; remove it, and clear the test data the
# local suites left, so this starts from the empty state of a fresh staging deploy.
psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 \
  -c "drop trigger if exists zz_test_auto_attest on ops.member_access" \
  -c "drop function if exists test_support.auto_attest()" \
  -c "begin" -c "set local session_replication_role = replica" \
  -c "delete from analytics.events" -c "delete from ops.registrations" -c "delete from ops.registration_links" \
  -c "delete from ops.registration_setting_events" -c "delete from ops.age_attestations" -c "commit" >/dev/null 2>&1

# 1. Refusals.
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00ab01
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'fv2-rollback@example.test', now()) on conflict do nothing" >/dev/null
q "insert into ops.age_attestations (user_id, wording_version, source) values ('$U', 'adult-v1', 'in_app')" >/dev/null
refuses "while an adult confirmation exists" "check" "" "rows of member data exist"
q "delete from ops.age_attestations where user_id = '$U'" >/dev/null
q "select ops.set_registration_settings('rollback-test', 'probe', true)" >/dev/null
refuses "while the settings history has a change" "check" "" "rows of member data exist"
psql "$DB_URL" -X -q -c "begin" -c "set local session_replication_role = replica" -c "delete from ops.registration_setting_events" -c "commit" >/dev/null 2>&1
q "select ops.create_invitation_link('rollback-test')" >/dev/null
refuses "while a registration link exists" "check" "" "rows of member data exist"
q "delete from ops.registration_links" >/dev/null
q "insert into analytics.events (name, data_class) values ('followed', 'test')" >/dev/null
refuses "while events exist" "check" "" "rows of member data exist"
q "delete from analytics.events" >/dev/null
q "delete from auth.users where id = '$U'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

# 2. check, then apply.
out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where (n.nspname, c.relname) in (('ops','age_attestations'),('ops','registrations'),('ops','registration_links'),('ops','registration_settings'),('ops','registration_setting_events'),('ops','blocked_email_domains'),('analytics','events'))")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_attest_adult','app_claim_access','app_feed_page','app_member_posts_page','app_my_referral_link','app_founder_registration','app_founder_set_registration','app_founder_create_invitation_link','hook_before_user_created')) or (n.nspname = 'ops' and p.proname in ('adult_attested','registration_check','set_registration_settings','create_invitation_link','new_link_code','open_invitation_exists','registrations_guard','age_attestations_permanent')) or (n.nspname = 'analytics' and p.proname in ('capture','record','class_for'))")
trg=$(q "select count(*) from pg_trigger where tgname like 'events\_%' and not tgisinternal")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261130000000'")
[ "$left$fns$trg$rec" = 0000 ] && ok "apply removed every table, function, trigger and the record" || bad "left behind: tables $left, functions $fns, triggers $trg, record $rec"
q "select position('adult_attested' in prosrc) = 0 and position('ops.member_access_active(v_uid)' in prosrc) > 0 from pg_proc where oid = 'social.current_access()'::regprocedure" | grep -q t \
  && ok "the access check is as 20261122000000 defined it" || bad "the access check was not restored"
q "select position('attestation_required' in prosrc) = 0 from pg_proc where oid = 'public.app_access_state()'::regprocedure" | grep -q t \
  && ok "the access state is as 20261122000000 defined it" || bad "the access state was not restored"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Foundation v2 rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
