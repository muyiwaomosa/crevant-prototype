#!/usr/bin/env bash
# Tests the staging rollback of 20261214000000 (release hardening),
# scripts/db/staging-rollback-release-hardening.sql, against a LOCAL Supabase database.
# Local only. Called first by scripts/db/rollback-test.sh, because
# 20261212000000 is the newest migration.
set -uo pipefail
cd "$(dirname "$0")/../.."
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: this test only runs against a local database." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-rollback-release-hardening.sql
PHRASE='REMOVE THE STAGING RELEASE HARDENING'
PSQL=(psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1)
pass=0; failed=0
ok()  { echo "PASS  release hardening rollback: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  release hardening rollback: $1"; failed=$((failed + 1)); }
rollback() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -v mode="$1" -v confirm="$2" -f "$SQL" 2>&1; }
q() { "${PSQL[@]}" -c "$1"; }
replica() { psql "$DB_URL" -X -q -v ON_ERROR_STOP=1 -c "begin" -c "set local session_replication_role = replica" -c "$1" -c "commit" >/dev/null 2>&1; }
present() { q "select to_regprocedure('ops.forget_member_invitations(uuid)') is not null and exists (select 1 from supabase_migrations.schema_migrations where version = '20261214000000')"; }
refuses() {
  local out code
  out=$(rollback "$2" "$3"); code=$?
  if [ $code -ne 0 ] && grep -q "$4" <<<"$out" && [ "$(present)" = t ]; then ok "refuses $1, changing nothing"; else bad "did not refuse $1 (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"; fi
}

[ "$(present)" = t ] || { bad "20261214000000 is not applied here"; echo "Release hardening rollback tests: $pass passed, $failed failed"; exit 1; }
refuses "a bad mode" "drop" "" "mode must be check or apply"
refuses "apply without the phrase" "apply" "" "needs the confirmation phrase"
refuses "apply with a wrong phrase" "apply" "remove it" "needs the confirmation phrase"
replica "insert into sim.revenue_entries (month, kind, creator_id, net_cents, note, recorded_by) values ('2026-01-01', 'content_ad', null, 1, 'probe', 'rollback-test')"
refuses "while revenue of a deleted creator exists" "check" "" "rows of data depend on release hardening"
replica "delete from sim.revenue_entries where recorded_by = 'rollback-test'"
q "insert into supabase_migrations.schema_migrations (version, name) values ('20261231000000', 'later')" >/dev/null
refuses "while a later migration is recorded" "check" "" "later migration"
q "delete from supabase_migrations.schema_migrations where version = '20261231000000'" >/dev/null

out=$(rollback check ""); code=$?
[ $code -eq 0 ] && grep -q 'Check only' <<<"$out" && [ "$(present)" = t ] && ok "check passes and changes nothing" || bad "check (exit $code): $(tail -2 <<<"$out" | tr '\n' ' ')"
out=$(rollback apply "$PHRASE"); code=$?
if [ $code -eq 0 ] && grep -q 'Applied' <<<"$out"; then ok "apply succeeds"; else bad "apply (exit $code): $(tail -3 <<<"$out" | tr '\n' ' ')"; fi
left=$(q "select count(*) from pg_proc where oid in (coalesce(to_regprocedure('ops.forget_member_invitations(uuid)'), 0), coalesce(to_regprocedure('sim.revenue_needs_creator()'), 0))")
rec=$(q "select count(*) from supabase_migrations.schema_migrations where version = '20261214000000'")
old=$(q "select (select count(*) from pg_trigger where tgname in ('block_events_append_only', 'enforcements_no_update', 'enforcement_lifts_no_update', 'member_notices_read_only', 'appeals_decided_once') and tgqual is null) = 5 and exists (select 1 from pg_constraint where conname = 'revenue_content_has_creator') and not exists (select 1 from information_schema.columns where table_schema = 'sim' and table_name = 'settlement_lines' and column_name = 'id') and position('forget_member_invitations' in (select prosrc from pg_proc where oid = 'public.app_founder_delete_member(bigint, text)'::regprocedure)) = 0")
[ "$left$rec$old" = 00t ] && ok "apply removed the hardening objects and the record, and put back the triggers, key, check and functions" || bad "left behind: objects $left, record $rec, earlier state $old"
out=$(rollback check ""); code=$?
[ $code -ne 0 ] && grep -q 'expected objects are missing' <<<"$out" && ok "a second run refuses" || bad "a second run did not refuse (exit $code)"

echo "Release hardening rollback tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
