-- Privacy requests, account deletion and operational switches (IP-10a).
--
--   * Members ask for a copy of their data, a correction, or deletion of their
--     account from their own Profile (GOV-C11, GOV-C12). The founder works
--     through the requests in the Control Center; every step is recorded.
--   * Deleting an account is one audited founder action on a deletion
--     request, with the username typed to confirm. It forfeits the member's
--     unsettled simulated points first (recorded reversals), then removes the
--     account: their posts, comments, follows and profile go with it, their
--     files are queued for removal by the existing media queue, and the
--     simulated ledger keeps its rows without the member (member_id becomes
--     null), so every closed month still reconciles to the cent.
--   * Switches for advertising, sharing and video posts (REL-12), beside the
--     existing registration, rewards, photo and preview switches. Ads and
--     sharing are on; video posts are off until the device test passes.
--
-- Nothing here is callable by visitors, and no founder account can be deleted
-- through it.

-- ---------------------------------------------------------------------------
-- 1. Switches

create table ops.feature_switches (
  feature     text primary key check (feature in ('ads', 'sharing', 'video_posts')),
  enabled     boolean not null,
  updated_at  timestamptz not null default pg_catalog.now(),
  updated_by  text not null default 'migration'
);
insert into ops.feature_switches (feature, enabled) values ('ads', true), ('sharing', true), ('video_posts', false);
comment on table ops.feature_switches is 'Operational switches for advertising, sharing and video posts. Changed only through public.app_founder_set_switch, always recorded.';
alter table ops.feature_switches enable row level security;
revoke all on table ops.feature_switches from public, anon, authenticated;

create table ops.feature_switch_events (
  id          bigint generated always as identity primary key,
  feature     text not null,
  enabled     boolean not null,
  reason      text not null check (char_length(reason) between 3 and 300),
  changed_by  text not null,
  changed_at  timestamptz not null default pg_catalog.now()
);
comment on table ops.feature_switch_events is 'Every change to an operational switch, with the reason. Append-only.';
alter table ops.feature_switch_events enable row level security;
revoke all on table ops.feature_switch_events from public, anon, authenticated;
create trigger feature_switch_events_no_update
before update or delete on ops.feature_switch_events
for each row execute function ops.history_append_only();

create function ops.feature_on(p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.enabled from ops.feature_switches s where s.feature = p_feature), false);
$$;
revoke all on function ops.feature_on(text) from public, anon, authenticated;

-- What the app may show: every switch a member's screens depend on.
create function public.app_features()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return pg_catalog.jsonb_build_object(
    'ads', ops.feature_on('ads'),
    'sharing', ops.feature_on('sharing'),
    'video_posts', ops.feature_on('video_posts'),
    'photos', coalesce((select m.photos_enabled from ops.media_settings m where m.id), false),
    'rewards', not coalesce((select r.paused from sim.reward_settings r limit 1), false));
end;
$$;
comment on function public.app_features() is 'Which features are switched on, so screens hide what is paused. The server enforces every switch itself.';

create function public.app_founder_switches()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return pg_catalog.jsonb_build_object(
    'switches', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('feature', s.feature, 'enabled', s.enabled,
                   'updated_at', s.updated_at, 'updated_by', s.updated_by) order by s.feature) from ops.feature_switches s),
    'registration_paused', coalesce((select r.paused from ops.registration_settings r where r.id), true),
    'external_access_approved', coalesce((select m.external_access_approved from ops.member_launch_settings m where m.id), false),
    'rewards_paused', coalesce((select r.paused from sim.reward_settings r limit 1), false),
    'photos_enabled', coalesce((select m.photos_enabled from ops.media_settings m where m.id), false),
    'recent', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('feature', e.feature, 'enabled', e.enabled, 'reason', e.reason,
                          'changed_at', e.changed_at) order by e.id desc)
                        from (select * from ops.feature_switch_events order by id desc limit 20) e), '[]'::jsonb));
end;
$$;
comment on function public.app_founder_switches() is 'Founder: every operational switch in one place (advertising, sharing and video posts here; registration, rewards and photos read from their own settings).';

create function public.app_founder_set_switch(p_feature text, p_enabled boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_reason text := pg_catalog.btrim(coalesce(p_reason, ''));
begin
  if p_enabled is null or char_length(v_reason) < 3 then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;
  if p_feature = 'video_posts' and p_enabled then
    -- Video posts stay off until the real-device test has passed and the
    -- video publishing package is deployed (it replaces this refusal).
    raise exception 'video_not_ready' using errcode = 'P0001';
  end if;
  update ops.feature_switches set enabled = p_enabled, updated_at = pg_catalog.now(), updated_by = 'founder:' || v_uid::text
  where feature = p_feature;
  if not found then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into ops.feature_switch_events (feature, enabled, reason, changed_by) values (p_feature, p_enabled, v_reason, 'founder:' || v_uid::text);
end;
$$;
comment on function public.app_founder_set_switch(text, boolean, text) is 'Founder: turns advertising, sharing or video posts on or off, with a recorded reason. Takes effect at once.';

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
      and ops.feature_on('ads')
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
  if not ops.feature_on('sharing') then
    raise exception 'sharing_paused' using errcode = 'P0001';
  end if;
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

-- ---------------------------------------------------------------------------
-- 2. Privacy requests and account deletion

create table ops.member_requests (
  id           bigint generated always as identity primary key,
  member_id    uuid references auth.users (id) on delete set null,
  kind         text not null check (kind in ('access', 'correction', 'deletion')),
  details      text check (details is null or char_length(details) <= 1000),
  status       text not null default 'open' check (status in ('open', 'completed', 'declined', 'withdrawn')),
  created_at   timestamptz not null default pg_catalog.now(),
  resolved_at  timestamptz,
  constraint member_requests_resolved check ((status = 'open') = (resolved_at is null))
);
create unique index member_requests_one_open on ops.member_requests (member_id, kind) where status = 'open';
comment on table ops.member_requests is 'Privacy requests from members: a copy of their data, a correction, or deleting their account. Once an account is deleted the row keeps no member and no details.';
alter table ops.member_requests enable row level security;
revoke all on table ops.member_requests from public, anon, authenticated;

create table ops.member_request_events (
  id          bigint generated always as identity primary key,
  request_id  bigint not null references ops.member_requests (id),
  action      text not null check (action in ('submitted', 'withdrawn', 'completed', 'declined', 'account_deleted')),
  actor       text not null,
  note        text check (note is null or char_length(note) <= 500),
  occurred_at timestamptz not null default pg_catalog.now()
);
comment on table ops.member_request_events is 'Every step on a privacy request, including account deletions. Append-only.';
alter table ops.member_request_events enable row level security;
revoke all on table ops.member_request_events from public, anon, authenticated;
create trigger member_request_events_no_update
before update or delete on ops.member_request_events
for each row execute function ops.history_append_only();

create function public.app_submit_member_request(p_kind text, p_details text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_id bigint;
  v_details text := nullif(pg_catalog.btrim(coalesce(p_details, '')), '');
begin
  if p_kind is null or p_kind not in ('access', 'correction', 'deletion') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if v_details is not null and (char_length(v_details) > 1000 or v_details ~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if exists (select 1 from ops.member_requests r where r.member_id = v_uid and r.kind = p_kind and r.status = 'open') then
    raise exception 'request_open' using errcode = 'P0001';
  end if;
  if (select count(*) from ops.member_requests r where r.member_id = v_uid and r.created_at > pg_catalog.now() - interval '1 day') >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  insert into ops.member_requests (member_id, kind, details) values (v_uid, p_kind, v_details) returning id into v_id;
  insert into ops.member_request_events (request_id, action, actor) values (v_id, 'submitted', 'member');
  return v_id;
end;
$$;
comment on function public.app_submit_member_request(text, text) is 'A member asks for a copy of their data, a correction, or deletion of their account. One open request of each kind.';

create function public.app_my_member_requests()
returns table (id bigint, kind text, status text, created_at timestamptz, resolved_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query select r.id, r.kind, r.status, r.created_at, r.resolved_at
  from ops.member_requests r where r.member_id = v_uid order by r.created_at desc limit 50;
end;
$$;
comment on function public.app_my_member_requests() is 'The member''s own privacy requests and where each stands.';

create function public.app_withdraw_member_request(p_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  update ops.member_requests set status = 'withdrawn', resolved_at = pg_catalog.now()
  where id = p_id and member_id = v_uid and status = 'open';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into ops.member_request_events (request_id, action, actor) values (p_id, 'withdrawn', 'member');
end;
$$;
comment on function public.app_withdraw_member_request(bigint) is 'The member withdraws one of their own open requests.';

create function public.app_founder_member_requests()
returns table (id bigint, kind text, status text, details text, username text, display_name text, created_at timestamptz, resolved_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return query select r.id, r.kind, r.status, r.details, p.username, p.display_name, r.created_at, r.resolved_at
  from ops.member_requests r left join public.profiles p on p.id = r.member_id
  order by (r.status = 'open') desc, r.created_at desc limit 200;
end;
$$;
comment on function public.app_founder_member_requests() is 'Founder: privacy requests, open first.';

create function public.app_founder_resolve_member_request(p_id bigint, p_completed boolean, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_note text := nullif(pg_catalog.btrim(coalesce(p_note, '')), '');
begin
  if v_note is null or char_length(v_note) > 500 then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from ops.member_requests r where r.id = p_id and r.kind = 'deletion' and p_completed) then
    -- A deletion is completed only by deleting the account.
    raise exception 'use_delete_account' using errcode = 'P0001';
  end if;
  update ops.member_requests set status = case when p_completed then 'completed' else 'declined' end, resolved_at = pg_catalog.now()
  where id = p_id and status = 'open';
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into ops.member_request_events (request_id, action, actor, note)
  values (p_id, case when p_completed then 'completed' else 'declined' end, 'founder:' || v_uid::text, v_note);
end;
$$;
comment on function public.app_founder_resolve_member_request(bigint, boolean, text) is 'Founder: completes or declines a copy or correction request (or declines a deletion), with a recorded note.';

-- The simulated ledger keeps a deleted member's rows, without the member.
alter table sim.points_ledger drop constraint points_ledger_member_id_fkey;
alter table sim.points_ledger add constraint points_ledger_member_id_fkey
  foreign key (member_id) references auth.users (id) on delete set null;

create function public.app_founder_delete_member(p_request bigint, p_confirm_username text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  r ops.member_requests%rowtype;
  v_username text;
  v_forfeited integer := 0;
  v_key text;
  v_posts bigint;
begin
  select * into r from ops.member_requests where id = p_request for update;
  if not found or r.kind <> 'deletion' or r.status <> 'open' or r.member_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select p.username into v_username from public.profiles p where p.id = r.member_id;
  if v_username is null or v_username <> lower(pg_catalog.btrim(coalesce(p_confirm_username, ''))) then
    raise exception 'confirmation_mismatch' using errcode = 'P0001';
  end if;
  if r.member_id = v_uid or exists (select 1 from ops.member_access a where a.user_id = r.member_id and a.cohort = 'founder') then
    raise exception 'cannot_delete_founder' using errcode = 'P0001';
  end if;
  -- Unsettled simulated points are forfeited first, as recorded reversals.
  for v_key in select l.source_key from sim.points_ledger l
               where l.member_id = r.member_id and l.reverses is null and l.points > 0
                 and sim.award_state(l.id) in ('recognized', 'pending_review', 'approved') loop
    perform sim.reverse(v_key, 'account_deleted:' || v_key);
    v_forfeited := v_forfeited + 1;
  end loop;
  select count(*) into v_posts from social.posts s where s.author_id = r.member_id;
  update ops.member_requests set status = 'completed', resolved_at = pg_catalog.now(), details = null where id = r.id;
  insert into ops.member_request_events (request_id, action, actor, note)
  values (r.id, 'account_deleted', 'founder:' || v_uid::text,
          pg_catalog.format('%s posts removed; %s simulated awards forfeited', v_posts, v_forfeited));
  delete from auth.users where id = r.member_id;
  return pg_catalog.jsonb_build_object('posts_removed', v_posts, 'awards_forfeited', v_forfeited);
end;
$$;
comment on function public.app_founder_delete_member(bigint, text) is 'Founder: deletes the account behind an open deletion request (username typed to confirm). Forfeits unsettled simulated points, removes the account and its content, queues its files, keeps the anonymous ledger. Never a founder.';

-- ---------------------------------------------------------------------------
-- 3. Privileges

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_features()',
    'public.app_founder_switches()',
    'public.app_founder_set_switch(text, boolean, text)',
    'public.app_record_share(uuid, text)',
    'public.app_submit_member_request(text, text)',
    'public.app_my_member_requests()',
    'public.app_withdraw_member_request(bigint)',
    'public.app_founder_member_requests()',
    'public.app_founder_resolve_member_request(bigint, boolean, text)',
    'public.app_founder_delete_member(bigint, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
revoke all on all functions in schema ads from public, anon, authenticated;
