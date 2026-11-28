-- Public previews on by default (BL-006, MVP refinement sprint, founder
-- authorized Nov 28, 2026; external activation stays subject to legal
-- clearance and the founder's approval).
--
-- Before: a post could be previewed outside Splitpost only if its creator had
-- explicitly allowed it (social.preview_consents). Now: every eligible public
-- post can be previewed unless its creator has switched previews off
-- (social.preview_optouts). Members are told this where they share and in
-- Settings, and can switch it off, or on again, at any time, with immediate
-- effect.
--
-- What does not change:
--   * the project-wide switch, ops.public_preview_settings.enabled, still
--     gates every preview. It stays off in member Production until the founder
--     turns it on after legal clearance (docs/PREVIEWS.md);
--   * what a preview shows: the text, time, topic and creator's name; never a
--     photo or video, counts, comments or anything about other members;
--   * what is never previewed: deleted or moderated (hidden) posts, posts
--     with an open report, posts without text, and posts by members who are
--     blocked, suspended, removed or without active access;
--   * rate limits and visit counts.
-- The consent table is kept, now as the record of members who switched
-- previews on again after switching them off (with the wording they saw).

create table social.preview_optouts (
  member_id       uuid primary key references auth.users (id) on delete cascade,
  opted_out_at    timestamptz not null default pg_catalog.now(),
  wording_version text check (wording_version is null or wording_version ~ '^[a-z0-9][a-z0-9._-]{0,31}$')
);
comment on table social.preview_optouts is 'Members who switched public previews of their posts off (BL-006, 20261222000000). Previews are on by default for eligible posts; a row here stops them at once.';
alter table social.preview_optouts enable row level security;
revoke all on table social.preview_optouts from public, anon, authenticated;

create or replace function public.app_public_post(p_post uuid, p_ref text default null)
returns table (
  id uuid, body text, created_at timestamptz, edited boolean, has_photo boolean,
  topic_label text, author_username text, author_display_name text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_minute timestamptz := pg_catalog.date_trunc('minute', pg_catalog.now());
  v_all constant uuid := '00000000-0000-0000-0000-000000000000';
  v_total integer;
  v_this integer;
  v_ref text := case when p_ref ~ '^[0-9a-f]{16}$' then p_ref else '' end;
begin
  -- Previews off: nothing at all, the same answer as a missing post.
  if not coalesce((select s.enabled from ops.public_preview_settings s where s.id), false) then
    raise exception 'not_available' using errcode = 'P0001';
  end if;
  if p_post is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Rate limits: 600 a minute overall, 60 a minute per post.
  delete from social.preview_rate r where r.minute < v_minute - interval '5 minutes';
  insert into social.preview_rate as r (minute, post_id, n) values (v_minute, v_all, 1)
  on conflict (minute, post_id) do update set n = r.n + 1 returning r.n into v_total;
  insert into social.preview_rate as r (minute, post_id, n) values (v_minute, p_post, 1)
  on conflict (minute, post_id) do update set n = r.n + 1 returning r.n into v_this;
  if v_total > 600 or v_this > 60 then
    raise exception 'rate_limited' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from social.posts s
    join social.visible_members p on p.id = s.author_id
    where s.id = p_post
      and s.deleted_at is null
      and s.body <> ''
      and not exists (select 1 from social.preview_optouts o where o.member_id = s.author_id)
      and not exists (select 1 from ops.content_reports r where r.target_type = 'post' and r.target_id = s.id and r.status = 'open')
  ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into social.preview_visits as v (day, post_id, ref_code, views) values ((pg_catalog.now() at time zone 'utc')::date, p_post, v_ref, 1)
  on conflict (day, post_id, ref_code) do update set views = v.views + 1;
  return query
  select s.id, s.body, s.created_at, s.edited_at is not null, s.media_kind is not null,
         t.label, p.username, p.display_name
  from social.posts s
  join social.visible_members p on p.id = s.author_id
  left join social.topics t on t.slug = s.topic
  where s.id = p_post;
end;
$$;
comment on function public.app_public_post(uuid, text) is 'The one function visitors may call: a read-only preview of one eligible post (text, time, topic, creator name; never the photo or video, counts, comments or anything about other members). Only while previews are on project-wide, and not for creators who switched previews off (on by default since 20261222000000); rate limited; visits counted per day, post and referral link.';

create or replace function public.app_set_public_previews(p_allowed boolean, p_wording_version text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_allowed is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_wording_version is not null and p_wording_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_allowed then
    delete from social.preview_optouts o where o.member_id = v_uid;
    if p_wording_version is not null then
      insert into social.preview_consents (member_id, wording_version) values (v_uid, p_wording_version)
      on conflict (member_id) do update set consented_at = pg_catalog.now(), wording_version = excluded.wording_version;
    end if;
  else
    insert into social.preview_optouts (member_id, wording_version) values (v_uid, p_wording_version)
    on conflict (member_id) do update set opted_out_at = pg_catalog.now(), wording_version = excluded.wording_version;
    delete from social.preview_consents pc where pc.member_id = v_uid;
  end if;
end;
$$;
comment on function public.app_set_public_previews(boolean, text) is 'Switches public previews of the member''s own posts off (recorded at once) or back on (with the wording shown). On by default since 20261222000000.';

create or replace function public.app_public_previews_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return not exists (select 1 from social.preview_optouts o where o.member_id = v_uid);
end;
$$;
comment on function public.app_public_previews_allowed() is 'Whether the member''s eligible posts can be previewed outside Splitpost: true unless they switched previews off. Previews also need the project-wide switch.';
