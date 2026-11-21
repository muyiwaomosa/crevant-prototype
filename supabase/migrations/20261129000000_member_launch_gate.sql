-- The member launch gate (Phase 1B-1): founder-only membership until
-- external access is separately approved, enforced by the database.
--
-- ops.member_launch_settings (one row):
--   * external_access_approved: false until ops.set_external_access opens it
--     (the exact phrase APPROVE EXTERNAL MEMBER ACCESS; recorded). Nothing
--     here opens it: not this migration, on any database.
--   * founder_user_id: the one account that may hold the founder cohort.
--     Set here only if exactly one account has an active founder-cohort
--     membership; otherwise left empty (fail closed), and then set once with
--     ops.set_launch_founder (the exact phrase SET THE LAUNCH FOUNDER;
--     recorded).
--
-- A trigger on ops.member_access refuses, for EVERY role and path
-- (ops.grant_member_access, direct writes by service_role or postgres), any
-- write that would GIVE or WIDEN active membership:
--   * to anyone but founder_user_id while external access is not approved;
--   * the founder cohort to anyone but founder_user_id, ever.
-- "Give or widen": a new active row; making a revoked row active; changing
-- the cohort of an active row; or extending its expiry. Writes that keep or
-- narrow access (revoking, shortening, unrelated updates) always pass, so
-- existing authorized access is never disrupted, even when the founder is
-- unknown.
--
-- Bypasses that remain (documented in docs/MEMBER-PRODUCTION.md): the table
-- owner (postgres) can disable the trigger (caught by supabase/tests/014 and
-- the member checks); postgres can also skip triggers with
-- session_replication_role = replica, which Supabase allows it to set
-- (membership given that way is caught by the member Production check);
-- and migrations can replace it (reviewed and checksummed).

create table ops.member_launch_settings (
  id                        boolean primary key default true check (id),
  external_access_approved  boolean not null default false,
  founder_user_id           uuid references auth.users (id) on delete set null,
  updated_at                timestamptz not null default pg_catalog.now(),
  updated_by                text not null check (char_length(updated_by) between 1 and 100 and strpos(updated_by, '@') = 0)
);
comment on table ops.member_launch_settings is 'The member launch gate: whether external (non-founder) membership may be granted, and the one founder account. Changed only through ops.set_external_access and ops.set_launch_founder.';

create table ops.member_launch_events (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default pg_catalog.now(),
  actor       text not null check (char_length(actor) between 1 and 100 and strpos(actor, '@') = 0),
  action      text not null check (action in ('founder_set_by_migration', 'founder_not_set_by_migration', 'founder_set', 'external_access_opened', 'external_access_closed')),
  detail      text check (detail is null or char_length(detail) <= 300)
);
comment on table ops.member_launch_events is 'Every change to the member launch gate (append only).';
create trigger member_launch_events_no_update
before update or delete on ops.member_launch_events
for each row execute function ops.history_append_only();

alter table ops.member_launch_settings enable row level security;
alter table ops.member_launch_events enable row level security;
revoke all on table ops.member_launch_settings, ops.member_launch_events from public, anon, authenticated, service_role;
grant select on table ops.member_launch_settings, ops.member_launch_events to service_role;

-- The founder: only an unambiguous one.
do $$
declare
  v_count int;
  v_founder uuid;
begin
  select count(*), min(a.user_id::text)::uuid into v_count, v_founder
  from ops.member_access a
  where a.cohort = 'founder' and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now());
  if v_count = 1 then
    insert into ops.member_launch_settings (founder_user_id, updated_by) values (v_founder, 'migration');
    insert into ops.member_launch_events (actor, action, detail) values ('migration', 'founder_set_by_migration', 'exactly one active founder-cohort account');
  else
    insert into ops.member_launch_settings (founder_user_id, updated_by) values (null, 'migration');
    insert into ops.member_launch_events (actor, action, detail)
    values ('migration', 'founder_not_set_by_migration', pg_catalog.format('%s active founder-cohort accounts; set it with ops.set_launch_founder', v_count));
  end if;
end $$;

-- The gate.
create function ops.member_launch_gate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s ops.member_launch_settings;
  widens boolean;
begin
  if new.status <> 'active' then
    return new;
  end if;
  widens := tg_op = 'INSERT'
    or old.status <> 'active'
    or old.user_id is distinct from new.user_id
    or old.cohort is distinct from new.cohort
    or (old.expires_at is not null and (new.expires_at is null or new.expires_at > old.expires_at));
  if not widens then
    return new;
  end if;
  select * into s from ops.member_launch_settings where id;
  if s.id is null then
    raise exception 'member_launch_gate: the launch settings are missing, so no membership can be given' using errcode = 'check_violation';
  end if;
  if new.cohort = 'founder' and (s.founder_user_id is null or new.user_id <> s.founder_user_id) then
    raise exception 'member_launch_gate: only the launch founder may hold the founder cohort' using errcode = 'check_violation';
  end if;
  if not s.external_access_approved and (s.founder_user_id is null or new.user_id <> s.founder_user_id) then
    raise exception 'member_launch_gate: external member access is not approved, so only the launch founder may be given membership' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke all on function ops.member_launch_gate() from public, anon, authenticated;

create trigger member_access_launch_gate
before insert or update on ops.member_access
for each row execute function ops.member_launch_gate();

-- Server only, recorded. Opening needs the exact phrase; closing needs none and revokes nobody.
create function ops.set_external_access(p_actor text, p_approved boolean, p_confirm text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from boolean;
begin
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 then
    raise exception 'launch gate refused: give an actor label (not an email address)';
  end if;
  if p_approved is null then
    raise exception 'launch gate refused: choose true or false';
  end if;
  if p_approved and p_confirm is distinct from 'APPROVE EXTERNAL MEMBER ACCESS' then
    raise exception 'launch gate refused: opening external member access needs the exact phrase APPROVE EXTERNAL MEMBER ACCESS';
  end if;
  select external_access_approved into v_from from ops.member_launch_settings where id for update;
  if v_from = p_approved then
    return;
  end if;
  update ops.member_launch_settings set external_access_approved = p_approved, updated_at = pg_catalog.now(), updated_by = p_actor where id;
  insert into ops.member_launch_events (actor, action) values (p_actor, case when p_approved then 'external_access_opened' else 'external_access_closed' end);
end;
$$;
revoke all on function ops.set_external_access(text, boolean, text) from public, anon, authenticated;
grant execute on function ops.set_external_access(text, boolean, text) to service_role;

-- Server only, once, recorded: only while no founder is set.
create function ops.set_launch_founder(p_actor text, p_user uuid, p_confirm text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 then
    raise exception 'launch founder refused: give an actor label (not an email address)';
  end if;
  if p_confirm is distinct from 'SET THE LAUNCH FOUNDER' then
    raise exception 'launch founder refused: this needs the exact phrase SET THE LAUNCH FOUNDER';
  end if;
  if p_user is null or not exists (select 1 from auth.users u where u.id = p_user) then
    raise exception 'launch founder refused: no such account';
  end if;
  perform 1 from ops.member_launch_settings where id for update;
  if (select founder_user_id from ops.member_launch_settings where id) is not null then
    raise exception 'launch founder refused: a launch founder is already set';
  end if;
  update ops.member_launch_settings set founder_user_id = p_user, updated_at = pg_catalog.now(), updated_by = p_actor where id;
  insert into ops.member_launch_events (actor, action) values (p_actor, 'founder_set');
end;
$$;
revoke all on function ops.set_launch_founder(text, uuid, text) from public, anon, authenticated;
grant execute on function ops.set_launch_founder(text, uuid, text) to service_role;
