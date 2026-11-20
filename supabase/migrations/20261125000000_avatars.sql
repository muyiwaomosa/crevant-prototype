-- Profile pictures (Build 5, Stage 5.2b).
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- Members never touch Storage directly: there are NO storage policies for
-- members or visitors, and the bucket is private. Every upload, removal and
-- signed link goes through the avatar Edge Function
-- (supabase/functions/avatar), which re-checks authorization with the
-- database for every action, decodes and re-encodes every image, and only
-- then uses the service key for Storage.
--
-- What this migration adds:
--   * the private `avatars` bucket: JPEG only, at most 200 KB;
--   * social.avatars: each member's current picture (one, unique path);
--   * social.avatar_uploads: uploads the database has authorised (the path
--     is chosen here, never by the browser), committable for 15 minutes;
--   * social.avatar_events: append-only, for the 10-changes-a-day limit;
--   * ops.storage_orphans and ops.storage_cleanup_plans: files left behind by
--     a failed step, and the moderator's dry-run-then-confirm cleanup;
--   * member functions app_avatar_begin, app_avatar_remove, app_avatars,
--     and (moderators only) app_mod_storage_preview,
--     app_mod_storage_cleanup_start, app_mod_storage_cleanup_finish;
--   * service-only functions svc_avatar_commit and svc_avatar_orphan, which
--     only the Edge Function's service role can call.
--
-- Additive, plus two extra moderation action names (storage cleanup).

-- ---------------------------------------------------------------------------
-- 1. The bucket (where Storage is installed: hosted projects and local Supabase).

do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('avatars', 'avatars', false, 204800, array['image/jpeg']);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Tables (private: reached only through functions).

create table social.avatars (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  path        text not null unique,
  updated_at  timestamptz not null default pg_catalog.now(),
  -- <member id>/<random id>.jpg, inside the member's own folder.
  constraint avatars_path_format check (
    path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$'
    and pg_catalog.split_part(path, '/', 1) = user_id::text)
);
comment on table social.avatars is 'Each member''s current profile picture (a path in the private avatars bucket). Changed only through the avatar Edge Function.';

create table social.avatar_uploads (
  path          text primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'committed', 'failed')),
  created_at    timestamptz not null default pg_catalog.now(),
  finished_at   timestamptz,
  constraint avatar_uploads_path_owner check (pg_catalog.split_part(path, '/', 1) = user_id::text)
);
create index avatar_uploads_pending on social.avatar_uploads (created_at) where status = 'pending';
comment on table social.avatar_uploads is 'Uploads the database authorised, with the path it chose. Committable for 15 minutes; storage cleanup never touches one younger than an hour.';

create table social.avatar_events (
  id           bigint generated always as identity primary key,
  -- No foreign key: kept for the rate limit after the account goes.
  user_id      uuid not null,
  action       text not null check (action in ('upload_started', 'committed', 'removed')),
  occurred_at  timestamptz not null default pg_catalog.now()
);
create index avatar_events_by_user on social.avatar_events (user_id, occurred_at);
create trigger avatar_events_no_update before update or delete on social.avatar_events
for each row execute function ops.history_append_only();
create trigger avatar_events_no_truncate before truncate on social.avatar_events
for each statement execute function ops.history_append_only();

create table ops.storage_orphans (
  path         text primary key,
  reason       text not null check (char_length(reason) between 1 and 200),
  recorded_at  timestamptz not null default pg_catalog.now(),
  deleted_at   timestamptz
);
comment on table ops.storage_orphans is 'Files a failed step may have left in Storage. Removed by the moderator''s storage cleanup.';

create table ops.storage_cleanup_plans (
  id             uuid primary key default gen_random_uuid(),
  moderator_id   uuid not null,
  created_at     timestamptz not null default pg_catalog.now(),
  expires_at     timestamptz not null,
  paths          text[] not null,
  total_bytes    bigint not null,
  confirm_phrase text not null,
  status         text not null default 'previewed' check (status in ('previewed', 'executing', 'done')),
  executed_at    timestamptz,
  deleted_count  integer
);
comment on table ops.storage_cleanup_plans is 'A storage cleanup dry run, valid for 15 minutes, that only the moderator who made it can confirm.';

alter table social.avatars enable row level security;
alter table social.avatar_uploads enable row level security;
alter table social.avatar_events enable row level security;
alter table ops.storage_orphans enable row level security;
alter table ops.storage_cleanup_plans enable row level security;
revoke all on table social.avatars, social.avatar_uploads, social.avatar_events, ops.storage_orphans, ops.storage_cleanup_plans
  from public, anon, authenticated;
grant all on table social.avatars, social.avatar_uploads, social.avatar_events to service_role;
grant select on table ops.storage_orphans, ops.storage_cleanup_plans to service_role;

-- Storage cleanup is recorded in the moderation audit trail.
alter table ops.moderation_actions drop constraint moderation_actions_action_check;
alter table ops.moderation_actions add constraint moderation_actions_action_check
  check (action in ('hide', 'restore', 'dismiss', 'hold_set', 'hold_cleared', 'retention_purge', 'storage_cleanup_preview', 'storage_cleanup'));

-- ---------------------------------------------------------------------------
-- 3. Helpers.

-- One avatar change at a time per member (uploads, commits, removals).
create function social.avatar_lock(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('social.avatar:' || p_user::text, 0));
$$;
revoke all on function social.avatar_lock(uuid) from public, anon, authenticated;

-- At most 10 changes (uploads started, removals) in 24 hours.
create function social.avatar_rate_check(p_user uuid)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if (select count(*) from social.avatar_events e
      where e.user_id = p_user and e.action in ('upload_started', 'removed')
        and e.occurred_at > pg_catalog.now() - interval '24 hours') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'You can change your picture 10 times a day.';
  end if;
end;
$$;
revoke all on function social.avatar_rate_check(uuid) from public, anon, authenticated;

-- Files that may be deleted: in the avatars bucket, older than 24 hours, not
-- anyone's current picture, and not an upload that could still be committed
-- or is younger than an hour. Rechecked at confirmation time.
create function ops.storage_cleanup_candidates()
returns table (path text, bytes bigint)
language plpgsql
stable
set search_path = ''
as $$
begin
  return query
  select o.name::text, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id = 'avatars'
    and o.created_at < pg_catalog.now() - interval '24 hours'
    and not exists (select 1 from social.avatars a where a.path = o.name)
    and not exists (select 1 from social.avatar_uploads u
                    where u.path = o.name and (u.status = 'committed' or u.created_at > pg_catalog.now() - interval '1 hour'));
end;
$$;
revoke all on function ops.storage_cleanup_candidates() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Member functions (signed in, active pilot membership, complete profile).

-- Authorises one upload and returns the path the Edge Function must use.
create function public.app_avatar_begin()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_path text;
begin
  perform social.avatar_lock(v_uid);
  perform social.avatar_rate_check(v_uid);
  v_path := v_uid::text || '/' || gen_random_uuid()::text || '.jpg';
  insert into social.avatar_uploads (path, user_id) values (v_path, v_uid);
  insert into social.avatar_events (user_id, action) values (v_uid, 'upload_started');
  return v_path;
end;
$$;

-- Removes the caller's own picture. Returns the file to delete (or null).
create function public.app_avatar_remove()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_old text;
begin
  perform social.avatar_lock(v_uid);
  if not exists (select 1 from social.avatars where user_id = v_uid) then
    return null;
  end if;
  perform social.avatar_rate_check(v_uid);
  delete from social.avatars where user_id = v_uid returning path into v_old;
  insert into social.avatar_events (user_id, action) values (v_uid, 'removed');
  return v_old;
end;
$$;

-- Current pictures of visible members (active, not hidden by moderation).
create function public.app_avatars(p_members uuid[])
returns table (id uuid, path text, updated_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if cardinality(coalesce(p_members, '{}')) > 100 then
    raise exception 'too_many' using errcode = 'P0001';
  end if;
  return query
  select a.user_id, a.path, a.updated_at
  from social.avatars a
  join social.visible_members v on v.id = a.user_id
  left join social.profile_details d on d.user_id = a.user_id
  where a.user_id = any (coalesce(p_members, '{}')) and d.hidden_at is null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Storage cleanup (moderators only): dry run, then explicit confirmation.

create function public.app_mod_storage_preview()
returns table (plan_id uuid, file_count integer, total_bytes bigint, confirm_phrase text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_paths text[];
  v_bytes bigint;
  v_plan uuid;
  v_phrase text;
  v_expires timestamptz := pg_catalog.now() + interval '15 minutes';
begin
  select coalesce(array_agg(c.path order by c.path), '{}'), coalesce(sum(c.bytes), 0) into v_paths, v_bytes
  from ops.storage_cleanup_candidates() c;
  v_phrase := pg_catalog.format('DELETE %s FILES', cardinality(v_paths));
  insert into ops.storage_cleanup_plans (moderator_id, expires_at, paths, total_bytes, confirm_phrase)
  values (v_uid, v_expires, v_paths, v_bytes, v_phrase)
  returning ops.storage_cleanup_plans.id into v_plan;
  insert into ops.moderation_actions (actor_id, actor_label, action, note)
  values (v_uid, 'moderator', 'storage_cleanup_preview',
          pg_catalog.format('dry run: %s unused file(s), %s bytes', cardinality(v_paths), v_bytes));
  return query select v_plan, cardinality(v_paths), v_bytes, v_phrase, v_expires;
end;
$$;

-- Confirms a dry run (same moderator, within 15 minutes, exact phrase), and
-- returns only the files that are STILL safe to delete.
create function public.app_mod_storage_cleanup_start(p_plan uuid, p_confirm text)
returns setof text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  p record;
  v_paths text[];
begin
  select * into p from ops.storage_cleanup_plans where id = p_plan for update;
  if p.id is null or p.moderator_id <> v_uid then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p.status <> 'previewed' then
    raise exception 'not_open' using errcode = 'P0001', detail = 'This cleanup was already confirmed.';
  end if;
  if p.expires_at <= pg_catalog.now() then
    raise exception 'plan_expired' using errcode = 'P0001', detail = 'Run the check again; it is only valid for 15 minutes.';
  end if;
  if p_confirm is distinct from p.confirm_phrase then
    raise exception 'confirmation_mismatch' using errcode = 'P0001', detail = 'Type the confirmation exactly as shown.';
  end if;
  select coalesce(array_agg(c.path order by c.path), '{}') into v_paths
  from ops.storage_cleanup_candidates() c
  where c.path = any (p.paths);
  update ops.storage_cleanup_plans set status = 'executing', paths = v_paths where id = p.id;
  return query select unnest(v_paths);
end;
$$;

-- Records what was really deleted: only planned files that no longer exist in Storage.
create function public.app_mod_storage_cleanup_finish(p_plan uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  p record;
  v_gone text[];
begin
  select * into p from ops.storage_cleanup_plans where id = p_plan for update;
  if p.id is null or p.moderator_id <> v_uid or p.status <> 'executing' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  select coalesce(array_agg(x), '{}') into v_gone
  from unnest(p.paths) x
  where not exists (select 1 from storage.objects o where o.bucket_id = 'avatars' and o.name = x);
  update ops.storage_orphans set deleted_at = pg_catalog.now() where path = any (v_gone) and deleted_at is null;
  update ops.storage_cleanup_plans set status = 'done', executed_at = pg_catalog.now(), deleted_count = cardinality(v_gone) where id = p.id;
  insert into ops.moderation_actions (actor_id, actor_label, action, note)
  values (v_uid, 'moderator', 'storage_cleanup',
          pg_catalog.format('deleted %s of %s confirmed file(s)', cardinality(v_gone), cardinality(p.paths)));
  return cardinality(v_gone);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Service-only functions (the Edge Function's service role, never members).

-- Makes an authorised upload the member's picture. Re-checks membership NOW
-- (it may have been revoked since the upload began). Returns the previous
-- file, for the Edge Function to delete.
create function public.svc_avatar_commit(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  u record;
  v_old text;
begin
  select * into u from social.avatar_uploads where path = p_path for update;
  if u.path is null or u.status <> 'pending' then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if u.created_at <= pg_catalog.now() - interval '15 minutes' then
    update social.avatar_uploads set status = 'failed', finished_at = pg_catalog.now() where path = p_path;
    raise exception 'upload_expired' using errcode = 'P0001';
  end if;
  if not ops.member_access_active(u.user_id)
     or not exists (select 1 from public.profiles p where p.id = u.user_id and p.username is not null and p.display_name is not null) then
    update social.avatar_uploads set status = 'failed', finished_at = pg_catalog.now() where path = p_path;
    raise exception 'no_pilot_access' using errcode = 'P0001';
  end if;
  perform social.avatar_lock(u.user_id);
  select a.path into v_old from social.avatars a where a.user_id = u.user_id;
  insert into social.avatars as a (user_id, path) values (u.user_id, p_path)
  on conflict (user_id) do update set path = excluded.path, updated_at = pg_catalog.now();
  update social.avatar_uploads set status = 'committed', finished_at = pg_catalog.now() where path = p_path;
  insert into social.avatar_events (user_id, action) values (u.user_id, 'committed');
  return v_old;
end;
$$;

-- Records a file a failed step may have left behind (and closes its upload).
create function public.svc_avatar_orphan(p_path text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_path is null or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update social.avatar_uploads set status = 'failed', finished_at = pg_catalog.now() where path = p_path and status = 'pending';
  insert into ops.storage_orphans (path, reason) values (p_path, pg_catalog.left(coalesce(p_reason, 'unknown'), 200))
  on conflict (path) do update set reason = excluded.reason, deleted_at = null;
end;
$$;

comment on function public.app_avatar_begin() is 'Authorises one picture upload for the signed-in member (10 changes a day) and returns the path to use. Called by the avatar Edge Function.';
comment on function public.app_avatar_remove() is 'Removes the signed-in member''s picture and returns the file to delete. Called by the avatar Edge Function.';
comment on function public.app_avatars(uuid[]) is 'Current picture paths of visible members (at most 100 ids). Called by the avatar Edge Function to sign links.';
comment on function public.app_mod_storage_preview() is 'Moderators only: a dry run of unused picture files to delete, valid 15 minutes.';
comment on function public.app_mod_storage_cleanup_start(uuid, text) is 'Moderators only: confirms a dry run with its exact phrase and returns the files still safe to delete.';
comment on function public.app_mod_storage_cleanup_finish(uuid) is 'Moderators only: records which confirmed files were really deleted.';
comment on function public.svc_avatar_commit(text) is 'Service role only (avatar Edge Function): makes an authorised upload the member''s picture, re-checking membership.';
comment on function public.svc_avatar_orphan(text, text) is 'Service role only (avatar Edge Function): records a file a failed step may have left behind.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_avatar_begin()',
    'public.app_avatar_remove()',
    'public.app_avatars(uuid[])',
    'public.app_mod_storage_preview()',
    'public.app_mod_storage_cleanup_start(uuid, text)',
    'public.app_mod_storage_cleanup_finish(uuid)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
  foreach f in array array['public.svc_avatar_commit(text)', 'public.svc_avatar_orphan(text, text)'] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
