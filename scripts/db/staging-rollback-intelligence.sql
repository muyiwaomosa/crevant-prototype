-- Staging only: undoes 20261210000000 (intelligence). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-intelligence-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-intelligence.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING INTELLIGENCE' -f ...
--
-- Removes the intelligence functions and post opens, and puts back the
-- earlier conversion functions. Refuses, changing nothing, while any post
-- open or self-reported conversion exists, if the record or an expected
-- object is missing, or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING INTELLIGENCE' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING INTELLIGENCE';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261210000000')
     or to_regclass('social.post_opens') is null then
    raise exception 'refused: expected objects are missing (20261210000000 intelligence), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261210000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table social.post_opens, ads.conversions in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from social.post_opens) + (select count(*) from ads.conversions where self_reported is not null);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on intelligence (post opens, self-reported conversions). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing intelligence and the migration record.'

drop function public.app_founder_overview();
drop function public.app_my_contribution_insights();
drop function public.app_creator_insights(integer);
drop function public.app_note_open(uuid);
drop function ops.connections(timestamptz, timestamptz);
drop function ops.week_start(timestamptz, integer);
drop table social.post_opens;
drop function public.app_founder_record_conversions(uuid, date, integer, text, integer);
create function public.app_founder_record_conversions(p_campaign uuid, p_month date, p_verified integer, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_month is null or p_verified is null or p_verified < 0 or coalesce(pg_catalog.btrim(p_note), '') = '' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into ads.conversions (campaign_id, month, verified, note)
  values (p_campaign, pg_catalog.date_trunc('month', p_month)::date, p_verified, pg_catalog.btrim(p_note))
  on conflict (campaign_id, month) do update set verified = excluded.verified, note = excluded.note, recorded_at = pg_catalog.now();
exception
  when foreign_key_violation then
    raise exception 'not_found' using errcode = 'P0001';
end;
$$;

comment on function public.app_founder_record_conversions(uuid, date, integer, text) is 'Founder: verified conversions for a campaign and month, reconciled manually with the advertiser (aggregate only).';
revoke all on function public.app_founder_record_conversions(uuid, date, integer, text) from public, anon;
grant execute on function public.app_founder_record_conversions(uuid, date, integer, text) to authenticated;
create or replace function public.app_founder_campaign_report(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  c ads.campaigns%rowtype;
  v_audience bigint;
begin
  select * into c from ads.campaigns where id = p_campaign;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Eligible audience: members who chose one of the campaign's categories and excluded none of it.
  select count(distinct p.member_id) into v_audience
  from ads.preferences p
  where p.category = any (c.categories)
    and not exists (select 1 from ads.exclusions x where x.member_id = p.member_id
                    and ((x.kind = 'category' and x.target = any (c.categories)) or (x.kind = 'campaign' and x.target = c.id::text)
                         or (x.kind = 'advertiser' and x.target = c.advertiser_id::text)));
  return (
    with i as (select * from ads.impressions where campaign_id = c.id),
    by_match as (
      select m.match,
             count(i.id) filter (where i.viewed_at is not null) as views,
             count(i.id) filter (where i.clicked_at is not null) as clicks
      from (values ('preference'), ('context'), ('general')) m(match)
      left join i on i.match = m.match
      group by m.match)
    select pg_catalog.jsonb_build_object(
      'kind', 'actual observations',
      'minimum_group', 10,
      'eligible_audience', ads.private_count(v_audience),
      'served', (select count(*) from i),
      'impressions', (select count(*) from i where viewed_at is not null),
      'clicks', (select count(*) from i where clicked_at is not null),
      'ctr', case when (select count(*) from i where viewed_at is not null) > 0
                  then pg_catalog.round((select count(*) from i where clicked_at is not null)::numeric / (select count(*) from i where viewed_at is not null), 4) end,
      'reach', ads.private_count((select count(distinct member_id) from i where viewed_at is not null)),
      'relevant', (select count(*) from i where feedback = 'relevant'),
      'not_relevant', (select count(*) from i where feedback = 'not_relevant'),
      'hidden', (select count(*) from i where feedback = 'hidden'),
      'reported', (select count(*) from i where feedback = 'reported'),
      'by_match', (select pg_catalog.jsonb_object_agg(b.match, pg_catalog.jsonb_build_object('impressions', b.views, 'clicks', b.clicks)) from by_match b),
      'creative_kind', c.creative_kind,
      'video_plays', (select count(*) from i where played_at is not null),
      'video_completions', (select count(*) from i where completed_at is not null),
      'content_impressions', (select count(*) from i where viewed_at is not null and surface = 'content'),
      'feed_impressions', (select count(*) from i where viewed_at is not null and surface = 'feed'),
      'verified_conversions', coalesce((select sum(v.verified) from ads.conversions v where v.campaign_id = c.id), 0),
      'advertiser_satisfaction', (select f.satisfaction from ads.advertiser_feedback f where f.campaign_id = c.id),
      'simulated_revenue_cents', coalesce((select sum(r.net_cents) from ads.revenue_attributions r where r.campaign_id = c.id), 0)));
end;
$$;

alter table ads.conversions drop column self_reported;

delete from supabase_migrations.schema_migrations where version = '20261210000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: intelligence and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
