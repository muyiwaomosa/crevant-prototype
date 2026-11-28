-- Staging only: undoes 20261222000000 (public previews on by default). Never run it against a Production project.
-- Tested locally by scripts/db/rollback-preview-default-test.sh.
--
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=check -v confirm= -f scripts/db/staging-rollback-preview-default.sql
--   psql "<url>" -X -q -v ON_ERROR_STOP=1 -v mode=apply -v confirm='REMOVE STAGING PREVIEW DEFAULT' -f ...
--
-- Restores opt-in previews exactly as 20261204000000 left them: the three
-- functions, then drops social.preview_optouts and the migration record.
-- Members who never chose are no longer previewed; members who switched on
-- again after switching off keep their consent row. Refuses, changing nothing,
-- if the record is missing or a later migration exists.

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
     and current_setting('crevant.rollback_confirm') <> 'REMOVE STAGING PREVIEW DEFAULT' then
    raise exception 'apply needs the confirmation phrase: REMOVE STAGING PREVIEW DEFAULT';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is null then
    raise exception 'refused: no Supabase migration history here (supabase_migrations.schema_migrations)';
  end if;
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261222000000')
     or to_regclass('social.preview_optouts') is null then
    raise exception 'refused: expected objects are missing (20261222000000 preview default), so the database is not in the state this rollback was written for';
  end if;
  if exists (select 1 from supabase_migrations.schema_migrations where version > '20261222000000') then
    raise exception 'refused, nothing changed: a later migration is recorded';
  end if;
end $$;

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
      and exists (select 1 from social.preview_consents pc where pc.member_id = s.author_id)
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
comment on function public.app_public_post(uuid, text) is 'The one function visitors may call: a read-only preview of one eligible post (text, time, topic, creator name; never the photo, counts, comments or anything about other members). Only while previews are on and only for creators who opted in; rate limited; visits counted per day, post and referral link.';

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
  if p_allowed then
    -- Consent needs the wording the member was shown.
    if p_wording_version is null or p_wording_version !~ '^[a-z0-9][a-z0-9._-]{0,31}$' then
      raise exception 'invalid_request' using errcode = 'P0001';
    end if;
    insert into social.preview_consents (member_id, wording_version) values (v_uid, p_wording_version)
    on conflict (member_id) do update set consented_at = pg_catalog.now(), wording_version = excluded.wording_version;
  else
    delete from social.preview_consents pc where pc.member_id = v_uid;
  end if;
end;
$$;
comment on function public.app_set_public_previews(boolean, text) is 'Lets a member explicitly allow public previews of their posts (recording the wording shown) or withdraw that choice at once.';

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
  return exists (select 1 from social.preview_consents pc where pc.member_id = v_uid);
end;
$$;

drop table social.preview_optouts;
delete from supabase_migrations.schema_migrations where version = '20261222000000';

select current_setting('crevant.rollback_mode') = 'apply' as apply \gset
\if :apply
  commit;
  \echo 'Applied: previews are opt-in again, the switch-off table was removed, and the migration record was removed.'
\else
  rollback;
  \echo 'Check only: every check and the removal succeeded inside the transaction, and all of it was rolled back. Nothing changed.'
\endif
