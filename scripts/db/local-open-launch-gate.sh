#!/usr/bin/env bash
# TEST ONLY. Opens the member launch gate (20261129000000) on a LOCAL
# throwaway database, so test suites can give their test accounts
# membership. It uses the same recorded, phrase-protected function an
# operator would (no bypass), refuses any non-local database, and does
# nothing if the gate is absent or already open. Never used for staging or
# Production: there, opening is a separately approved, recorded operation.
#   DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres scripts/db/local-open-launch-gate.sh
set -euo pipefail
DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  *@127.0.0.1:*|*@localhost:*) ;;
  *) echo "Refusing: the launch gate is opened here only on a local test database." >&2; exit 1 ;;
esac
psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 -c "
do \$\$
begin
  if to_regprocedure('ops.set_external_access(text, boolean, text)') is null then
    raise notice 'no launch gate here';
  else
    execute \$q\$select ops.set_external_access('local-tests', true, 'APPROVE EXTERNAL MEMBER ACCESS')\$q\$;
    raise notice 'launch gate opened for local tests (recorded)';
  end if;
  -- Since 20261130000000 members need their own 18+ confirmation. Test
  -- accounts get a 'test' one as they are granted (local databases only).
  if to_regclass('ops.age_attestations') is not null then
    create schema if not exists test_support;
    revoke all on schema test_support from public, anon, authenticated;
    create or replace function test_support.auto_attest() returns trigger
      language plpgsql security definer set search_path = '' as \$f\$
      begin
        insert into ops.age_attestations (user_id, wording_version, source)
        values (new.user_id, 'test', 'test') on conflict (user_id) do nothing;
        return new;
      end \$f\$;
    revoke all on function test_support.auto_attest() from public, anon, authenticated;
    drop trigger if exists zz_test_auto_attest on ops.member_access;
    create trigger zz_test_auto_attest after insert or update on ops.member_access
      for each row execute function test_support.auto_attest();
    insert into ops.age_attestations (user_id, wording_version, source)
      select a.user_id, 'test', 'test' from ops.member_access a on conflict (user_id) do nothing;
    raise notice 'test accounts get a test adult confirmation (local only)';
  end if;
end \$\$" 2>&1 | sed 's/^psql:.*NOTICE: *//'
