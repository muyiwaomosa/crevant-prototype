#!/usr/bin/env bash
# Tests the staging rollback of 20261209000000 (ad creatives),
# scripts/db/staging-rollback-ad-creatives.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261209000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-ad-creatives.sql
PHRASE='REMOVE THE STAGING AD CREATIVES'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  ad creatives rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  ad creatives rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regprocedure('ads.creative_ready(uuid)') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261209000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261209000000 is not applied here"; echo "Ad creatives rollback tests: $pass passed, $failed failed"; exit 1; }
replica "update ads.campaigns set creative_kind = 'text', media_path = null, media_alt = null"

refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
A=00000000-0000-4000-8000-fdfdfd00b016
q "insert into ads.advertisers (id, name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action) values ('$A', 'a', 'https://a.example', 'o', 'p', 'd', 'c', 'traffic', 'visit') on conflict do nothing" >/dev/null
for case in "video campaign|insert into ads.campaigns (advertiser_id, name, placement, starts_on, ends_on, headline, body, cta_label, landing_url, creative_kind, media_path, media_alt) values ('$A', 'v', 'feed', current_date, current_date, 'h', 'b', 'c', 'https://a.example', 'video', 'x.mp4', 'alt')|delete from ads.campaigns"; do
  name=${case%%|*}; rest=${case#*|}; add=${rest%%|*}; remove=${rest#*|}
  replica "$add"
  refuses "while a $name exists" "check" "" "rows of data depend on ad creatives"
  replica "$remove"
done
q "delete from ads.advertisers where id = '$A'" >/dev/null
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from information_schema.columns where table_schema = 'ads' and column_name in ('creative_kind', 'media_path', 'media_alt', 'played_at', 'completed_at')")
fns=$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'ads' and p.proname in ('creative_ready', 'creative_files')")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261209000000'")
bkt=$(q "select case when to_regclass('storage.buckets') is null then 0 else (select count(*) from storage.buckets where id = 'ad-creatives') end")
[ "$left$fns$rec$bkt" = 0000 ] && ok "apply removed the columns, helpers, bucket and the record" || bad "left behind: columns $left, functions $fns, record $rec, bucket $bkt"
src=$(q "select (select prosrc from pg_proc where oid = 'sim.award(uuid, text, text, uuid, uuid)'::regprocedure) !~ 'restored:' and pg_get_function_result('public.app_ad_for(text, uuid)'::regprocedure) !~ 'media_path'")
[ "$src" = t ] && ok "apply put back the earlier award and serving functions" || bad "the earlier functions were not restored"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Ad creatives rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
