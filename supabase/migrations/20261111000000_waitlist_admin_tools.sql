-- Phase 2, B3: waitlist management tools for the restricted waitlist_admin
-- login. No new roles, schemas, tables or credentials: only new entry points
-- in waitlist_api, each callable by waitlist_admin alone, in the same style
-- as B2 (security definer, fixed empty search path, fully qualified names).
--
--   admin_summary        replaced: adds recent signup counts and wave counts
--   admin_wave_preview   how many entries could be picked, by group
--   admin_wave_select    pick up to N entries for a wave, by approved group,
--                        with approved reasons; marks them shortlisted
--   admin_wave_summary   counts for one wave, by group, reason, verification
--   admin_wave_clear     undo a wave's selections
--
-- Every function returns counts only, never an address, name or id list.
-- Only VERIFIED entries can enter a wave: the wave functions pick verified
-- entries only, and the selections table itself refuses an unverified entry
-- (trigger below), whoever writes it. Unverified entries still appear in the
-- summary counts. Picking someone for a wave is NOT inviting them: nothing
-- here sends anything or creates an account.

-- ---------------------------------------------------------------------------
-- Overview: B2's summary plus signups in the last day and week, and how many
-- people each wave holds. Still counts only.

create or replace function waitlist_api.admin_summary()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total',       (select count(*) from ops.waitlist),
    'unverified',  (select count(*) from ops.waitlist where not verified),
    'verified',    (select count(*) from ops.waitlist where verified),
    'joined_last_24_hours', (select count(*) from ops.waitlist where joined_at > now() - interval '24 hours'),
    'joined_last_7_days',   (select count(*) from ops.waitlist where joined_at > now() - interval '7 days'),
    'by_source',   coalesce((select jsonb_object_agg(source, people) from (
                     select source, sum(people) as people from ops.waitlist_summary group by source) s), '{}'::jsonb),
    'shares_content', coalesce((select jsonb_object_agg(shares_content, people) from (
                     select shares_content, sum(people) as people from ops.waitlist_summary group by shares_content) s), '{}'::jsonb),
    -- Overlapping groups, so these can add up to more than the total.
    'participant_groups', jsonb_build_object(
      'active_creator',   (select count(*) from ops.waitlist where 'active_creator' = any (participant_groups)),
      'aspiring_creator', (select count(*) from ops.waitlist where 'aspiring_creator' = any (participant_groups)),
      'supporter',        (select count(*) from ops.waitlist where 'supporter' = any (participant_groups)),
      'none_answered',    (select count(*) from ops.waitlist where cardinality(participant_groups) = 0)
    ),
    'status', coalesce((select jsonb_object_agg(status, n) from (
                select status, count(*) as n from ops.waitlist group by status) s), '{}'::jsonb),
    'waves', coalesce((select jsonb_object_agg(wave, n) from (
               select wave, count(*) as n from ops.waitlist_selections group by wave) s), '{}'::jsonb),
    'submissions', case when (select enabled from ops.settings where key = 'waitlist_submissions') then 'ON' else 'OFF' end,
    'notice_version', (select value from ops.settings where key = 'waitlist_notice_version')
  );
$$;

-- ---------------------------------------------------------------------------
-- Invitation-wave preparation.
--
-- An entry is eligible for a new wave when it is VERIFIED and its status is
-- 'new' (not already shortlisted, invited or not selected). p_group is one of
-- the approved participant groups, or 'any'.

-- Defence in depth: the selections table refuses unverified entries, so no
-- path (these functions, server code, the dashboard) can put one in a wave.
create function ops.waitlist_selections_require_verified()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from ops.waitlist w where w.id = new.waitlist_id and w.verified) then
    raise exception 'only verified waitlist entries can be selected for an invitation wave'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger waitlist_selections_require_verified
  before insert or update of waitlist_id on ops.waitlist_selections
  for each row execute function ops.waitlist_selections_require_verified();

revoke all on function ops.waitlist_selections_require_verified() from public, anon, authenticated;

create function waitlist_api.admin_wave_preview(p_group text default 'any')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_group is null or p_group not in ('any', 'active_creator', 'aspiring_creator', 'supporter') then
    raise exception 'group must be any, active_creator, aspiring_creator or supporter';
  end if;
  return (
    select jsonb_build_object(
      'group', p_group,
      -- Verified and new: can be picked.
      'eligible', count(*) filter (where w.verified),
      -- Shown for information only: unverified entries are never picked.
      'not_eligible_unverified', count(*) filter (where not w.verified)
    )
    from ops.waitlist w
    where w.status = 'new'
      and (p_group = 'any' or p_group = any (w.participant_groups))
  );
end;
$$;

-- Picks up to p_count eligible (verified, new) entries, earliest signups
-- first, records the approved reasons for this wave and marks them
-- shortlisted. Returns counts.
create function waitlist_api.admin_wave_select(
  p_wave          text,
  p_group         text,
  p_reasons       text[],
  p_count         integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selected   integer;
begin
  if p_group is null or p_group not in ('any', 'active_creator', 'aspiring_creator', 'supporter') then
    raise exception 'group must be any, active_creator, aspiring_creator or supporter';
  end if;
  if p_count is null or p_count < 1 or p_count > 100 then
    raise exception 'count must be a whole number from 1 to 100';
  end if;
  -- Checked here as well as by the table, so a bad request is refused even
  -- when there is nobody left to pick.
  if p_wave is null or p_wave !~ '^[a-z0-9_-]{1,40}$' then
    raise exception 'wave must be 1 to 40 lowercase letters, digits, _ or -';
  end if;
  if p_reasons is null or cardinality(p_reasons) not between 1 and 2
     or not (p_reasons <@ array['group_balance', 'targeted_feedback']::text[]) then
    raise exception 'reasons must be group_balance, targeted_feedback or both';
  end if;

  with picked as (
    select w.id, w.verified
    from ops.waitlist w
    where w.status = 'new'
      and w.verified
      and (p_group = 'any' or p_group = any (w.participant_groups))
    order by w.joined_at, w.id
    limit p_count
    for update
  ), recorded as (
    insert into ops.waitlist_selections (waitlist_id, wave, reasons)
    select id, p_wave, p_reasons from picked
    returning waitlist_id
  ), marked as (
    update ops.waitlist w set status = 'shortlisted'
    from recorded r where w.id = r.waitlist_id
    returning w.id
  )
  select count(*) into v_selected from marked;

  return jsonb_build_object('wave', p_wave, 'group', p_group, 'reasons', to_jsonb(p_reasons), 'selected', v_selected);
end;
$$;

create function waitlist_api.admin_wave_summary(p_wave text)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'wave', p_wave,
    'selected',   count(*),
    'participant_groups', jsonb_build_object(
      'active_creator',   count(*) filter (where 'active_creator' = any (w.participant_groups)),
      'aspiring_creator', count(*) filter (where 'aspiring_creator' = any (w.participant_groups)),
      'supporter',        count(*) filter (where 'supporter' = any (w.participant_groups)),
      'none_answered',    count(*) filter (where cardinality(w.participant_groups) = 0)
    ),
    'reasons', jsonb_build_object(
      'group_balance',     count(*) filter (where 'group_balance' = any (s.reasons)),
      'targeted_feedback', count(*) filter (where 'targeted_feedback' = any (s.reasons))
    ),
    'invited', count(*) filter (where w.status = 'invited')
  )
  from ops.waitlist_selections s
  join ops.waitlist w on w.id = s.waitlist_id
  where s.wave = p_wave;
$$;

-- Undoes a wave: removes its selections, and puts entries that are no longer
-- in any wave back to 'new'. Entries already invited are left alone.
create function waitlist_api.admin_wave_clear(p_wave text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cleared integer;
begin
  with removed as (
    delete from ops.waitlist_selections s
    using ops.waitlist w
    where s.wave = p_wave and w.id = s.waitlist_id and w.status <> 'invited'
    returning s.waitlist_id
  ), reset as (
    update ops.waitlist w set status = 'new'
    from removed r
    where w.id = r.waitlist_id and w.status = 'shortlisted'
      and not exists (select 1 from ops.waitlist_selections o where o.waitlist_id = w.id and o.wave <> p_wave)
    returning w.id
  )
  select count(*) into v_cleared from removed;
  return jsonb_build_object('wave', p_wave, 'cleared', v_cleared);
end;
$$;

revoke all on function waitlist_api.admin_wave_preview(text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_wave_select(text, text, text[], integer) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_wave_summary(text) from public, anon, authenticated, service_role;
revoke all on function waitlist_api.admin_wave_clear(text) from public, anon, authenticated, service_role;

grant execute on function waitlist_api.admin_wave_preview(text) to waitlist_admin;
grant execute on function waitlist_api.admin_wave_select(text, text, text[], integer) to waitlist_admin;
grant execute on function waitlist_api.admin_wave_summary(text) to waitlist_admin;
grant execute on function waitlist_api.admin_wave_clear(text) to waitlist_admin;
