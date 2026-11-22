# Diagnostic for the member database identity check. Sourced, not run.
#
# pg_error_category: reads psql/libpq error text on stdin and prints ONE fixed
# category word from the list below. It never prints any part of its input:
# every output is a literal in this file, so a host, user, password, URL,
# token or marker that appears in the error text cannot reach the log.
#
#   invalid_connection_string        the URL could not be parsed (nothing was contacted)
#   dns_lookup_failed                the pooler's host name did not resolve
#   network_unreachable              no route from the runner to the pooler
#   tcp_connection_refused           the pooler itself refused the TCP connection
#   tcp_timeout                      no answer from the pooler within PGCONNECT_TIMEOUT
#   tls_not_supported                the server offered no TLS
#   tls_certificate_failed           TLS verification (verify-full, root CA, host name) failed
#   tls_handshake_failed             another TLS error
#   pooler_circuit_breaker           Supavisor is refusing after repeated errors
#   pooler_max_clients               Supavisor's client limit was reached
#   pooler_tenant_or_user_not_found  Supavisor does not know this project or user
#   pooler_upstream_unavailable      Supavisor accepted us but could not reach Postgres
#   password_authentication_failed   wrong password (or user) for the database
#   role_does_not_exist              the database user does not exist
#   database_does_not_exist          the database name does not exist
#   too_many_connections             Postgres refused: connection slots or role limit
#   database_not_accepting_connections  Postgres is starting, stopping or recovering
#   server_closed_connection         the connection was dropped without a reason
#   query_error                      connected, but the read-only query failed
#   no_error_text                    psql failed without saying why
#   unknown                          anything else
#
# The order matters: Supavisor reports upstream failures as a FATAL message,
# so pooler patterns are matched before the generic libpq ones.
pg_error_category() {
  local t
  t="$(cat)"
  [ -n "$t" ] || { echo no_error_text; return; }
  shopt -s nocasematch
  case "$t" in
    *'invalid URI'*|*'invalid connection option'*|*'missing "=" after'*|*'invalid percent-encoded'*|*'invalid integer value'*|*'unterminated quoted string'*|*'invalid sslmode value'*)
      echo invalid_connection_string ;;
    *'could not translate host name'*|*'Name or service not known'*|*'Temporary failure in name resolution'*)
      echo dns_lookup_failed ;;
    *'Network is unreachable'*|*'No route to host'*)
      echo network_unreachable ;;
    *ECIRCUITBREAKER*|*'circuit breaker'*|*'too many authentication errors'*)
      echo pooler_circuit_breaker ;;
    *EMAXCLIENTS*|*'Max client connections reached'*|*'max clients'*)
      echo pooler_max_clients ;;
    *'Tenant or user not found'*|*ETENANTNOTFOUND*)
      echo pooler_tenant_or_user_not_found ;;
    *econnrefused*|*DbHandler*|*EDBHANDLEREXITED*|*'connection to database not available'*|*'database connection is not available'*|*'Unable to establish connection to upstream'*|*'(ENOTCONN)'*|*'(ECONNREFUSED)'*)
      echo pooler_upstream_unavailable ;;
    *'failed: Connection refused'*|*'Connection refused'*)
      echo tcp_connection_refused ;;
    *'timeout expired'*|*'Connection timed out'*)
      echo tcp_timeout ;;
    *'server does not support SSL'*)
      echo tls_not_supported ;;
    *'certificate verify failed'*|*'server certificate'*|*'root certificate file'*|*'certificate'*'does not match host name'*|*'certificate is not yet valid'*|*'certificate has expired'*)
      echo tls_certificate_failed ;;
    *'SSL error'*|*'SSL SYSCALL'*|*'sslv3 alert'*|*'tlsv1 alert'*|*'SSL connection has been closed unexpectedly'*)
      echo tls_handshake_failed ;;
    *'password authentication failed'*|*'SASL authentication failed'*|*'fe_sendauth: no password supplied'*)
      echo password_authentication_failed ;;
    *'role "'*'" does not exist'*)
      echo role_does_not_exist ;;
    *'database "'*'" does not exist'*)
      echo database_does_not_exist ;;
    *'too many connections'*|*'remaining connection slots are reserved'*|*'sorry, too many clients'*)
      echo too_many_connections ;;
    *'the database system is starting up'*|*'the database system is shutting down'*|*'the database system is in recovery mode'*|*'not yet accepting connections'*|*'the database system is not accepting connections'*)
      echo database_not_accepting_connections ;;
    *'server closed the connection unexpectedly'*|*'terminating connection'*|*'no connection to the server'*)
      echo server_closed_connection ;;
    *'ERROR:'*)
      echo query_error ;;
    *)
      echo unknown ;;
  esac
  shopt -u nocasematch
}
