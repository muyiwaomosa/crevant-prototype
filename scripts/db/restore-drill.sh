#!/usr/bin/env bash
# Backup and restore drill, on the LOCAL Supabase database only.
#
# What a restore does on Supabase (a backup restored into a new database) is
# done here end to end, against a database full of journey data:
#
#   1. a full pg_dump of the app database (custom format, as Supabase backups);
#   2. restored into a NEW, empty database on the same server (restore_drill);
#   3. every table's row count compared, schema by schema (auth, public,
#      social, sim, ads, ops, storage);
#   4. the financial and advertising reconciliation
#      (scripts/db/audit/reconciliation.sql) run on both: every check must
#      pass, and the restored answers must equal the originals;
#   5. the member authorization surface audit run on the restored copy, so
#      grants, security definer functions and RLS survive a restore;
#   6. the drill database dropped.
#
# It never connects to a hosted project. It talks to the local database
# container (DB_CONTAINER, default supabase_db_crevant-prototype) through
# docker exec, so the dump uses the server's own pg_dump version. Photos and
# videos live in Storage, outside the database; their rows (storage.objects)
# are covered, their files are not (Supabase Storage keeps those).
#
#   scripts/db/restore-drill.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

C="${DB_CONTAINER:-supabase_db_crevant-prototype}"
DRILL=restore_drill
fail() { echo "FAIL: $1" >&2; exit 1; }

docker inspect "$C" >/dev/null 2>&1 || fail "the local database container $C is not running"
q() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$C" psql -U supabase_admin -d "$1" -X -q -v ON_ERROR_STOP=1 -At "${@:2}"; }

COUNTS="select n.nspname || '.' || c.relname || '=' || (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p') and n.nspname in ('auth', 'public', 'social', 'sim', 'ads', 'ops', 'storage')
order by 1"

before_counts="$(q postgres -c "$COUNTS")"
before_recon="$(q postgres < scripts/db/audit/reconciliation.sql)"
[ -n "$before_counts" ] || fail "no tables found"
grep -q '|f|' <<<"$before_recon" && fail "the reconciliation fails before the backup:
$(grep '|f|' <<<"$before_recon")"
rows="$(awk -F= '{s += $2} END {print s}' <<<"$before_counts")"
echo "PASS: before the backup, every reconciliation check passes ($(wc -l <<<"$before_recon") checks, $rows rows in $(wc -l <<<"$before_counts") tables)"

docker exec "$C" sh -c "pg_dump -U supabase_admin -d postgres -Fc -f /tmp/drill.dump"
echo "PASS: full backup taken ($(docker exec "$C" sh -c 'wc -c < /tmp/drill.dump' | tr -d ' ') bytes)"

q postgres -c "drop database if exists $DRILL" -c "create database $DRILL" >/dev/null
if ! out="$(docker exec "$C" sh -c "pg_restore -U supabase_admin -d $DRILL /tmp/drill.dump" 2>&1)"; then
  q postgres -c "drop database if exists $DRILL" >/dev/null || true
  fail "the restore reported errors:
$(grep 'error' <<<"$out" | head -20)"
fi
echo "PASS: restored into a new, empty database with no errors"

after_counts="$(q "$DRILL" -c "$COUNTS")"
after_recon="$(q "$DRILL" < scripts/db/audit/reconciliation.sql)"
if [ "$before_counts" != "$after_counts" ]; then
  diff <(echo "$before_counts") <(echo "$after_counts") | head -20 >&2
  fail "row counts differ after the restore"
fi
echo "PASS: every table has the same row count after the restore"
[ "$before_recon" = "$after_recon" ] || fail "the reconciliation differs after the restore:
$(diff <(echo "$before_recon") <(echo "$after_recon"))"
echo "PASS: the restored reconciliation matches the original, every check passing"

docker exec "$C" sh -c 'rm -rf /tmp/drill-audit && mkdir -p /tmp/drill-audit'
docker cp scripts/db/audit/member-surface.sql "$C:/tmp/drill-audit/member-surface.sql" >/dev/null
docker cp scripts/db/audit/member-surface-checks.sql "$C:/tmp/drill-audit/member-surface-checks.sql" >/dev/null
# The audit reads policy text, which names auth.uid() only when auth is not on
# the search path, so it runs with the search path the CI audit uses.
if ! audit="$(docker exec -e PGOPTIONS='-c search_path=public,extensions' "$C" psql -U supabase_admin -d "$DRILL" -X -q -v ON_ERROR_STOP=1 -f /tmp/drill-audit/member-surface.sql 2>&1)"; then
  q postgres -c "drop database if exists $DRILL" >/dev/null || true
  fail "the member surface audit fails on the restored copy:
$(grep -E 'FAIL|ERROR' <<<"$audit" | head -10)"
fi
echo "PASS: grants, security definer functions and row level security survive the restore (member surface audit)"

q postgres -c "drop database $DRILL" >/dev/null
docker exec "$C" sh -c 'rm -rf /tmp/drill.dump /tmp/drill-audit'
echo "Restore drill passed"
