-- IP-3 governance refinements (founder decisions of November 25, 2026).
-- Review guide: docs/GOVERNANCE.md.
--
-- 1. Restoring legitimate rewards. When a moderator restores hidden content,
--    or an appeal reverses the hide, the Connection Points the hide took
--    back are restored with compensating ledger entries (one per reversal,
--    keyed restored:<reversal key>, so never twice). Nothing historical is
--    edited. Only reversals caused by the hide are restored, so points
--    reversed for any other reason stay reversed. Moderation only ever
--    reverses recognized (non-redeemable) points, so no redeemable balance
--    and no closed settlement is touched; a restore is dated now, in the
--    open period. Hiding the same content again takes the restored points
--    back again.
-- 2. The sole-moderator appeal exception. A moderator may decide an appeal
--    on their own action only when no other eligible moderator (an active
--    pilot member, not the appellant) exists. The exception ends by itself
--    the moment one does. When it is used, the moderator must record a
--    reason, the decision is marked on the appeal and in the audit trail
--    ("Sole moderator, conflict of interest disclosed"), and the member's
--    notice says the same moderator reviewed it.
-- 3. Immediate enforcement for serious violations. Beyond threats,
--    self-harm and hate (which already skip the ladder), a moderator may
--    mark any step immediate for a serious violation, with a required
--    justification that is recorded on the enforcement and in the audit
--    trail.

alter table ops.enforcements add column immediate boolean not null default false;
comment on column ops.enforcements.immediate is 'Taken at once for a serious violation (skipping the ladder), with the justification in note.';
alter table ops.appeals add column same_moderator boolean not null default false;
comment on column ops.appeals.same_moderator is 'Decided by the moderator who took the original action, because no other eligible moderator existed (conflict of interest disclosed).';
alter table ops.member_notices add column same_moderator boolean not null default false;

-- Whether another eligible moderator exists: an active pilot member with a
-- moderator row, other than the caller and the appellant.
create function ops.other_moderator_available(p_me uuid, p_appellant uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from ops.moderators o
    join ops.member_access a on a.user_id = o.user_id
    where o.user_id <> p_me and o.user_id <> p_appellant
      and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now()));
$$;
revoke all on function ops.other_moderator_available(uuid, uuid) from public, anon, authenticated;

-- Restores the points a hide took back from a post or comment: one
-- compensating entry per hide reversal, never twice (the source key).
create function sim.restore_hidden(p_target_type text, p_target_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r sim.points_ledger%rowtype;
  n integer := 0;
begin
  if p_target_type not in ('post', 'comment') or p_target_id is null then
    return 0;
  end if;
  -- Only content that is live again (restored by a moderator or an appeal):
  -- never content its author deleted, or that is still hidden.
  if (p_target_type = 'post' and not exists (select 1 from social.posts s where s.id = p_target_id and s.deleted_at is null))
     or (p_target_type = 'comment' and not exists (select 1 from social.comments c where c.id = p_target_id and c.deleted_at is null)) then
    return 0;
  end if;
  for r in
    select l.* from sim.points_ledger l
    where l.reverses is not null and l.points < 0 and not l.redeemable and l.status = 'reversal'
      and case when p_target_type = 'post'
               then l.post_id = p_target_id and l.source_key like 'hidden:%'
               else l.source_key = 'comment-deleted:' || p_target_id::text
                    or (l.source_key like 'hidden:restored:%' and l.source_key like '%comment-deleted:' || p_target_id::text)
          end
  loop
    insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, post_id)
    values (r.member_id, r.action, -r.points, false, 'recognized', r.rule_version, 'restored:' || r.source_key, r.creator_id, r.post_id)
    on conflict (source_key) do nothing;
    if found then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;
revoke all on function sim.restore_hidden(text, uuid) from public, anon, authenticated;

create or replace function public.app_mod_hide(p_report uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  r record;
  v_action bigint;
  v_key text;
begin
  select * into r from ops.content_reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.target_type = 'post' then
    update social.posts set hidden_at = pg_catalog.now(), deleted_at = pg_catalog.now()
    where id = r.target_id and deleted_at is null;
    if not found then
      raise exception 'not_live' using errcode = 'P0001', detail = 'This post is already hidden or deleted.';
    end if;
    -- Points earned on the hidden post are reversed (a restore does not re-award).
    for v_key in select l.source_key from sim.points_ledger l
                 where l.post_id = r.target_id and l.reverses is null and l.action <> 'qualified_referral'
    loop
      perform sim.reverse(v_key, 'hidden:' || v_key);
    end loop;
  elsif r.target_type = 'comment' then
    -- Hiding sets deleted_at, so the rewards trigger reverses the comment's points.
    update social.comments set hidden_at = pg_catalog.now(), deleted_at = pg_catalog.now()
    where id = r.target_id and deleted_at is null;
    if not found then
      raise exception 'not_live' using errcode = 'P0001', detail = 'This comment is already hidden or deleted.';
    end if;
    -- Points restored after an earlier hide are taken back again (20261207000000).
    for v_key in select l.source_key from sim.points_ledger l
                 where l.reverses is null and l.points > 0 and l.source_key like 'restored:%'
                   and l.source_key like '%comment-deleted:' || r.target_id::text
    loop
      perform sim.reverse(v_key, 'hidden:' || v_key);
    end loop;
  else
    if not exists (select 1 from public.profiles where id = r.target_id) then
      raise exception 'not_live' using errcode = 'P0001';
    end if;
    -- A member with no details yet gets an empty, hidden row (setup marked
    -- done, so hiding never sends them back through first-time setup).
    insert into social.profile_details as d (user_id, hidden_at, onboarded_at) values (r.target_id, pg_catalog.now(), pg_catalog.now())
    on conflict (user_id) do update set hidden_at = pg_catalog.now() where d.hidden_at is null;
    if not found then
      raise exception 'not_live' using errcode = 'P0001', detail = 'This profile is already hidden.';
    end if;
  end if;
  update ops.content_reports set status = 'hidden', resolved_at = pg_catalog.now()
  where target_type = r.target_type and target_id = r.target_id and status = 'open';
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'hide', r.target_type, r.target_id, r.id, v_note)
  returning id into v_action;
  perform ops.notify_member(r.target_owner_id, 'content_hidden', r.target_type, r.target_id, r.reason,
                            coalesce(r.snapshot->>'body', r.snapshot->>'bio', r.snapshot->>'display_name'), v_action, null, null);
end;
$$;

create or replace function public.app_mod_restore(p_report uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  r record;
  v_action bigint;
begin
  select * into r from ops.content_reports where id = p_report for update;
  if r.id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if r.target_type = 'post' then
    update social.posts set hidden_at = null, deleted_at = null
    where id = r.target_id and hidden_at is not null and deleted_at = hidden_at;
  elsif r.target_type = 'comment' then
    update social.comments set hidden_at = null, deleted_at = null
    where id = r.target_id and hidden_at is not null and deleted_at = hidden_at;
  else
    update social.profile_details set hidden_at = null where user_id = r.target_id and hidden_at is not null;
  end if;
  if not found then
    raise exception 'not_hidden' using errcode = 'P0001', detail = 'This content is not hidden by a moderator.';
  end if;
  update ops.content_reports set status = 'restored', resolved_at = coalesce(resolved_at, pg_catalog.now())
  where target_type = r.target_type and target_id = r.target_id and status in ('open', 'hidden');
  perform sim.restore_hidden(r.target_type, r.target_id);
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'restore', r.target_type, r.target_id, r.id, v_note)
  returning id into v_action;
  perform ops.notify_member(r.target_owner_id, 'content_restored', r.target_type, r.target_id, r.reason,
                            coalesce(r.snapshot->>'body', r.snapshot->>'bio', r.snapshot->>'display_name'), v_action, null, null);
end;
$$;

drop function public.app_mod_enforce(uuid, text, text, uuid, integer, text);
create function public.app_mod_enforce(p_member uuid, p_level text, p_reason text, p_report uuid default null,
                                       p_days integer default null, p_note text default null, p_immediate boolean default false)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  v_ends timestamptz;
  v_id bigint;
  v_action bigint;
begin
  if p_member is null or p_level is null or p_level not in ('warning', 'restriction', 'suspension') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_member = v_uid then
    raise exception 'cannot_enforce_self' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('spam', 'harassment', 'hate', 'sexual', 'violence', 'self_harm', 'impersonation', 'other') then
    raise exception 'invalid_reason' using errcode = 'P0001', detail = 'Choose a reason from the list.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_member) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_report is not null and not exists (select 1 from ops.content_reports r where r.id = p_report and r.target_owner_id = p_member) then
    raise exception 'not_found' using errcode = 'P0001', detail = 'That report is not about this member.';
  end if;
  if p_level = 'warning' then
    if p_days is not null then
      raise exception 'invalid_request' using errcode = 'P0001', detail = 'A warning has no duration.';
    end if;
  elsif p_level = 'restriction' then
    if coalesce(p_days, 7) not between 1 and 30 then
      raise exception 'invalid_request' using errcode = 'P0001', detail = 'A restriction lasts 1 to 30 days.';
    end if;
    v_ends := pg_catalog.now() + pg_catalog.make_interval(days => coalesce(p_days, 7));
  else
    if p_days is not null and p_days not between 1 and 90 then
      raise exception 'invalid_request' using errcode = 'P0001', detail = 'A suspension lasts 1 to 90 days, or until lifted.';
    end if;
    v_ends := case when p_days is not null then pg_catalog.now() + pg_catalog.make_interval(days => p_days) end;
  end if;
  -- Immediate action for a serious violation needs a recorded justification.
  if coalesce(p_immediate, false) and v_note is null then
    raise exception 'note_required' using errcode = 'P0001', detail = 'Say why this needs immediate action.';
  end if;
  -- The ladder: each step needs the one before it within 180 days, except
  -- threats, self-harm and hate, and serious violations a moderator marks immediate.
  if not coalesce(p_immediate, false) and p_reason not in ('violence', 'self_harm', 'hate') and p_level <> 'warning'
     and not exists (select 1 from ops.enforcements e
                     where e.member_id = p_member and e.created_at > pg_catalog.now() - interval '180 days'
                       and e.level = case p_level when 'restriction' then 'warning' else 'restriction' end
                       and not exists (select 1 from ops.enforcement_lifts l where l.enforcement_id = e.id and l.via = 'appeal')) then
    raise exception 'ladder_step_required' using errcode = 'P0001',
      detail = case p_level when 'restriction' then 'Give a warning first.' else 'A restriction comes first.' end;
  end if;
  insert into ops.enforcements (member_id, level, reason, report_id, note, ends_at, actor_id, immediate)
  values (p_member, p_level, p_reason, p_report, v_note, v_ends, v_uid, coalesce(p_immediate, false))
  returning id into v_id;
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, report_id, note)
  values (v_uid, 'moderator', 'enforce', 'member', p_member, p_report,
          p_level || case when coalesce(p_immediate, false) then ' (immediate)' else '' end || coalesce(': ' || v_note, ''))
  returning id into v_action;
  perform ops.notify_member(p_member, p_level, null, null, p_reason, null, v_action, v_id, v_ends);
  return v_id;
end;
$$;

comment on function public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean) is 'Moderators only: a warning, restriction (1 to 30 days) or suspension (1 to 90 days or until lifted), one step at a time except for threats, self-harm and hate, or a serious violation marked immediate with a recorded justification. The member is notified.';
revoke all on function public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean) from public, anon;
grant execute on function public.app_mod_enforce(uuid, text, text, uuid, integer, text, boolean) to authenticated;

drop function public.app_my_notices();
create function public.app_my_notices()
returns table (
  id bigint, kind text, target_type text, target_id uuid, reason text, excerpt text, ends_at timestamptz,
  created_at timestamptz, read boolean, appeal_status text, can_appeal boolean, same_moderator boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select n.id, n.kind, n.target_type, n.target_id, n.reason, n.excerpt, n.ends_at, n.created_at, n.read_at is not null,
         a.status,
         a.id is null and n.kind in ('content_hidden', 'warning', 'restriction', 'suspension')
           and n.created_at > pg_catalog.now() - interval '30 days',
         n.same_moderator
  from ops.member_notices n
  left join ops.appeals a on a.notice_id = n.id
  where n.member_id = v_uid
  order by n.created_at desc, n.id desc
  limit 100;
end;
$$;

comment on function public.app_my_notices() is 'The caller''s own moderation notices, newest first, with whether each can still be appealed and whether an appeal was reviewed by the same moderator. Never names a reporter.';
revoke all on function public.app_my_notices() from public, anon;
grant execute on function public.app_my_notices() to authenticated;

drop function public.app_mod_appeals(text);
create function public.app_mod_appeals(p_status text default 'open')
returns table (
  id uuid, member_id uuid, member_username text, kind text, target_type text, target_id uuid, reason text, excerpt text,
  body text, status text, created_at timestamptz, decided_at timestamptz, decision_note text, decided_original boolean,
  another_moderator_available boolean, same_moderator boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
begin
  return query
  select a.id, a.member_id, p.username, n.kind, n.target_type, n.target_id, n.reason, n.excerpt,
         a.body, a.status, a.created_at, a.decided_at, a.decision_note,
         coalesce((select m.actor_id = v_uid from ops.moderation_actions m where m.id = n.moderation_action_id), false),
         ops.other_moderator_available(v_uid, a.member_id),
         a.same_moderator
  from ops.appeals a
  join ops.member_notices n on n.id = a.notice_id
  left join public.profiles p on p.id = a.member_id
  where case when coalesce(p_status, 'open') = 'open' then a.status = 'open' else a.status <> 'open' end
  order by a.created_at, a.id
  limit 100;
end;
$$;

comment on function public.app_mod_appeals(text) is 'Moderators only: appeals, oldest first, whether the caller took the original action, whether another eligible moderator is available, and whether the sole-moderator exception was used.';
revoke all on function public.app_mod_appeals(text) from public, anon;
grant execute on function public.app_mod_appeals(text) to authenticated;

create or replace function public.app_mod_decide_appeal(p_appeal uuid, p_reverse boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_moderator();
  v_note text := ops.clean_note(p_note);
  a ops.appeals%rowtype;
  n ops.member_notices%rowtype;
  v_original uuid;
  v_action bigint;
  v_same boolean;
begin
  if p_reverse is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select * into a from ops.appeals where id = p_appeal for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if a.status <> 'open' then
    raise exception 'not_open' using errcode = 'P0001', detail = 'This appeal was already decided.';
  end if;
  if a.member_id = v_uid then
    raise exception 'cannot_decide_own_appeal' using errcode = 'P0001';
  end if;
  select * into n from ops.member_notices where id = a.notice_id;
  select m.actor_id into v_original from ops.moderation_actions m where m.id = n.moderation_action_id;
  -- Independence: a different moderator decides whenever one is eligible
  -- (an active pilot member, not the appellant). Only when none is may the
  -- moderator who acted decide, with the conflict disclosed, a recorded
  -- reason, and the member told (20261207000000).
  v_same := v_original is not null and v_original = v_uid;
  if v_same and ops.other_moderator_available(v_uid, a.member_id) then
    raise exception 'needs_another_moderator' using errcode = 'P0001', detail = 'Another moderator decides appeals on your own actions.';
  end if;
  if v_same and v_note is null then
    raise exception 'note_required' using errcode = 'P0001', detail = 'Record why you are deciding an appeal on your own action.';
  end if;
  if p_reverse then
    if n.kind = 'content_hidden' then
      if n.target_type = 'post' then
        update social.posts set hidden_at = null, deleted_at = null
        where id = n.target_id and hidden_at is not null and deleted_at = hidden_at;
      elsif n.target_type = 'comment' then
        update social.comments set hidden_at = null, deleted_at = null
        where id = n.target_id and hidden_at is not null and deleted_at = hidden_at;
      else
        update social.profile_details set hidden_at = null where user_id = n.target_id and hidden_at is not null;
      end if;
      update ops.content_reports set status = 'restored', resolved_at = coalesce(resolved_at, pg_catalog.now())
      where target_type = n.target_type and target_id = n.target_id and status in ('open', 'hidden');
      -- Legitimate points the hide took back come back (compensating entries).
      perform sim.restore_hidden(n.target_type, n.target_id);
    elsif n.enforcement_id is not null then
      insert into ops.enforcement_lifts (enforcement_id, actor_id, via, note)
      values (n.enforcement_id, v_uid, 'appeal', v_note)
      on conflict (enforcement_id) do nothing;
    end if;
  end if;
  update ops.appeals set status = case when p_reverse then 'reversed' else 'upheld' end,
         decided_at = pg_catalog.now(), decided_by = v_uid, decision_note = v_note, same_moderator = v_same
  where id = a.id;
  insert into ops.moderation_actions (actor_id, actor_label, action, target_type, target_id, note)
  values (v_uid, 'moderator', case when p_reverse then 'appeal_reversed' else 'appeal_upheld' end,
          coalesce(n.target_type, 'member'), coalesce(n.target_id, a.member_id),
          case when v_same then 'Sole moderator, conflict of interest disclosed: ' else '' end || v_note)
  returning id into v_action;
  insert into ops.member_notices (member_id, kind, target_type, target_id, reason, excerpt, moderation_action_id, enforcement_id, same_moderator)
  values (a.member_id, case when p_reverse then 'appeal_reversed' else 'appeal_upheld' end,
          n.target_type, n.target_id, n.reason, n.excerpt, v_action, n.enforcement_id, v_same);
end;
$$;

comment on function public.app_mod_decide_appeal(uuid, boolean, text) is 'Moderators only: upholds or reverses an appeal (reversing restores the content, its legitimate points, or lifts the enforcement). Another eligible moderator decides appeals on your own actions; only when none exists may you, with a recorded reason and the conflict disclosed. The member is notified.';
