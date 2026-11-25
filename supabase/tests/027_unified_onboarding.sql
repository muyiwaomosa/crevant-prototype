-- Staging-safe, read-only: unified onboarding (20261211000000). Catalog reads only.
-- Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regclass('social.creator_topics') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261211000000''',
                       false, true, '')))[1]::text::int > 0
          end as onboarding_applied \gset
\if :onboarding_applied

do $$
declare
  bad text[] := '{}';
  f text;
begin
  if not (select relrowsecurity from pg_class where oid = 'social.creator_topics'::regclass)
     or has_table_privilege('authenticated', 'social.creator_topics', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'social.creator_topics', 'SELECT,INSERT,UPDATE,DELETE') then
    bad := bad || 'posting topics are reachable directly'::text;
  end if;
  -- Nothing here is open to visitors; founder tools check the founder; member tools check membership.
  foreach f in array array['public.app_set_creator_topics(text[])', 'public.app_my_creator_setup()', 'public.app_member_creator_topics(uuid)',
                           'public.app_my_inviter()', 'public.app_request_advertising(jsonb)', 'public.app_my_advertising()',
                           'public.app_my_campaign_report(uuid)', 'public.app_founder_create_creator_invitation(text, integer, integer)',
                           'public.app_founder_invitation_links()', 'public.app_founder_revoke_invitation_link(text)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') then
      bad := bad || (f || ': callable by visitors');
    end if;
    if f like 'public.app\_founder\_%' and position('social.current_founder()' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      bad := bad || (f || ': not founder only');
    end if;
    if f not like 'public.app\_founder\_%' and position('social.current_member()' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      bad := bad || (f || ': does not require membership');
    end if;
  end loop;
  -- Following the inviter is never automatic.
  if (select prosrc from pg_proc where oid = 'public.app_my_inviter()'::regprocedure) ~* 'insert\s+into\s+social\.follows' then
    bad := bad || 'the inviter is followed automatically'::text;
  end if;
  -- The advertiser's own report goes through the shared aggregate report and withholds small groups.
  if (select prosrc from pg_proc where oid = 'public.app_my_campaign_report(uuid)'::regprocedure) !~ 'requested_by = v_uid'
     or (select prosrc from pg_proc where oid = 'public.app_my_campaign_report(uuid)'::regprocedure) !~ 'private_count'
     or (select prosrc from pg_proc where oid = 'ads.campaign_report(uuid)'::regprocedure) !~ 'private_count'
     or has_function_privilege('authenticated', 'ads.campaign_report(uuid)', 'EXECUTE') then
    bad := bad || 'an advertiser report is not limited to their own campaigns in aggregate'::text;
  end if;
  -- An advertising request grants nothing: it starts pending.
  if (select prosrc from pg_proc where oid = 'public.app_request_advertising(jsonb)'::regprocedure) ~* 'approved' then
    bad := bad || 'an advertising request can approve itself'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: unified onboarding: %', bad;
  end if;
  raise notice 'PASS: unified onboarding: posting topics are private; nothing is open to visitors; founder tools are founder only; nobody is followed automatically; advertisers see only their own aggregate reports; requests start pending';
end $$;

\else
\echo 'Skipped 027_unified_onboarding.sql: 20261211000000 is not applied here.'
\endif
