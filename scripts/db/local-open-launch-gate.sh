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
end \$\$" 2>&1 | sed 's/^psql:.*NOTICE: *//'
