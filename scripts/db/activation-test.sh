#!/usr/bin/env bash
# Tests scripts/db/staging-activate-member-access.sql on THROWAWAY local
# databases (it creates and drops its own, one per case, on the server in
# ADMIN_DATABASE_URL). Never a hosted Supabase project.
#
# Each case builds a database in the state staging is in today (every
# approved migration through 20261121000000, recorded like the Supabase CLI
# does, a confirmed founder account, an unconfirmed account and another
# member with content), takes a fingerprint (schema, privileges, policies,
# triggers, migration records and row counts), runs the activation script,
# and checks the outcome:
#   * a rehearsal succeeds and leaves the fingerprint unchanged;
#   * an invalid, unknown or unconfirmed founder id, a failed security check,
#     a missing or wrong mode or confirmation, a Production-shaped database,
#     or a second activation: refused, fingerprint unchanged;
#   * an activation applies the migration, its record and the founder's
#     membership together, and the staging-safe checks then pass;
#   * the founder's id never appears in any output.
#
# Usage: ADMIN_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres scripts/db/activation-test.sh
set -uo pipefail
cd "$(dirname "$0")/../.."
: "${ADMIN_DATABASE_URL:?Set ADMIN_DATABASE_URL to a local PostgreSQL server (it creates throwaway databases)}"
case "$ADMIN_DATABASE_URL" in
  *supabase.co*|*supabase.com*) echo "Refusing: this test only runs against a local PostgreSQL server." >&2; exit 1 ;;
esac
SQL=scripts/db/staging-activate-member-access.sql
PHRASE='ACTIVATE STAGING MEMBER ACCESS'
FOUNDER=00000000-0000-4000-8000-0000000fa001
UNCONFIRMED=00000000-0000-4000-8000-0000000fa002
OTHER=00000000-0000-4000-8000-0000000fa003
pass=0; failed=0
ok()  { echo "PASS  activation: $1"; pass=$((pass + 1)); }
bad() { echo "FAIL  activation: $1"; failed=$((failed + 1)); }

# A database URL for database $1 on the same server.
db_url() { sed -E "s#/[^/?]+(\?|$)#/$1\1#" <<<"$ADMIN_DATABASE_URL"; }
# new_db <production|staging> <case name>: a fresh database in today's state; prints its URL.
# (Run as $(...), a subshell, so each case passes its own name.)
new_db() {
  local name="activation_${2}_$$" url
  psql "$ADMIN_DATABASE_URL" -X -q -v ON_ERROR_STOP=1 -c "drop database if exists $name" -c "create database $name" >/dev/null || return 1
  url=$(db_url "$name")
  local P=(psql "$url" -X -q -v ON_ERROR_STOP=1)
  "${P[@]}" -f scripts/db/bootstrap-roles.sql >/dev/null && "${P[@]}" -f scripts/db/bootstrap-supabase-stub.sql >/dev/null || return 1
  "${P[@]}" -c "create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text)" >/dev/null || return 1
  local f v
  for f in supabase/migrations/*.sql; do
    v=$(basename "$f" | cut -d_ -f1)
    [ "$v" \> 20261121000000 ] && continue
    if [ "$1" = production ] && ! grep -qx "$(basename "$f")" supabase/production-migrations.txt; then continue; fi
    "${P[@]}" -f "$f" >/dev/null 2>&1 || { echo "could not apply $f" >&2; return 1; }
    "${P[@]}" -c "insert into supabase_migrations.schema_migrations (version, name) values ('$v', '$(basename "$f" .sql | cut -d_ -f2-)')" >/dev/null || return 1
  done
  "${P[@]}" >/dev/null <<SQL || return 1
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at) values
  ('$FOUNDER', 'founder@activation.test', now()),
  ('$UNCONFIRMED', 'unconfirmed@activation.test', null),
  ('$OTHER', 'other@activation.test', now());
reset role;
update public.profiles set username = 'act_founder', display_name = 'Founder' where id = '$FOUNDER';
SQL
  if [ "$1" = staging ]; then
    "${P[@]}" -c "update public.profiles set username = 'act_other', display_name = 'Other' where id = '$OTHER';
      insert into social.posts (author_id, body) values ('$OTHER', 'A post from before activation');
      insert into social.follows (follower_id, creator_id) values ('$FOUNDER', '$OTHER')" >/dev/null || return 1
  fi
  echo "$url"
}
fingerprint() {
  psql "$1" -X -q -At -v ON_ERROR_STOP=1 <<'SQL'
select md5(string_agg(x, E'\n' order by x)) from (
  select 'fn ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || md5(pg_get_functiondef(p.oid)) || ' ' || coalesce(array_to_string(p.proacl, ','), '') as x
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'ops', 'social', 'waitlist_api') and p.prokind = 'f'
  union all select 'rel ' || c.oid::regclass::text || ' ' || c.relkind::text || ' ' || coalesce(array_to_string(c.relacl, ','), '') || ' ' || c.relrowsecurity::text
  from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname in ('public', 'ops', 'social', 'waitlist_api') and c.relkind in ('r', 'v', 'm', 'p', 'S')
  union all select 'col ' || attrelid::regclass::text || '.' || attname || ' ' || coalesce(array_to_string(attacl, ','), '') from pg_attribute where attrelid = 'public.profiles'::regclass and attnum > 0 and attacl is not null
  union all select 'pol ' || schemaname || '.' || tablename || ' ' || policyname || ' ' || cmd || ' ' || coalesce(qual, '') || ' ' || coalesce(with_check, '') from pg_policies where schemaname in ('public', 'ops', 'social')
  union all select 'trg ' || tgrelid::regclass::text || ' ' || tgname from pg_trigger where not tgisinternal and tgrelid::regclass::text !~ '^auth\.'
  union all select 'nsp ' || has_schema_privilege('authenticated', 'ops', 'USAGE')::text
  union all select 'mig ' || string_agg(version, ',' order by version) from supabase_migrations.schema_migrations
  union all select 'rows ' || (select count(*) from auth.users) || '/' || (select count(*) from public.profiles) || '/' ||
    (select count(*) from public.profiles where username is not null) || '/' ||
    coalesce((select count(*)::text from pg_class where oid = to_regclass('social.posts')), '0')
) s;
SQL
}
# run <url> <founder or __unset__> <mode> <confirm>: runs the script; output in $out, exit code in $code.
run() {
  if [ "$2" = __unset__ ]; then
    out=$(env -u STAGING_FOUNDER_ACCOUNT_ID psql "$1" -X -q -v ON_ERROR_STOP=1 -v mode="$3" -v confirm="$4" -f "$SQL" 2>&1); code=$?
  else
    out=$(STAGING_FOUNDER_ACCOUNT_ID="$2" psql "$1" -X -q -v ON_ERROR_STOP=1 -v mode="$3" -v confirm="$4" -f "$SQL" 2>&1); code=$?
  fi
}
no_id_in_output() { ! grep -qiF -e "$FOUNDER" -e "$UNCONFIRMED" -e "$OTHER" <<<"$out"; }
# refused <description> <expected message> <url> <founder> <mode> <confirm>
refused() {
  local before after
  before=$(fingerprint "$3")
  run "$3" "$4" "$5" "$6"
  after=$(fingerprint "$3")
  if [ $code -eq 0 ] || ! grep -qi -- "$2" <<<"$out"; then
    bad "$1 (exit $code): $(grep -E 'ERROR|refused|FAIL' <<<"$out" | head -2 | tr '\n' ' ')"
  elif [ "$after" != "$before" ]; then
    bad "$1 (refused, but something changed)"
  elif ! no_id_in_output; then
    bad "$1 (an account id appeared in the output)"
  else
    ok "refused, nothing changed: $1"
  fi
}

psql "$ADMIN_DATABASE_URL" -X -q -c "select 1" >/dev/null || { echo "Local PostgreSQL server not reachable" >&2; exit 1; }

# 1. A rehearsal runs everything and leaves no trace.
U=$(new_db staging main) || { echo "could not build a test database" >&2; exit 1; }
before=$(fingerprint "$U")
run "$U" "$FOUNDER" rehearse ""
after=$(fingerprint "$U")
if [ $code -eq 0 ] && grep -q 'Rehearsal only' <<<"$out" && grep -q 'PASS: the founder, and only the founder, is an active member' <<<"$out" \
   && grep -q 'PASS: an account without membership is refused' <<<"$out" && grep -q 'PASS: pilot membership is private' <<<"$out" \
   && [ "$after" = "$before" ] && no_id_in_output \
   && [ "$(psql "$U" -X -q -At -c "select (to_regclass('ops.member_access') is null)::text || (select count(*) from supabase_migrations.schema_migrations where version = '20261122000000')")" = "true0" ]; then
  ok "a rehearsal runs the migration, the grant and every check, then leaves no membership, no migration record and no other change"
else
  bad "rehearsal (exit $code): $(grep -E 'ERROR|FAIL' <<<"$out" | head -3 | tr '\n' ' ')"
fi

# 2. The founder id: missing, invalid, unknown or unconfirmed.
refused "STAGING_FOUNDER_ACCOUNT_ID is not set" "is not set" "$U" __unset__ rehearse ""
refused "STAGING_FOUNDER_ACCOUNT_ID is empty" "is not set" "$U" "" rehearse ""
refused "the founder id is not a UUID" "not an account id" "$U" "not-an-id" rehearse ""
refused "the founder id carries SQL" "not an account id" "$U" "$FOUNDER'); drop table auth.users; --" rehearse ""
refused "no account has the founder id" "no account has the id" "$U" "00000000-0000-4000-8000-0000000fa0ff" rehearse ""
refused "the founder account is unconfirmed" "not confirmed" "$U" "$UNCONFIRMED" rehearse ""
refused "the founder id is unknown, in activate mode" "no account has the id" "$U" "00000000-0000-4000-8000-0000000fa0ff" activate "$PHRASE"

# 3. Mode and confirmation.
refused "the mode is neither rehearse nor activate" "mode must be rehearse or activate" "$U" "$FOUNDER" apply "$PHRASE"
refused "activate without the confirmation phrase" "confirmation phrase" "$U" "$FOUNDER" activate ""
refused "activate with a different phrase" "confirmation phrase" "$U" "$FOUNDER" activate "activate staging member access"
before=$(fingerprint "$U")
out=$(STAGING_FOUNDER_ACCOUNT_ID="$FOUNDER" psql "$U" -X -q -v ON_ERROR_STOP=1 -f "$SQL" 2>&1); code=$?
[ $code -ne 0 ] && grep -q 'syntax error' <<<"$out" && [ "$(fingerprint "$U")" = "$before" ] && ok "refused, nothing changed: no mode given" || bad "ran with no mode (exit $code)"

# 4. A failed security check, inside the transaction, discards everything:
#    one caught by the staging-safe checks, one by the member authorization audit.
V=$(new_db staging opsopen) || exit 1
psql "$V" -X -q -c "grant usage on schema ops to authenticated" >/dev/null
refused "a staging-safe security check fails (members can use the ops schema)" "FAIL:" "$V" "$FOUNDER" activate "$PHRASE"
W=$(new_db staging extrafn) || exit 1
psql "$W" -X -q -c "create function public.app_sneaky() returns int language sql security definer set search_path = '' as 'select 1'; grant execute on function public.app_sneaky() to authenticated" >/dev/null
refused "a security check fails (an extra member function)" "FAIL:" "$W" "$FOUNDER" activate "$PHRASE"

# 5. A Production-shaped database (no staging social core) is refused.
P=$(new_db production prod) || exit 1
refused "a Production-shaped database (no social core)" "staging social core" "$P" "$FOUNDER" activate "$PHRASE"

# 6. Activation: the migration, its record and the founder's membership together.
run "$U" "$FOUNDER" activate "$PHRASE"
state=$(psql "$U" -X -q -At -c "select concat_ws('|',
  (select count(*) from supabase_migrations.schema_migrations where version = '20261122000000' and name = 'member_access'),
  to_regclass('ops.member_access') is not null,
  (select count(*) from ops.member_access),
  (select string_agg(cohort || ':' || status, ',') from ops.member_access where user_id = '$FOUNDER'),
  (select string_agg(action || ':' || actor || ':' || db_session_user || ':' || db_role || ':' || reason, ',') from ops.member_access_events),
  ops.member_access_active('$OTHER'),
  (select count(*) from social.posts where author_id = '$OTHER'),
  (select count(*) from social.follows where follower_id = '$FOUNDER'))" 2>&1)
if [ $code -eq 0 ] && grep -q '^Activated' <<<"$out" && [ "$state" = "1|t|1|founder:active|granted:founder:postgres:none:staging activation|f|1|1" ] && no_id_in_output; then
  ok "activation applies the migration, records it, and makes the founder (only) an active member, keeping every existing row"
else
  bad "activation (exit $code, state $state): $(grep -E 'ERROR|FAIL' <<<"$out" | head -3 | tr '\n' ' ')"
fi
if checks=$(for f in supabase/tests/*.sql; do psql "$U" -X -q -v ON_ERROR_STOP=1 -f "$f" || exit 1; done 2>&1); then
  ok "after activation, every staging-safe check passes (including 001, which runs outside the transaction)"
else
  bad "staging-safe checks after activation: $(grep -E 'ERROR|FAIL' <<<"$checks" | head -2 | tr '\n' ' ')"
fi

# 7. A second activation is refused.
refused "a second activation (already recorded)" "already recorded" "$U" "$FOUNDER" activate "$PHRASE"

for name in $(psql "$ADMIN_DATABASE_URL" -X -q -At -c "select datname from pg_database where datname like 'activation\_%\_$$'"); do
  psql "$ADMIN_DATABASE_URL" -X -q -c "drop database if exists $name" >/dev/null
done
echo "Activation tests: $pass passed, $failed failed"
[ $failed -eq 0 ]
