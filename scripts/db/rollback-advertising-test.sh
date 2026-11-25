#!/usr/bin/env bash
# Tests the staging rollback of 20261208000000 (advertising),
# scripts/db/staging-rollback-advertising.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261208000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-advertising.sql
PHRASE='REMOVE THE STAGING ADVERTISING'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  advertising rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  advertising rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regclass('ads.campaigns') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261208000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261208000000 is not applied here"; echo "Advertising rollback tests: $pass passed, $failed failed"; exit 1; }
replica "delete from ads.revenue_attributions; delete from ads.impressions; delete from ads.exclusions; delete from ads.preferences; delete from ads.campaigns; delete from ads.advertisers"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
U=00000000-0000-4000-8000-fdfdfd00b015
q "insert into auth.users (id, email, email_confirmed_at) values ('$U', 'ad-rollback@example.test', now()) on conflict do nothing" >/dev/null
for case in "preference|insert into ads.preferences (member_id, category) values ('$U', 'pets')|delete from ads.preferences" \
            "exclusion|insert into ads.exclusions (member_id, kind, target) values ('$U', 'category', 'pets')|delete from ads.exclusions" \
            "advertiser|insert into ads.advertisers (name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action) values ('a', 'https://a.example', 'o', 'p', 'd', 'c', 'traffic', 'visit')|delete from ads.advertisers"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of advertising data exist"
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
left=$(q "select count(*) from pg_namespace where nspname = 'ads'")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('app_ad_categories', 'app_ad_event', 'app_ad_for', 'app_clear_ad_preferences', 'app_founder_ad_demand', 'app_founder_ads', 'app_founder_attribute_campaign_revenue', 'app_founder_campaign_report', 'app_founder_record_advertiser_feedback', 'app_founder_record_conversions', 'app_founder_review_advertiser', 'app_founder_save_advertiser', 'app_founder_save_campaign', 'app_founder_set_campaign_status', 'app_my_ad_exclusions', 'app_remove_ad_exclusion', 'app_set_ad_preference')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261208000000'")
[ "$left$fns$rec" = 000 ] && ok "apply removed the ads schema, every advertising function and the record" || bad "left behind: schema $left, functions $fns, record $rec"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Advertising rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
