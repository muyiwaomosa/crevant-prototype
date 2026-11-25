-- Staging only: undoes 20261208000000 (advertising). Never run it against a
-- Production project. Tested locally by scripts/db/rollback-advertising-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-advertising.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING ADVERTISING' -f ...
--
-- Removes the ads schema, its functions and the migration record. Refuses,
-- changing nothing, while any advertiser, preference, exclusion, served ad or
-- campaign revenue exists, if the record or an expected object is missing, or
-- a later migration exists.

\set ON_ERROR_STOP on
\pset footer off

begin;
set local lock_timeout = '10s';
set local statement_timeout = '60s';

select set_config('crevant.rollback_mode', :'mode', true) as mode,
       set_config('crevant.rollback_confirm', :'confirm', true) <> '' as confirmation_given;

do $$
begin
  if current_setting('crevant.rollback_mode') not in ('check', 'apply') then
    raise exception 'mode must be check or apply';
  end if;
  if current_setting('crevant.rollback_mode') = 'apply'
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING ADVERTISING' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING ADVERTISING';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261208000000')
     or to_regclass('ads.campaigns') is null or to_regprocedure('public.app_ad_for(text, uuid)') is null then
    raise exception 'refused: expected objects are missing (20261208000000 advertising), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261208000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ads.advertisers, ads.preferences, ads.exclusions, ads.impressions, ads.revenue_attributions in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from ads.advertisers) + (select count(*) from ads.preferences) + (select count(*) from ads.exclusions)
     + (select count(*) from ads.impressions) + (select count(*) from ads.revenue_attributions);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of advertising data exist (advertisers, preferences, exclusions, served ads, revenue). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing advertising and the migration record.'

drop function public.app_founder_attribute_campaign_revenue(uuid, date, bigint);
drop function public.app_founder_ad_demand();
drop function public.app_founder_campaign_report(uuid);
drop function public.app_founder_record_advertiser_feedback(uuid, integer, text);
drop function public.app_founder_record_conversions(uuid, date, integer, text);
drop function public.app_founder_ads();
drop function public.app_founder_set_campaign_status(uuid, text);
drop function public.app_founder_save_campaign(jsonb);
drop function public.app_founder_review_advertiser(uuid, boolean, text);
drop function public.app_founder_save_advertiser(jsonb);
drop function public.app_ad_event(uuid, text);
drop function public.app_ad_for(text, uuid);
drop function public.app_remove_ad_exclusion(text, text);
drop function public.app_my_ad_exclusions();
drop function public.app_clear_ad_preferences();
drop function public.app_set_ad_preference(text, text);
drop function public.app_ad_categories();
drop schema ads cascade;

delete from supabase_migrations.schema_migrations where version = '20261208000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: advertising and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
