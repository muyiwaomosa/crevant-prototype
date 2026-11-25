-- Staging-safe, read-only: release hardening (20261214000000). Catalog reads only.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regprocedure('ops.forget_member_invitations(uuid)') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261214000000''',
                       false, true, '')))[1]::text::int > 0
          end as hardening_applied \gset
\if :hardening_applied

do $$
declare
  bad text[] := '{}';
begin
  -- History stays append-only for direct changes; only cascades from a deleted account pass.
  if (select count(*) from pg_trigger t where t.tgname in ('block_events_append_only', 'enforcements_no_update', 'enforcement_lifts_no_update',
                                                          'member_notices_read_only', 'appeals_decided_once')
        and not t.tgisinternal and pg_get_triggerdef(t.oid) ~ 'pg_trigger_depth\(\) = 0') <> 5 then
    bad := bad || 'a history trigger is missing or no longer limited to direct changes'::text;
  end if;
  if not exists (select 1 from pg_trigger t where t.tgrelid = 'sim.revenue_entries'::regclass and t.tgname = 'revenue_entries_need_creator') then
    bad := bad || 'content-ad revenue can be recorded without its creator'::text;
  end if;
  if has_function_privilege('authenticated', 'ops.forget_member_invitations(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'sim.revenue_needs_creator()', 'EXECUTE') then
    bad := bad || 'members can call a server-only helper'::text;
  end if;
  -- The advertiser's own report withholds every member count, and serving and awards are locked.
  if (select prosrc from pg_proc where oid = 'public.app_my_campaign_report(uuid)'::regprocedure) !~ $r$'by_match'$r$
     or (select prosrc from pg_proc where oid = 'public.app_my_campaign_report(uuid)'::regprocedure) !~ $r$'impressions', ads\.private_count$r$ then
    bad := bad || 'the advertiser report shows counts under 10'::text;
  end if;
  if position('ads.serve:' in (select prosrc from pg_proc where oid = 'public.app_ad_for(text, uuid)'::regprocedure)) = 0
     or position('sim.award:redeemable' in (select prosrc from pg_proc where oid = 'sim.award(uuid, text, text, uuid, uuid)'::regprocedure)) = 0 then
    bad := bad || 'ad serving or redeemable awards lost their lock'::text;
  end if;
  if position('revenue_cents' in (select prosrc from pg_proc where oid = 'public.app_creator_insights(integer)'::regprocedure)) > 0 then
    bad := bad || 'creator intelligence returns the revenue total beside the creator share'::text;
  end if;
  if position('forget_member_invitations' in (select prosrc from pg_proc where oid = 'public.app_founder_delete_member(bigint, text)'::regprocedure)) = 0 then
    bad := bad || 'account deletion keeps the member''s invitation'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: release hardening: %', bad;
  end if;
  raise notice 'PASS: release hardening: history protected against direct changes, deletions cascade, advertiser counts withheld under 10, serving and awards locked, no revenue beside creator shares';
end $$;

\else
\echo 'Skipped 030_release_hardening.sql: 20261214000000 is not applied here.'
\endif
