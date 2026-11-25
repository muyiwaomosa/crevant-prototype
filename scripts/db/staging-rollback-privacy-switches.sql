-- Staging only: undoes 20261212000000 (privacy requests and switches). Never run it against a Production project. Tested locally by
-- scripts/db/rollback-privacy-switches-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-privacy-switches.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE THE STAGING PRIVACY AND SWITCHES' -f ...
--
-- Removes privacy requests, account deletion and the advertising, sharing and
-- video switches; puts back the earlier ad matching and share functions and the
-- ledger's original member reference. Refuses, changing nothing, while any
-- privacy request or switch change exists, if the record or an expected
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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE THE STAGING PRIVACY AND SWITCHES' then
    raise exception 'apply needs the confirmation phrase: REMOVE THE STAGING PRIVACY AND SWITCHES';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261212000000')
     or to_regclass('ops.feature_switches') is null then
    raise exception 'refused: expected objects are missing (20261212000000 privacy requests and switches), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261212000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

lock table ops.member_requests, ops.feature_switch_events in share row exclusive mode;

do $$
declare
  n bigint;
begin
  n := (select count(*) from ops.member_requests) + (select count(*) from ops.feature_switch_events);
  if n > 0 then
    raise exception 'refused, nothing changed: % rows of data depend on privacy requests and switches (requests, switch changes). Fix forward instead.', n;
  end if;
end $$;

\echo 'Checks passed. Removing privacy requests, switches and the migration record.'

drop function public.app_founder_delete_member(bigint, text);
drop function public.app_founder_resolve_member_request(bigint, boolean, text);
drop function public.app_founder_member_requests();
drop function public.app_withdraw_member_request(bigint);
drop function public.app_my_member_requests();
drop function public.app_submit_member_request(text, text);
drop table ops.member_request_events;
drop table ops.member_requests;
alter table sim.points_ledger drop constraint points_ledger_member_id_fkey;
alter table sim.points_ledger add constraint points_ledger_member_id_fkey
  foreign key (member_id) references auth.users (id) on delete cascade;
create or replace function ads.choose(p_member uuid, p_surface text, p_topic text)
returns table (campaign_id uuid, match text, matched text)
language sql
stable
set search_path = ''
as $$
  with live as (
    select c.*
    from ads.campaigns c
    join ads.advertisers a on a.id = c.advertiser_id and a.status = 'approved'
    where c.status = 'active'
      and (pg_catalog.now() at time zone 'utc')::date between c.starts_on and c.ends_on
      and (c.placement = 'both' or c.placement = p_surface)
      and not exists (select 1 from ads.exclusions x where x.member_id = p_member
                      and ((x.kind = 'campaign' and x.target = c.id::text)
                        or (x.kind = 'advertiser' and x.target = c.advertiser_id::text)
                        or (x.kind = 'category' and x.target = any (c.categories))))
      and (select count(*) from ads.impressions i where i.campaign_id = c.id and i.member_id = p_member
           and i.served_at > pg_catalog.date_trunc('day', pg_catalog.now())) < c.daily_cap
  ),
  scored as (
    select l.id,
           case
             when exists (select 1 from ads.preferences p where p.member_id = p_member and p.category = any (l.categories)) then 'preference'
             when p_surface = 'content' and p_topic is not null and not ads.topic_is_sensitive(p_topic) and p_topic = any (l.context_topics) then 'context'
             when l.allow_general then 'general'
           end as match,
           case
             when exists (select 1 from ads.preferences p where p.member_id = p_member and p.category = any (l.categories))
               then (select c.label from ads.preferences p join ads.categories c on c.slug = p.category
                     where p.member_id = p_member and p.category = any (l.categories) order by c.sort_order limit 1)
             when p_surface = 'content' and p_topic is not null and not ads.topic_is_sensitive(p_topic) and p_topic = any (l.context_topics)
               then (select t.label from social.topics t where t.slug = p_topic)
           end as matched,
           (select count(*) from ads.impressions i where i.campaign_id = l.id and i.member_id = p_member
            and i.served_at > pg_catalog.date_trunc('day', pg_catalog.now())) as seen_today
    from live l
  )
  select s.id, s.match, s.matched
  from scored s
  where s.match is not null
  order by case s.match when 'preference' then 0 when 'context' then 1 else 2 end,
           s.seen_today,
           pg_catalog.md5(s.id::text || ((pg_catalog.now() at time zone 'utc')::date)::text)
  limit 1;
$$;

create or replace function public.app_record_share(p_post uuid, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_channel is null or p_channel not in ('copy_link', 'share_sheet') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if not exists (select 1 from social.posts s join social.visible_members p on p.id = s.author_id where s.id = p_post and s.deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.share:' || v_uid::text, 0));
  -- Once per member, post and channel an hour: repeated taps count once.
  if exists (select 1 from social.shares x where x.member_id = v_uid and x.post_id = p_post and x.channel = p_channel
             and x.created_at > pg_catalog.now() - interval '1 hour') then
    return;
  end if;
  if (select count(*) from social.shares x where x.member_id = v_uid and x.created_at > pg_catalog.now() - interval '1 hour') >= 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into social.shares (member_id, post_id, channel) values (v_uid, p_post, p_channel);
end;
$$;
revoke all on function public.app_record_share(uuid, text) from public, anon;
grant execute on function public.app_record_share(uuid, text) to authenticated;
revoke all on all functions in schema ads from public, anon, authenticated;
drop function public.app_founder_set_switch(text, boolean, text);
drop function public.app_founder_switches();
drop function public.app_features();
drop function ops.feature_on(text);
drop table ops.feature_switch_events;
drop table ops.feature_switches;

delete from supabase_migrations.schema_migrations where version = '20261212000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: privacy requests and switches and the migration record were removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
