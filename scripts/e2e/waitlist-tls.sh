#!/usr/bin/env bash
# TLS checks for the join-waitlist database connection. Local only: nothing
# here contacts Supabase or any hosted service.
#
#   1. Makes a throwaway certificate authority, a second (wrong) one, and a
#      server certificate for db.tls.test, in a temporary folder. Nothing is
#      committed and everything is deleted at the end.
#   2. Starts two throwaway Postgres servers on this machine: one that only
#      accepts TLS (with that certificate), and one without TLS at all.
#   3. Runs the real db.ts in Supabase's Edge runtime (e2e/edge/tls-probe,
#      test only) and checks that it connects only with the right CA and the
#      right hostname, and never without TLS or with weakened settings.
#   4. Checks the same with psql and sslmode=verify-full, the way the Windows
#      staging instructions use it (docs/STAGING-CHECKS-WINDOWS.md).
#
# Requires Docker, psql, openssl and npm dependencies.
set -euo pipefail
cd "$(dirname "$0")/../.."

EDGE_IMAGE="${EDGE_IMAGE:-supabase/edge-runtime:v1.78.1}"
PG_IMAGE="${PG_IMAGE:-postgres:16}"
TLS_PORT="${TLS_PORT:-55433}"
PLAIN_PORT="${PLAIN_PORT:-55434}"
PROBE_PORT="${PROBE_PORT:-54390}"
WRITER_PW="$(openssl rand -hex 24)"
OWNER_PW="$(openssl rand -hex 24)"
tmp="$(mktemp -d)"
chmod 755 "$tmp"

cleanup() {
  docker rm -f crevant-tls-db crevant-plain-db crevant-tls-probe >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

# 1. Certificates (valid for two days, never reused).
ca() { # name subject
  openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=$2" -keyout "$tmp/$1.key" -out "$tmp/$1.crt" \
    -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
}
ca ca "Crevant throwaway test CA"
ca wrong-ca "Crevant throwaway WRONG CA"
openssl req -newkey rsa:2048 -nodes -subj "/CN=db.tls.test" -keyout "$tmp/server.key" -out "$tmp/server.csr" 2>/dev/null
printf 'subjectAltName=DNS:db.tls.test\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > "$tmp/server.ext"
openssl x509 -req -in "$tmp/server.csr" -CA "$tmp/ca.crt" -CAkey "$tmp/ca.key" -CAcreateserial -days 2 \
  -extfile "$tmp/server.ext" -out "$tmp/server.crt" 2>/dev/null
chmod 644 "$tmp"/*

# The restricted login on each throwaway server, with a throwaway password.
cat > "$tmp/init.sh" <<'SH'
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 -q -v pw="$WRITER_PW" <<'SQL'
create role waitlist_writer login password :'pw';
SQL
SH
chmod 755 "$tmp/init.sh"

# 2. Two throwaway Postgres servers on this machine.
start_pg() { # name port tls(on|off)
  local hba ssl
  if [ "$3" = on ]; then
    hba='local all all trust\nhostssl all all all scram-sha-256\nhost all all all reject\n'
    ssl='-c ssl=on -c ssl_cert_file=/tls/server.crt -c ssl_key_file=/tls/server.key'
  else
    hba='local all all trust\nhost all all all scram-sha-256\n'
    ssl='-c ssl=off'
  fi
  docker run -d --name "$1" --network host -e POSTGRES_PASSWORD="$OWNER_PW" -e WRITER_PW="$WRITER_PW" \
    -v "$tmp:/certs:ro" -v "$tmp/init.sh:/docker-entrypoint-initdb.d/init.sh:ro" --entrypoint bash "$PG_IMAGE" -c "
      install -d -o postgres -m 700 /tls
      install -o postgres -m 600 /certs/server.key /tls/server.key
      install -o postgres -m 644 /certs/server.crt /tls/server.crt
      printf '$hba' > /tls/pg_hba.conf && chown postgres /tls/pg_hba.conf
      exec docker-entrypoint.sh postgres -p $2 -c listen_addresses=127.0.0.1 -c hba_file=/tls/pg_hba.conf $ssl" >/dev/null
}
start_pg crevant-tls-db "$TLS_PORT" on
start_pg crevant-plain-db "$PLAIN_PORT" off

ready() { # port sslmode
  for _ in $(seq 1 60); do
    if PGPASSWORD="$WRITER_PW" psql "host=db.tls.test hostaddr=127.0.0.1 port=$1 dbname=postgres user=waitlist_writer sslmode=$2 sslrootcert=$tmp/ca.crt connect_timeout=3" \
         -X -At -c 'select 1' >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "Throwaway Postgres on port $1 did not start" >&2
  docker logs crevant-tls-db 2>&1 | tail -5 >&2
  return 1
}
ready "$TLS_PORT" verify-full
ready "$PLAIN_PORT" disable

# Pass this machine's outbound proxy and extra CA to the runtime if it has
# them (it downloads the pinned postgres driver from npm on start).
EXTRA=()
if [ -n "${HTTPS_PROXY:-}" ]; then EXTRA+=(-e HTTPS_PROXY -e HTTP_PROXY -e NO_PROXY=127.0.0.1,localhost); fi
if [ -n "${EDGE_CA_FILE:-}" ]; then EXTRA+=(-v "${EDGE_CA_FILE}:/extra-ca.crt:ro" -e DENO_CERT=/extra-ca.crt); fi

# 3. The real db.ts in the Edge runtime. Both test hostnames lead to this
# machine; only db.tls.test is on the server certificate.
docker run -d --name crevant-tls-probe --network host "${EXTRA[@]}" \
  --add-host db.tls.test:127.0.0.1 --add-host other.tls.test:127.0.0.1 \
  -v "$PWD/supabase/functions/join-waitlist:/home/deno/functions/join-waitlist:ro" \
  -v "$PWD/e2e/edge/tls-probe:/home/deno/functions/tls-probe:ro" \
  "$EDGE_IMAGE" start --main-service /home/deno/functions/tls-probe --ip 127.0.0.1 --port "$PROBE_PORT" >/dev/null

PROBE_URL="http://127.0.0.1:${PROBE_PORT}" CERTS="$tmp" WRITER_PW="$WRITER_PW" TLS_PORT="$TLS_PORT" PLAIN_PORT="$PLAIN_PORT" \
  node e2e/waitlist-tls.e2e.cjs

# 4. psql with sslmode=verify-full, as in the Windows staging instructions.
fails=0
psql_case() { # want(ok|fail) description conninfo
  local code=0
  PGPASSWORD="$WRITER_PW" psql "$3 dbname=postgres user=waitlist_writer connect_timeout=5" -X -At -c 'select 1' >/dev/null 2>&1 || code=$?
  if { [ "$1" = ok ] && [ $code -eq 0 ]; } || { [ "$1" = fail ] && [ $code -ne 0 ]; }; then
    echo "PASS  psql: $2"
  else
    echo "FAIL  psql: $2 (exit $code)"; fails=$((fails + 1))
  fi
}
psql_case ok   "verify-full with the right CA and hostname connects" "host=db.tls.test hostaddr=127.0.0.1 port=$TLS_PORT sslmode=verify-full sslrootcert=$tmp/ca.crt"
psql_case fail "verify-full with the wrong CA is refused"            "host=db.tls.test hostaddr=127.0.0.1 port=$TLS_PORT sslmode=verify-full sslrootcert=$tmp/wrong-ca.crt"
psql_case fail "verify-full with the wrong hostname is refused"      "host=other.tls.test hostaddr=127.0.0.1 port=$TLS_PORT sslmode=verify-full sslrootcert=$tmp/ca.crt"
psql_case fail "verify-full against a server without TLS is refused" "host=db.tls.test hostaddr=127.0.0.1 port=$PLAIN_PORT sslmode=verify-full sslrootcert=$tmp/ca.crt"
psql_case fail "the TLS-only server refuses a connection without TLS" "host=db.tls.test hostaddr=127.0.0.1 port=$TLS_PORT sslmode=disable"
if [ $fails -ne 0 ]; then echo "$fails psql check(s) failed" >&2; exit 1; fi

# The probe's logs must not hold the throwaway password.
if docker logs crevant-tls-probe 2>&1 | grep -q "$WRITER_PW"; then
  echo "FAIL  the probe logged the database password" >&2
  exit 1
fi
echo "PASS  no password in the runtime's logs"
