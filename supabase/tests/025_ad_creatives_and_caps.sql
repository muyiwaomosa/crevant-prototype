-- Staging-safe, read-only: 20261209000000 (ad creatives and the restoration
-- cap). Catalog reads only. Skipped until the migration is applied.

\set ON_ERROR_STOP on
select to_regprocedure('ads.creative_ready(uuid)') is not null
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261209000000''',
                       false, true, '')))[1]::text::int > 0
          end as creatives_applied \gset
\if :creatives_applied

do $$
declare
  bad text[] := '{}';
  award text := (select prosrc from pg_proc where oid = 'sim.award(uuid, text, text, uuid, uuid)'::regprocedure);
begin
  if award !~ $r$source_key not like 'restored:%'$r$ or award !~ 'daily_cap' or award !~ 'monthly_redeemable_cap' then
    bad := bad || 'the daily cap does not exclude restorations, or a cap was lost'::text;
  end if;
  if (select prosrc from pg_proc where oid = 'public.app_founder_set_campaign_status(uuid, text)'::regprocedure) !~ 'creative_ready' then
    bad := bad || 'a campaign can run without its creative'::text;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_media_complete' and conrelid = 'ads.campaigns'::regclass) then
    bad := bad || 'an image or video campaign can lack its file or text alternative'::text;
  end if;
  if has_function_privilege('authenticated', 'ads.creative_ready(uuid)', 'EXECUTE') or has_function_privilege('authenticated', 'ads.creative_files()', 'EXECUTE') then
    bad := bad || 'a creative helper is callable by members'::text;
  end if;
  if to_regclass('storage.buckets') is not null then
    if (select count(*) from storage.buckets where id = 'ad-creatives' and public and file_size_limit = 8388608
        and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'video/mp4']) <> 1 then
      bad := bad || 'the ad-creatives bucket is missing or its limits changed'::text;
    end if;
    if exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and qual ~ 'ad-creatives') then
      bad := bad || 'a storage policy opens the ad-creatives bucket to members'::text;
    end if;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: ad creatives and caps: %', bad;
  end if;
  raise notice 'PASS: restorations are outside the daily caps (which still hold); image and video campaigns need their file; the ad-creatives bucket holds creative only, with no member write access';
end $$;

\else
\echo 'Skipped 025_ad_creatives_and_caps.sql: 20261209000000 is not applied here.'
\endif
