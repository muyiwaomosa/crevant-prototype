#!/usr/bin/env bash
# Tests the staging rollback of 20261211000000 (unified onboarding),
# scripts/db/staging-rollback-unified-onboarding.sql, against a LOCAL Supabase database.
# Local only. Called by scripts/db/rollback-test.sh after the
# privacy and switches rollback (20261212000000) has run.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-unified-onboarding.sql
PHRASE='REMOVE THE STAGING UNIFIED ONBOARDING'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  unified onboarding rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  unified onboarding rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('social.creator_topics') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261211000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261211000000 is not applied here"; echo "Unified onboarding rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from social.creator_topics; delete from ads.advertisers where requested_by is not null or requested_at is not null"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b01a
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'ou-rollback@example.test', now()) on conflict do nothing" >/dev/null
for case in "posting topic|insert into social.creator_topics (user_id, topic) select '$U', slug from social.topics limit 1|delete from social.creator_topics" \
            "member advertising request|insert into ads.advertisers (name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action, requested_by, requested_at) values ('Probe', 'https://probe.example', 'x', 'x', 'x', 'x', 'sales', 'x', '$U', now())|delete from ads.advertisers where requested_by is not null"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of data depend on unified onboarding"
  replica "$remove"
done
q "delete from auth.users where id = '$U'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_class where oid = coalesce(to_regclass('social.creator_topics'), 0)")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where (n.nspname = 'public' and p.proname in ('app_set_creator_topics', 'app_my_creator_setup', 'app_member_creator_topics', 'app_my_inviter', 'app_founder_create_creator_invitation', 'app_founder_invitation_links', 'app_founder_revoke_invitation_link', 'app_request_advertising', 'app_my_advertising', 'app_my_campaign_report')) or (n.nspname = 'ads' and p.proname = 'campaign_report')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261211000000'")
old=$(q "select position('private_count' in (select prosrc from pg_proc where oid = 'public.app_founder_campaign_report(uuid)'::regprocedure)) > 0 and position('creator_topics' in (select prosrc from pg_proc where oid = 'public.app_suggested_creators(integer)'::regprocedure)) = 0 and not exists (select 1 from information_schema.columns where table_schema = 'ads' and table_name = 'advertisers' and column_name in ('requested_by', 'requested_at')) and has_function_privilege('authenticated', 'public.app_suggested_creators(integer)', 'EXECUTE')")
[ "$left$fns$rec$old" = 000t ] && ok "apply removed the onboarding objects and the record, and put back suggestions, the campaign report and the advertiser table" || bad "left behind: table $left, functions $fns, record $rec, earlier functions $old"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Unified onboarding rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
