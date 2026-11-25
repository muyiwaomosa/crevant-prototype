-- Staging-safe, read-only: privacy requests, account deletion and switches (20261212000000).
-- Catalog reads only. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('ops.feature_switches') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261212000000''',
                       false, true, '')))[1]::text::int > 0
          end as privacy_applied \gset
\if :privacy_applied

do $$
declare
  bad text[] := '{}';
  t text;
  del text := (select prosrc from pg_proc where oid = 'public.app_founder_delete_member(bigint, text)'::regprocedure);
begin
  foreach t in array array['ops.feature_switches', 'ops.feature_switch_events', 'ops.member_requests', 'ops.member_request_events'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass)
       or has_table_privilege('authenticated', t, 'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('anon', t, 'SELECT,INSERT,UPDATE,DELETE') then
      bad := bad || (t || ' is reachable directly');
    end if;
  end loop;
  if (select count(*) from pg_trigger g where not g.tgisinternal and g.tgfoid = 'ops.history_append_only()'::regprocedure
        and g.tgrelid in ('ops.feature_switch_events'::regclass, 'ops.member_request_events'::regclass)) < 2 then
    bad := bad || 'the switch or request history can be edited'::text;
  end if;
  -- The switches are enforced by the server, not only hidden in the app.
  if position('feature_on' in (select prosrc from pg_proc where oid = 'ads.choose(uuid, text, text)'::regprocedure)) = 0
     or position('sharing_paused' in (select prosrc from pg_proc where oid = 'public.app_record_share(uuid, text)'::regprocedure)) = 0 then
    bad := bad || 'a switch is not enforced by the server'::text;
  end if;
  if position('video_not_ready' in (select prosrc from pg_proc where oid = 'public.app_founder_set_switch(text, boolean, text)'::regprocedure)) = 0 then
    bad := bad || 'video posts can be switched on before the video package'::text;
  end if;
  -- Deletion: founder only, through a deletion request, the username typed, never a founder, unsettled points forfeited, audited.
  if del !~ 'social\.current_founder\(\)' or del !~ $r$kind <> 'deletion'$r$ or del !~ 'confirmation_mismatch' or del !~ 'cannot_delete_founder'
     or del !~ 'sim\.reverse' or del !~ 'account_deleted' then
    bad := bad || 'account deletion lost one of its safeguards'::text;
  end if;
  -- The simulated ledger keeps a deleted member's rows, anonymously.
  if (select confdeltype from pg_constraint where conname = 'points_ledger_member_id_fkey' and conrelid = 'sim.points_ledger'::regclass) <> 'n' then
    bad := bad || 'deleting an account would remove simulated ledger rows'::text;
  end if;
  if has_function_privilege('anon', 'public.app_features()', 'EXECUTE') or has_function_privilege('anon', 'public.app_submit_member_request(text, text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'ops.feature_on(text)', 'EXECUTE') then
    bad := bad || 'visitors or members reach the switches or requests directly'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: privacy and switches: %', bad;
  end if;
  raise notice 'PASS: privacy and switches: tables are private and their history append-only; switches are enforced by the server; video stays off; deletion keeps its safeguards and the anonymous ledger';
end $$;

\else
\echo 'Skipped 028_privacy_and_switches.sql: 20261212000000 is not applied here.'
\endif
