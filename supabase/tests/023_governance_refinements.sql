-- Staging-safe, read-only: governance refinements (20261207000000). Catalog
-- reads only. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regprocedure('ops.other_moderator_available(uuid, uuid)') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261207000000''',
                       false, true, '')))[1]::text::int > 0
          end as refinements_applied \gset
\if :refinements_applied

do $$
declare
  bad text[] := '{}';
  decide text := (select prosrc from pg_proc where oid = 'public.app_mod_decide_appeal(uuid, boolean, text)'::regprocedure);
  enforce text := (select prosrc from pg_proc where oid = 'public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean)'::regprocedure);
  restore text := (select prosrc from pg_proc where oid = 'sim.restore_hidden(text, uuid)'::regprocedure);
begin
  if to_regprocedure('public.app_mod_enforce(uuid, text, text, uuid, integer, text)') is not null then
    bad := bad || 'the old app_mod_enforce signature is still there'::text;
  end if;
  if has_function_privilege('authenticated', 'sim.restore_hidden(text, uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'ops.other_moderator_available(uuid, uuid)', 'EXECUTE') then
    bad := bad || 'a refinement helper is callable by members'::text;
  end if;
  -- Restored points: compensating entries, once, only for content live again, never redeemable.
  if restore !~ 'restored:' or restore !~ 'on conflict \(source_key\) do nothing' or restore !~ 'not l\.redeemable' or restore !~ 'deleted_at is null' then
    bad := bad || 'restoring points is not once-only, live-only and recognized-only'::text;
  end if;
  if decide !~ 'sim\.restore_hidden' or (select prosrc from pg_proc where oid = 'public.app_mod_restore(uuid, text)'::regprocedure) !~ 'sim\.restore_hidden' then
    bad := bad || 'an appeal reversal or a restore does not restore points'::text;
  end if;
  -- The sole-moderator exception: only without another eligible moderator, with a reason, disclosed.
  if decide !~ 'other_moderator_available' or decide !~ 'note_required' or decide !~ 'conflict of interest disclosed' or decide !~ 'same_moderator' then
    bad := bad || 'the sole-moderator exception is not limited, justified and disclosed'::text;
  end if;
  -- Immediate enforcement needs a justification.
  if enforce !~ 'p_immediate' or enforce !~ 'note_required' then
    bad := bad || 'immediate enforcement is not justified'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: governance refinements: %', bad;
  end if;
  raise notice 'PASS: governance refinements: legitimate points are restored once as compensating entries; the sole-moderator exception is limited, justified and disclosed; immediate enforcement is justified';
end $$;

\else
\echo 'Skipped 023_governance_refinements.sql: 20261207000000 is not applied here.'
\endif
