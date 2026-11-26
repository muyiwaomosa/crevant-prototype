-- Deletion register (recovery safeguard, docs/RECOVERY.md).
--
-- A database restore brings back whatever was deleted after the backup was
-- taken. To delete it again, recovery needs a list of those deletions that
-- does not live in the restored database. This migration keeps that list in
-- two places:
--
--   1. ops.deletion_register: one row per completed deletion or restore of
--      an account, post or comment, written by triggers in the SAME
--      transaction as the change, so a deletion that fails (and rolls back)
--      leaves no row. Ids and times only: no names, emails or content.
--   2. The post-media function's scheduled drain (every 15 minutes) reads
--      the rows not yet reported and writes each one to the Edge Function
--      log, which Supabase keeps outside the database (7 days on Pro, the
--      same as the daily backups), then marks them reported. It only ever
--      sees committed rows.
--
-- After a restore, ops.reapply_deletions (run by the founder in the SQL
-- editor, never by members) applies the logged events that happened after
-- the backup: accounts are deleted again, posts and comments are marked
-- deleted again (or restored again, if an appeal restored them later).
--
-- Rows are kept 30 days (four times the backup window), then removed by the
-- drain once they have been reported.

create table ops.deletion_register (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('account', 'post', 'comment')),
  target_id    uuid not null,
  event        text not null check (event in ('deleted', 'restored')),
  occurred_at  timestamptz not null default pg_catalog.now(),
  reported_at  timestamptz
);
create index deletion_register_unreported on ops.deletion_register (id) where reported_at is null;
comment on table ops.deletion_register is 'Completed deletions and restores of accounts, posts and comments: ids and times only, for re-applying after a database restore (docs/RECOVERY.md). Written in the same transaction as the change; reported to the Edge Function log by the scheduled drain; kept 30 days.';
alter table ops.deletion_register enable row level security;
revoke all on table ops.deletion_register from public, anon, authenticated;

-- History stays as written: only reported_at may be set (once), and only
-- reported rows older than 30 days may be removed.
create function ops.deletion_register_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if old.reported_at is null and new.reported_at is not null
       and (new.id, new.kind, new.target_id, new.event, new.occurred_at) = (old.id, old.kind, old.target_id, old.event, old.occurred_at) then
      return new;
    end if;
    raise exception 'deletion_register is append-only';
  end if;
  if old.reported_at is not null and old.occurred_at < pg_catalog.now() - interval '30 days' then
    return old;
  end if;
  raise exception 'deletion_register is append-only';
end;
$$;
revoke all on function ops.deletion_register_guard() from public, anon, authenticated;
create trigger deletion_register_guard
before update or delete on ops.deletion_register
for each row execute function ops.deletion_register_guard();
create trigger deletion_register_no_truncate
before truncate on ops.deletion_register
for each statement execute function ops.history_append_only();

-- The triggers that write it.
create function ops.register_account_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into ops.deletion_register (kind, target_id, event) values ('account', old.id, 'deleted');
  return old;
end;
$$;
revoke all on function ops.register_account_deletion() from public, anon, authenticated;
create trigger register_account_deletion
after delete on auth.users
for each row execute function ops.register_account_deletion();

create function ops.register_content_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    insert into ops.deletion_register (kind, target_id, event)
    values (case tg_table_name when 'posts' then 'post' else 'comment' end, new.id, 'deleted');
  elsif old.deleted_at is not null and new.deleted_at is null then
    insert into ops.deletion_register (kind, target_id, event)
    values (case tg_table_name when 'posts' then 'post' else 'comment' end, new.id, 'restored');
  end if;
  return new;
end;
$$;
revoke all on function ops.register_content_deletion() from public, anon, authenticated;
create trigger register_post_deletion
after update of deleted_at on social.posts
for each row execute function ops.register_content_deletion();
create trigger register_comment_deletion
after update of deleted_at on social.comments
for each row execute function ops.register_content_deletion();

-- The drain (service only): the rows not yet reported, oldest first.
create function public.svc_deletion_register_unreported(p_limit integer)
returns table (id bigint, kind text, target_id uuid, event text, occurred_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.kind, r.target_id, r.event, r.occurred_at
  from ops.deletion_register r
  where r.reported_at is null
  order by r.id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

-- Marks rows reported once they are in the log, and removes reported rows
-- older than 30 days. Returns how many were marked.
create function public.svc_deletion_register_reported(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_marked integer;
begin
  update ops.deletion_register set reported_at = pg_catalog.now()
  where id = any (coalesce(p_ids, '{}')) and reported_at is null;
  get diagnostics v_marked = row_count;
  delete from ops.deletion_register
  where reported_at is not null and occurred_at < pg_catalog.now() - interval '30 days';
  return v_marked;
end;
$$;

-- Recovery only (docs/RECOVERY.md): re-applies the logged events that
-- happened after the backup, in order. Run by the founder in the SQL editor
-- (postgres); never granted to members or the service key. p_events is the
-- JSON array of the logged lines (each with id, kind, target_id, change and
-- occurred_at), as scripts/db/recovery/deletion-log-to-events.mjs writes it.
create function ops.reapply_deletions(p_events jsonb, p_backup_at timestamptz)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  e jsonb;
  v_accounts integer := 0;
  v_content integer := 0;
  v_restored integer := 0;
  v_skipped integer := 0;
  v_kind text;
  v_id uuid;
  v_event text;
  v_at timestamptz;
  v_n integer;
begin
  if p_backup_at is null or p_events is null or pg_catalog.jsonb_typeof(p_events) <> 'array' then
    raise exception 'reapply_deletions needs the events (a JSON array) and the backup time';
  end if;
  for e in
    select x from pg_catalog.jsonb_array_elements(p_events) x
    order by (x->>'occurred_at')::timestamptz, (x->>'id')::bigint
  loop
    v_kind := e->>'kind';
    v_id := (e->>'target_id')::uuid;
    -- The log line names the change 'change' (its own 'event' field is the log event).
    v_event := coalesce(e->>'change', e->>'event');
    v_at := (e->>'occurred_at')::timestamptz;
    if v_at <= p_backup_at or v_kind not in ('account', 'post', 'comment') or v_event not in ('deleted', 'restored') then
      v_skipped := v_skipped + 1;
      continue;
    end if;
    if v_kind = 'account' and v_event = 'deleted' then
      delete from auth.users where id = v_id;
      get diagnostics v_n = row_count;
      v_accounts := v_accounts + v_n;
    elsif v_kind = 'post' and v_event = 'deleted' then
      update social.posts set deleted_at = greatest(v_at, created_at) where id = v_id and deleted_at is null;
      get diagnostics v_n = row_count;
      v_content := v_content + v_n;
    elsif v_kind = 'comment' and v_event = 'deleted' then
      update social.comments set deleted_at = greatest(v_at, created_at) where id = v_id and deleted_at is null;
      get diagnostics v_n = row_count;
      v_content := v_content + v_n;
    elsif v_kind = 'post' then
      update social.posts set deleted_at = null, hidden_at = null where id = v_id and deleted_at is not null;
      get diagnostics v_n = row_count;
      v_restored := v_restored + v_n;
    elsif v_kind = 'comment' then
      update social.comments set deleted_at = null, hidden_at = null where id = v_id and deleted_at is not null;
      get diagnostics v_n = row_count;
      v_restored := v_restored + v_n;
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('accounts_deleted', v_accounts, 'content_deleted', v_content,
                                       'content_restored', v_restored, 'skipped', v_skipped);
end;
$$;
revoke all on function ops.reapply_deletions(jsonb, timestamptz) from public, anon, authenticated, service_role;

do $$
declare
  f text;
begin
  foreach f in array array['public.svc_deletion_register_unreported(integer)', 'public.svc_deletion_register_reported(bigint[])'] loop
    execute pg_catalog.format('revoke all on function %s from public, anon, authenticated', f);
    execute pg_catalog.format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;

comment on function public.svc_deletion_register_unreported(integer) is 'Service only: deletion register rows not yet written to the Edge Function log, oldest first.';
comment on function public.svc_deletion_register_reported(bigint[]) is 'Service only: marks deletion register rows reported, and removes reported rows older than 30 days.';
comment on function ops.reapply_deletions(jsonb, timestamptz) is 'Recovery only (founder, SQL editor): re-applies logged deletions and restores that happened after the backup.';
