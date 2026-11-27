-- Staging-safe, read-only: pilot closure, activation and triage (20261219000000).
-- Catalog reads, plus counts reported, never failed. Skipped until applied.

\set ON_ERROR_STOP on
select to_regclass('sim.balance_closures') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
            else (xpath('/row/n/text()', query_to_xml(
                    'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261219000000''',
                    false, true, '')))[1]::text::int > 0
       end as closure_applied \gset
\if :closure_applied

do $$
declare
  bad text[] := '{}';
begin
  -- Closures: private, append-only, totals only (no member identity).
  if not (select relrowsecurity from pg_class where oid = 'sim.balance_closures'::regclass)
     or has_table_privilege('authenticated', 'sim.balance_closures', 'select') or has_table_privilege('anon', 'sim.balance_closures', 'select') then
    bad := bad || 'members can read balance closures'::text;
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'sim.balance_closures'::regclass and tgname = 'balance_closures_append_only' and tgenabled <> 'D') then
    bad := bad || 'balance closures are not append-only'::text;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'sim' and table_name = 'balance_closures' and column_name ~ 'member|user|email|name') then
    bad := bad || 'balance closures keep personal data'::text;
  end if;
  -- The deletion function records the closure; activation and triage are founder-only.
  if position('sim.balance_closures' in (select prosrc from pg_proc where oid = 'public.app_founder_delete_member(bigint, text)'::regprocedure)) = 0 then
    bad := bad || 'account deletion does not record the simulated balance closure'::text;
  end if;
  if position('social.current_founder()' in (select prosrc from pg_proc where oid = 'public.app_founder_activation()'::regprocedure)) = 0
     or has_function_privilege('anon', 'public.app_founder_activation()', 'execute') then
    bad := bad || 'activation is not founder-only'::text;
  end if;
  if position('review_concerns' in (select prosrc from pg_proc where oid = 'public.app_founder_progression_queue()'::regprocedure)) = 0 then
    bad := bad || 'the review queue does not triage'::text;
  end if;
  -- Approval stays manual: nothing outside the founder's decision function writes decisions.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
             where n.nspname in ('public', 'sim', 'ops') and p.prosrc ~ 'insert into sim\.qualification_decisions'
               and p.proname <> 'app_founder_decide_qualification') then
    bad := bad || 'a function other than the founder''s decision writes qualification decisions'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: pilot closure, activation and triage: %', bad;
  end if;
  raise notice 'PASS: pilot closure, activation and triage: closures private, append-only and totals only, recorded by account deletion; activation founder-only; the review queue triages; approval stays manual';
end $$;

do $$
begin
  raise notice 'INFO: pilot closures: % recorded', (select count(*) from sim.balance_closures);
end $$;

\else
\echo 'Skipped 035_pilot_closure_activation_triage.sql: 20261219000000 is not applied here.'
\endif
