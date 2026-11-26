#!/usr/bin/env bash
# Controlled recovery exercise (docs/RECOVERY.md): deleted accounts and posts
# stay deleted after a database restore. LOCAL Supabase only.
#
#   1. A member's account and another member's post exist; a full backup is
#      taken (as Supabase's daily backup would be).
#   2. After the backup, the account is deleted and the post is deleted.
#   3. The real post-media drain runs (a copy of the function in the Edge
#      runtime image) and writes the deletion register to its log.
#   4. The backup is restored into a new database: without reconciliation,
#      the deleted account and post are back (the danger this guards against).
#   5. The deletions are read from the function's log (not the database) and
#      re-applied with ops.reapply_deletions.
#   6. The account is gone, so it cannot sign in; the post is not visible.
#
# Requires local Supabase with every migration applied and Docker. Run after
# the journeys in CI (scripts/e2e/auth-journey.sh).
set -euo pipefail
cd "$(dirname "$0")/../.."

C="${DB_CONTAINER:-supabase_db_crevant-prototype}"
EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
PORT="${RECOVERY_DRAIN_PORT:-54397}"
DRILL=recovery_exercise
fail() { echo "FAIL: $1" >&2; exit 1; }
pass() { echo "PASS: $1"; }

status="$(supabase status -o json 2>/dev/null)"
val() { node -e 'const s=JSON.parse(process.argv[1]); process.stdout.write(s[process.argv[2]] || "")' "$status" "$1"; }
API_URL="$(val API_URL)"; ANON_KEY="$(val ANON_KEY)"; SERVICE_ROLE_KEY="$(val SERVICE_ROLE_KEY)"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "API_URL is not local" ;; esac
docker inspect "$C" >/dev/null 2>&1 || fail "the local database container $C is not running"

q() { docker exec -i -e PGOPTIONS="-c client_min_messages=warning" "$C" psql -U supabase_admin -d "$1" -X -q -v ON_ERROR_STOP=1 -At "${@:2}"; }
[ "$(q postgres -c "select to_regclass('ops.deletion_register') is not null")" = t ] || fail "20261216000000 is not applied here"

DRAIN_KEY="$(node -e 'process.stdout.write(require("crypto").randomBytes(24).toString("hex"))')"
cleanup() {
  docker rm -f crevant-recovery-drain >/dev/null 2>&1 || true
  q postgres -c "drop database if exists $DRILL" >/dev/null 2>&1 || true
  docker exec "$C" rm -f /tmp/recovery.dump >/dev/null 2>&1 || true
}
[ "${RX_KEEP:-}" = 1 ] || trap cleanup EXIT
cleanup
docker run -d --name crevant-recovery-drain --network host \
  -e SUPABASE_URL="$API_URL" -e SUPABASE_ANON_KEY="$ANON_KEY" -e SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" -e MEDIA_DRAIN_KEY="$DRAIN_KEY" \
  -v "$PWD/supabase/functions/post-media:/home/deno/functions/post-media:ro" -v "$PWD/supabase/functions/_shared:/home/deno/functions/_shared:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/post-media --ip 127.0.0.1 --port "$PORT" >/dev/null
for _ in $(seq 1 60); do curl -s -o /dev/null "http://127.0.0.1:$PORT/post-media/photo" && break; sleep 1; done
drain() { curl -s -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$PORT/post-media/drain" -H "x-media-drain-key: $DRAIN_KEY" -H 'Content-Type: application/json' -d '{}'; }

# 1. Two members, two posts; everything already in the register is reported first.
A=00000000-0000-4000-8000-fafafa00ab01; B=00000000-0000-4000-8000-fafafa00ab02
PA=00000000-0000-4000-8000-fafafa00ab11; PB=00000000-0000-4000-8000-fafafa00ab12
q postgres <<SQL >/dev/null
delete from auth.users where id in ('$A', '$B');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('$A', 'rx-a@example.test', now(), '{}'), ('$B', 'rx-b@example.test', now(), '{}');
update public.profiles set username = 'rx_' || substr(id::text, 33), display_name = 'Recovery Exercise' where id in ('$A', '$B');
insert into social.posts (id, author_id, body) values ('$PA', '$A', 'A post by the member who will be deleted'), ('$PB', '$B', 'A post its author will delete');
SQL
[ "$(drain)" = 200 ] || fail "the drain did not answer before the backup"

# 2. The backup.
BACKUP_AT="$(q postgres -c "select now()")"
docker exec "$C" sh -c "pg_dump -U supabase_admin -d postgres -Fc -f /tmp/recovery.dump"
pass "backup taken at $BACKUP_AT"

# 3. After the backup: the account and the post are deleted; the drain logs them.
q postgres -c "delete from auth.users where id = '$A'" >/dev/null
q postgres -c "update social.posts set deleted_at = now() where id = '$PB'" >/dev/null
[ "$(drain)" = 200 ] || fail "the drain did not answer after the deletions"
sleep 1
[ "$(q postgres -c "select count(*) from ops.deletion_register where target_id in ('$A', '$PB') and occurred_at > '$BACKUP_AT' and reported_at is not null")" = 2 ] \
  || fail "the drain did not report both deletions"
LOG="$(mktemp)"; EVENTS="$(mktemp)"
docker logs crevant-recovery-drain > "$LOG" 2>&1
node scripts/db/recovery/deletion-log-to-events.mjs "$LOG" > "$EVENTS"
grep -q "$A" "$EVENTS" && grep -q "$PB" "$EVENTS" || fail "the function log does not hold both deletions"
pass "the deletions are in the function's log, outside the database"

# 4. Restore the backup into a new database: the deleted account and post are back.
q postgres -c "create database $DRILL" >/dev/null
docker exec "$C" sh -c "pg_restore -U supabase_admin -d $DRILL /tmp/recovery.dump" || fail "the restore reported errors"
[ "$(q $DRILL -c "select (select count(*) from auth.users where id = '$A') || ':' || (select count(*) from social.posts where id = '$PB' and deleted_at is null)")" = 1:1 ] \
  || fail "the restored copy should hold the deleted account and post (it reflects the backup)"
pass "without reconciliation, the restore brings back the deleted account and the deleted post"

# 5. Reconcile from the log.
RESULT="$(echo "select ops.reapply_deletions(:'events'::jsonb, :'backup_at'::timestamptz);" | docker exec -i "$C" psql -U supabase_admin -d "$DRILL" -X -q -v ON_ERROR_STOP=1 -At \
  -v events="$(cat "$EVENTS")" -v backup_at="$BACKUP_AT")" \
  || fail "reapply_deletions failed"
echo "$RESULT" | grep -q '"accounts_deleted": 1' || fail "reapply_deletions did not delete the account: $RESULT"

# 6. The account cannot sign in (it no longer exists) and is not visible; the post is not visible.
[ "$(q $DRILL -c "select (select count(*) from auth.users where id = '$A') || ':' || (select count(*) from social.visible_members where id = '$A') || ':' || (select count(*) from social.posts where id = '$PB' and deleted_at is null) || ':' || (select count(*) from social.posts where id = '$PA')")" = 0:0:0:0 ] \
  || fail "after reconciliation the deleted account or post is still there"
[ "$(q $DRILL -c "select count(*) from social.posts where id = '$PB'")" = 1 ] || fail "the post row should remain, marked deleted"
pass "after reconciliation the deleted account is gone (it cannot sign in) and neither its posts nor the deleted post are visible"

q postgres -c "delete from auth.users where id = '$B'" >/dev/null
rm -f "$LOG" "$EVENTS"
echo "Recovery exercise passed"
