-- IP-6 Contributions and rewards (SP-TA-001 v2, WP-05; founder decisions D6
-- and November 25, 2026). Review guide: docs/REWARDS.md.
--
-- Everything here is SIMULATED during the pilot: no money is collected, held
-- or paid, and nothing here is a balance anyone can withdraw. It lives in the
-- sim schema (illustrative, never payable), apart from intent and finance.
--
-- 1. Connection Points (RWD-01, RWD-02, RWD-05). One append-only ledger per
--    platform (one balance per member), awarded only by the server from the
--    versioned point table (D6): meaningful comment 2, save 2, repost 5,
--    external share 5, qualified referral 100; follow, Clique, like and
--    advertising 0 (nothing is awarded for consuming ads). Only qualified
--    referrals are redeemable (financially eligible, simulated); the rest
--    are recognized.
-- 2. Integrity (RWD-12, RWD-06). One award per source (dedup key), never for
--    your own content, daily caps per action, a monthly budget for
--    redeemable points and a pause switch. A deleted comment reverses its
--    points with a reversal entry; nothing is ever edited or removed.
-- 3. Qualified referrals (RWD-04, GOV-C07). A new member who joined through
--    someone's referral link (adult confirmed, verified email) and then
--    makes their own first intentional follow. Never self, never twice;
--    the first eligible referrer wins (registration is first touch). Held
--    for the founder's review before they count as redeemable.
-- 4. Simulated pool and valuation (RWD-07, RWD-08). Simulated net revenue
--    entries: content-associated advertising splits 40% creator, 20% fan
--    rewards pool, 40% Splitpost; general feed advertising is 100%
--    Splitpost. The value of a redeemable point is the pool divided by the
--    approved redeemable points outstanding.
-- 5. Simulated month close (RWD-09, GOV-C08): allocates the pool to approved
--    redeemable points, records the lines, and refuses to close unless the
--    lines reconcile to the pool to the cent.

-- ---------------------------------------------------------------------------
-- Rules, settings, ledger

create table sim.point_rules (
  version     text not null check (version ~ '^[a-z0-9][a-z0-9._-]{0,31}$'),
  action      text not null check (action in ('meaningful_comment', 'save', 'repost', 'external_share', 'qualified_referral',
                                              'follow', 'clique', 'like', 'ad_view')),
  points      integer not null check (points >= 0),
  redeemable  boolean not null,
  daily_cap   integer check (daily_cap is null or daily_cap > 0),
  primary key (version, action)
);
comment on table sim.point_rules is 'The approved point table (D6), versioned. Every ledger entry names the version it was awarded under.';
insert into sim.point_rules (version, action, points, redeemable, daily_cap) values
  ('d6-v1', 'meaningful_comment', 2,   false, 20),
  ('d6-v1', 'save',               2,   false, 20),
  ('d6-v1', 'repost',             5,   false, 10),
  ('d6-v1', 'external_share',     5,   false, 10),
  ('d6-v1', 'qualified_referral', 100, true,  5),
  ('d6-v1', 'follow',             0,   false, null),
  ('d6-v1', 'clique',             0,   false, null),
  ('d6-v1', 'like',               0,   false, null),
  ('d6-v1', 'ad_view',            0,   false, null);

create table sim.reward_settings (
  id                      boolean primary key default true check (id),
  rule_version            text not null default 'd6-v1',
  paused                  boolean not null default false,
  monthly_redeemable_cap  integer not null default 20000 check (monthly_redeemable_cap >= 0),
  updated_at              timestamptz not null default pg_catalog.now(),
  updated_by              text not null default 'migration'
);
comment on table sim.reward_settings is 'Issuance controls: the active rule version, a pause switch and the monthly budget of redeemable points (simulated).';
insert into sim.reward_settings (id) values (true);

create table sim.points_ledger (
  id           bigint generated always as identity primary key,
  member_id    uuid references auth.users (id) on delete cascade,
  action       text not null,
  points       integer not null,
  redeemable   boolean not null,
  status       text not null check (status in ('recognized', 'pending_review', 'approved', 'rejected', 'reversal', 'settled')),
  rule_version text not null,
  source_key   text not null unique,
  creator_id   uuid references auth.users (id) on delete set null,
  post_id      uuid,
  reverses     bigint references sim.points_ledger (id),
  settlement_id bigint,
  created_at   timestamptz not null default pg_catalog.now()
);
comment on table sim.points_ledger is 'Connection Points, append-only. One row per award, review decision, reversal or settlement; source_key makes every award happen at most once. Simulated: never money.';
create index points_by_member_time on sim.points_ledger (member_id, created_at desc);
create index points_by_status on sim.points_ledger (status) where status in ('pending_review', 'approved');

create function sim.ledger_is_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = 'P0001';
end;
$$;
create trigger points_ledger_append_only
  before update or delete on sim.points_ledger
  for each row when (pg_trigger_depth() = 0)
  execute function sim.ledger_is_append_only();

-- The current state of each award: its latest decision row (approve, reject, reverse, settle).
create function sim.award_state(p_award bigint)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select l.status from sim.points_ledger l where l.reverses = p_award order by l.id desc limit 1),
    (select l.status from sim.points_ledger l where l.id = p_award));
$$;

-- Awards a point action once, by its source key, under the active rules and limits.
create function sim.award(p_member uuid, p_action text, p_key text, p_creator uuid, p_post uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_set sim.reward_settings%rowtype;
  v_rule sim.point_rules%rowtype;
  v_today integer;
  v_month integer;
begin
  select * into v_set from sim.reward_settings where id;
  if v_set.paused or p_member is null then
    return;
  end if;
  select * into v_rule from sim.point_rules r where r.version = v_set.rule_version and r.action = p_action;
  if not found or v_rule.points = 0 then
    return;
  end if;
  -- Never for your own content or yourself.
  if p_creator is not null and p_creator = p_member then
    return;
  end if;
  if exists (select 1 from sim.points_ledger l where l.source_key = p_key) then
    return;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('sim.award:' || p_member::text, 0));
  if v_rule.daily_cap is not null then
    select count(*) into v_today from sim.points_ledger l
    where l.member_id = p_member and l.action = p_action and l.reverses is null
      and l.created_at > pg_catalog.date_trunc('day', pg_catalog.now());
    if v_today >= v_rule.daily_cap then
      return;
    end if;
  end if;
  if v_rule.redeemable then
    select coalesce(sum(l.points), 0) into v_month from sim.points_ledger l
    where l.redeemable and l.reverses is null and l.created_at > pg_catalog.date_trunc('month', pg_catalog.now());
    if v_month + v_rule.points > v_set.monthly_redeemable_cap then
      return;
    end if;
  end if;
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, post_id)
  values (p_member, p_action, v_rule.points, v_rule.redeemable,
          case when v_rule.redeemable then 'pending_review' else 'recognized' end,
          v_set.rule_version, p_key, p_creator, p_post)
  on conflict (source_key) do nothing;
end;
$$;

-- Reverses an award (a deleted comment, a rejected referral), once.
create function sim.reverse(p_key text, p_reason_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_award sim.points_ledger%rowtype;
begin
  select * into v_award from sim.points_ledger l where l.source_key = p_key and l.reverses is null;
  if not found or sim.award_state(v_award.id) in ('reversal', 'rejected', 'settled') then
    return;
  end if;
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, post_id, reverses)
  values (v_award.member_id, v_award.action, -v_award.points, v_award.redeemable, 'reversal', v_award.rule_version,
          p_reason_key, v_award.creator_id, v_award.post_id, v_award.id)
  on conflict (source_key) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Awarding, from the authoritative tables

create function sim.capture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_author uuid;
  v_reg ops.registrations%rowtype;
begin
  if tg_table_name = 'comments' then
    select p.author_id into v_author from social.posts p where p.id = coalesce(new.post_id, old.post_id);
    if tg_op = 'INSERT' and social.meaningful_comment(new.body) then
      perform sim.award(new.author_id, 'meaningful_comment', 'comment:' || new.id, v_author, new.post_id);
    elsif tg_op = 'UPDATE' and old.deleted_at is null and new.deleted_at is not null then
      perform sim.reverse('comment:' || new.id, 'comment-deleted:' || new.id);
    end if;
  elsif tg_table_name = 'saves' then
    select p.author_id into v_author from social.posts p where p.id = new.post_id;
    perform sim.award(new.member_id, 'save', 'save:' || new.member_id || ':' || new.post_id, v_author, new.post_id);
  elsif tg_table_name = 'reposts' then
    select p.author_id into v_author from social.posts p where p.id = new.post_id;
    perform sim.award(new.reposter_id, 'repost', 'repost:' || new.reposter_id || ':' || new.post_id, v_author, new.post_id);
  elsif tg_table_name = 'shares' then
    select p.author_id into v_author from social.posts p where p.id = new.post_id;
    perform sim.award(new.member_id, 'external_share', 'share:' || new.member_id || ':' || new.post_id, v_author, new.post_id);
  elsif tg_table_name = 'follow_events' then
    -- A qualified referral: the referred member's own first follow.
    if new.action = 'followed' then
      select * into v_reg from ops.registrations r where r.user_id = new.follower_id and r.kind = 'referral' and r.referrer_id is not null;
      if found and v_reg.referrer_id <> new.follower_id
         and exists (select 1 from ops.age_attestations a where a.user_id = new.follower_id)
         and exists (select 1 from auth.users u where u.id = new.follower_id and u.email_confirmed_at is not null) then
        perform sim.award(v_reg.referrer_id, 'qualified_referral', 'referral:' || new.follower_id, new.creator_id, null);
      end if;
    end if;
  end if;
  return null;
end;
$$;
create trigger rewards_comments after insert or update of deleted_at on social.comments
for each row execute function sim.capture();
create trigger rewards_saves after insert on social.saves
for each row execute function sim.capture();
create trigger rewards_reposts after insert on social.reposts
for each row execute function sim.capture();
create trigger rewards_shares after insert on social.shares
for each row execute function sim.capture();
create trigger rewards_follow_events after insert on social.follow_events
for each row execute function sim.capture();

-- ---------------------------------------------------------------------------
-- Simulated revenue, pool, valuation, month close

create table sim.revenue_entries (
  id            bigint generated always as identity primary key,
  month         date not null check (month = pg_catalog.date_trunc('month', month)::date),
  kind          text not null check (kind in ('content_ad', 'feed_ad')),
  creator_id    uuid references auth.users (id) on delete set null,
  post_id       uuid,
  net_cents     bigint not null check (net_cents >= 0),
  note          text not null check (char_length(note) between 1 and 200),
  recorded_by   text not null,
  recorded_at   timestamptz not null default pg_catalog.now(),
  constraint revenue_content_has_creator check (kind = 'feed_ad' or creator_id is not null)
);
comment on table sim.revenue_entries is 'SIMULATED net advertising revenue for the pilot. content_ad: 40% creator, 20% fan pool, 40% Splitpost. feed_ad: 100% Splitpost. Never real money.';
create trigger revenue_entries_append_only before update or delete on sim.revenue_entries
for each row when (pg_trigger_depth() = 0) execute function sim.ledger_is_append_only();

-- The split, in whole cents: creator and pool round down, Splitpost takes the remainder, so the three always add up.
create function sim.split(p_kind text, p_net bigint, out creator_cents bigint, out pool_cents bigint, out splitpost_cents bigint)
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'content_ad' then p_net * 40 / 100 else 0 end,
         case when p_kind = 'content_ad' then p_net * 20 / 100 else 0 end,
         p_net - case when p_kind = 'content_ad' then p_net * 40 / 100 + p_net * 20 / 100 else 0 end;
$$;

create table sim.settlements (
  id             bigint generated always as identity primary key,
  month          date not null unique check (month = pg_catalog.date_trunc('month', month)::date),
  pool_cents     bigint not null,
  points         bigint not null,
  closed_by      text not null,
  closed_at      timestamptz not null default pg_catalog.now()
);
create table sim.settlement_lines (
  settlement_id  bigint not null references sim.settlements (id),
  member_id      uuid references auth.users (id) on delete set null,
  points         bigint not null,
  value_cents    bigint not null,
  primary key (settlement_id, member_id)
);
comment on table sim.settlements is 'SIMULATED month closes: the fan pool allocated to approved redeemable points. Nothing is paid.';
create trigger settlements_append_only before update or delete on sim.settlements
for each row when (pg_trigger_depth() = 0) execute function sim.ledger_is_append_only();
create trigger settlement_lines_append_only before update or delete on sim.settlement_lines
for each row when (pg_trigger_depth() = 0) execute function sim.ledger_is_append_only();

-- Approved redeemable points not yet settled, per member.
create function sim.outstanding()
returns table (member_id uuid, points bigint)
language sql
stable
set search_path = ''
as $$
  select l.member_id, sum(l.points)::bigint
  from sim.points_ledger l
  where l.redeemable and l.reverses is null and sim.award_state(l.id) = 'approved'
  group by l.member_id;
$$;

-- The pool not yet allocated: 20% of all simulated content-ad revenue, minus what earlier closes allocated.
create function sim.open_pool_cents()
returns bigint
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum((sim.split(r.kind, r.net_cents)).pool_cents) from sim.revenue_entries r), 0)
       - coalesce((select sum(sl.value_cents) from sim.settlement_lines sl), 0);
$$;

-- ---------------------------------------------------------------------------
-- Member functions

create function public.app_my_points()
returns table (recognized bigint, redeemable_pending bigint, redeemable_approved bigint, settled bigint,
               simulated_point_value_cents numeric, simulated_value_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_out bigint := coalesce((select sum(o.points) from sim.outstanding() o), 0);
  v_mine bigint := coalesce((select o.points from sim.outstanding() o where o.member_id = v_uid), 0);
  v_pool bigint := sim.open_pool_cents();
begin
  return query
  select coalesce(sum(case when not l.redeemable then l.points end), 0)::bigint,
         coalesce(sum(case when l.redeemable and sim.award_state(l.id) = 'pending_review' and l.reverses is null then l.points end), 0)::bigint,
         v_mine,
         coalesce(sum(case when l.status = 'settled' then -l.points end), 0)::bigint,
         case when v_out > 0 then pg_catalog.round(v_pool::numeric / v_out, 4) else 0 end,
         case when v_out > 0 then (v_pool * v_mine / v_out)::bigint else 0 end
  from sim.points_ledger l
  where l.member_id = v_uid;
end;
$$;
comment on function public.app_my_points() is 'The member''s Connection Points: recognized, redeemable (pending review, approved), settled, and the SIMULATED value of approved points from the fan pool. Never money.';
revoke all on function public.app_my_points() from public, anon;
grant execute on function public.app_my_points() to authenticated;

create function public.app_my_points_history(p_before bigint default null, p_limit integer default 30)
returns table (id bigint, action text, points integer, redeemable boolean, status text, created_at timestamptz,
               creator_username text, creator_display_name text, post_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select l.id, l.action, l.points, l.redeemable,
         case when l.reverses is null then sim.award_state(l.id) else l.status end,
         l.created_at, p.username, p.display_name, l.post_id
  from sim.points_ledger l
  left join social.visible_members p on p.id = l.creator_id
  where l.member_id = v_uid and (p_before is null or l.id < p_before)
  order by l.id desc
  limit least(greatest(coalesce(p_limit, 30), 1), 100);
end;
$$;
comment on function public.app_my_points_history(bigint, integer) is 'The member''s own point history, newest first.';
revoke all on function public.app_my_points_history(bigint, integer) from public, anon;
grant execute on function public.app_my_points_history(bigint, integer) to authenticated;

create function public.app_my_simulated_earnings()
returns table (month date, creator_cents bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select r.month, sum((sim.split(r.kind, r.net_cents)).creator_cents)::bigint
  from sim.revenue_entries r
  where r.creator_id = v_uid and r.kind = 'content_ad'
  group by r.month
  order by r.month desc;
end;
$$;
comment on function public.app_my_simulated_earnings() is 'The member''s SIMULATED creator share (40%) of content-associated advertising, by month. Never money.';
revoke all on function public.app_my_simulated_earnings() from public, anon;
grant execute on function public.app_my_simulated_earnings() to authenticated;

-- ---------------------------------------------------------------------------
-- Founder functions: referral review, revenue entries, month close, oversight

create function public.app_founder_referral_queue()
returns table (award_id bigint, referrer_username text, referred_username text, first_follow_username text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  perform v_uid;
  return query
  select l.id, rp.username,
         (select p.username from social.visible_members p where p.id = pg_catalog.substr(l.source_key, 10)::uuid),
         cp.username, l.created_at
  from sim.points_ledger l
  left join social.visible_members rp on rp.id = l.member_id
  left join social.visible_members cp on cp.id = l.creator_id
  where l.action = 'qualified_referral' and l.reverses is null and sim.award_state(l.id) = 'pending_review'
  order by l.id;
end;
$$;
revoke all on function public.app_founder_referral_queue() from public, anon;
grant execute on function public.app_founder_referral_queue() to authenticated;

create function public.app_founder_review_referral(p_award bigint, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_award sim.points_ledger%rowtype;
begin
  select * into v_award from sim.points_ledger l where l.id = p_award and l.action = 'qualified_referral' and l.reverses is null;
  if not found or sim.award_state(v_award.id) <> 'pending_review' or p_approve is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, post_id, reverses)
  values (v_award.member_id, v_award.action, case when p_approve then 0 else -v_award.points end, true,
          case when p_approve then 'approved' else 'rejected' end, v_award.rule_version,
          'review:' || v_award.id || ':' || v_uid, v_award.creator_id, null, v_award.id);
end;
$$;
comment on function public.app_founder_review_referral(bigint, boolean) is 'Founder: approves or rejects a pending qualified referral (recorded as a ledger row; rejection reverses the points).';
revoke all on function public.app_founder_review_referral(bigint, boolean) from public, anon;
grant execute on function public.app_founder_review_referral(bigint, boolean) to authenticated;

create function public.app_founder_record_sim_revenue(p_month date, p_kind text, p_creator uuid, p_post uuid, p_net_cents bigint, p_note text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_id bigint;
begin
  if p_month is null or p_kind not in ('content_ad', 'feed_ad') or p_net_cents is null or p_net_cents < 0
     or (p_kind = 'content_ad' and p_creator is null) or p_note is null or pg_catalog.btrim(p_note) = '' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into sim.revenue_entries (month, kind, creator_id, post_id, net_cents, note, recorded_by)
  values (pg_catalog.date_trunc('month', p_month)::date, p_kind, case when p_kind = 'content_ad' then p_creator end, p_post, p_net_cents,
          pg_catalog.left(pg_catalog.btrim(p_note), 200), 'founder:' || v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.app_founder_record_sim_revenue(date, text, uuid, uuid, bigint, text) is 'Founder: records SIMULATED net advertising revenue for the pilot model (until IP-7 records it from campaigns).';
revoke all on function public.app_founder_record_sim_revenue(date, text, uuid, uuid, bigint, text) from public, anon;
grant execute on function public.app_founder_record_sim_revenue(date, text, uuid, uuid, bigint, text) to authenticated;

create function public.app_founder_close_month(p_month date)
returns table (settlement_id bigint, pool_cents bigint, points bigint, members integer, allocated_cents bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_month date := pg_catalog.date_trunc('month', p_month)::date;
  v_pool bigint;
  v_points bigint;
  v_id bigint;
  v_allocated bigint;
  v_n integer := 0;
begin
  if p_month is null or v_month >= pg_catalog.date_trunc('month', pg_catalog.now())::date then
    raise exception 'month_not_over' using errcode = 'P0001';
  end if;
  if exists (select 1 from sim.settlements s where s.month = v_month) then
    raise exception 'already_closed' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('splitpost:sim_close', 0));
  v_pool := sim.open_pool_cents();
  select coalesce(sum(o.points), 0) into v_points from sim.outstanding() o;
  insert into sim.settlements (month, pool_cents, points, closed_by) values (v_month, v_pool, v_points, 'founder:' || v_uid) returning id into v_id;
  if v_points > 0 and v_pool > 0 then
    -- Whole cents, rounding down; the remainder goes to the largest holder so the lines reconcile exactly.
    insert into sim.settlement_lines (settlement_id, member_id, points, value_cents)
    select v_id, x.member_id, x.points,
           x.cents + case when x.rn = 1 then v_pool - sum(x.cents) over () else 0 end
    from (
      select o.member_id, o.points, (v_pool * o.points / v_points) as cents,
             pg_catalog.row_number() over (order by o.points desc, o.member_id) as rn
      from sim.outstanding() o
    ) x;
    get diagnostics v_n = row_count;
    -- Settle the approved points: one settlement row per award.
    insert into sim.points_ledger (member_id, action, points, redeemable, status, rule_version, source_key, creator_id, reverses, settlement_id)
    select l.member_id, l.action, -l.points, true, 'settled', l.rule_version, 'settle:' || l.id, l.creator_id, l.id, v_id
    from sim.points_ledger l
    where l.redeemable and l.reverses is null and sim.award_state(l.id) = 'approved';
  end if;
  select coalesce(sum(sl.value_cents), 0) into v_allocated from sim.settlement_lines sl where sl.settlement_id = v_id;
  if v_points > 0 and v_pool > 0 and v_allocated <> v_pool then
    raise exception 'does_not_reconcile' using errcode = 'P0001';
  end if;
  return query select v_id, v_pool, v_points, v_n, v_allocated;
end;
$$;
comment on function public.app_founder_close_month(date) is 'Founder: SIMULATED month close. Allocates the open fan pool to approved redeemable points in whole cents, settles them, and refuses unless the lines add up to the pool exactly. Nothing is paid.';
revoke all on function public.app_founder_close_month(date) from public, anon;
grant execute on function public.app_founder_close_month(date) to authenticated;

create function public.app_founder_rewards_overview()
returns table (recognized bigint, redeemable_pending bigint, redeemable_approved bigint, settled bigint,
               revenue_cents bigint, creator_cents bigint, pool_cents bigint, splitpost_cents bigint, open_pool_cents bigint,
               paused boolean, rule_version text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  perform v_uid;
  return query
  select
    coalesce((select sum(l.points) from sim.points_ledger l where not l.redeemable), 0)::bigint,
    coalesce((select sum(l.points) from sim.points_ledger l where l.redeemable and l.reverses is null and sim.award_state(l.id) = 'pending_review'), 0)::bigint,
    coalesce((select sum(o.points) from sim.outstanding() o), 0)::bigint,
    coalesce((select sum(-l.points) from sim.points_ledger l where l.status = 'settled'), 0)::bigint,
    coalesce((select sum(r.net_cents) from sim.revenue_entries r), 0)::bigint,
    coalesce((select sum((sim.split(r.kind, r.net_cents)).creator_cents) from sim.revenue_entries r), 0)::bigint,
    coalesce((select sum((sim.split(r.kind, r.net_cents)).pool_cents) from sim.revenue_entries r), 0)::bigint,
    coalesce((select sum((sim.split(r.kind, r.net_cents)).splitpost_cents) from sim.revenue_entries r), 0)::bigint,
    sim.open_pool_cents(),
    (select s.paused from sim.reward_settings s where s.id),
    (select s.rule_version from sim.reward_settings s where s.id);
end;
$$;
comment on function public.app_founder_rewards_overview() is 'Founder: SIMULATED rewards and revenue reconciliation: points by state, revenue split (creator, pool, Splitpost) and the open pool.';
revoke all on function public.app_founder_rewards_overview() from public, anon;
grant execute on function public.app_founder_rewards_overview() to authenticated;

create function public.app_founder_set_rewards(p_paused boolean, p_monthly_redeemable_cap integer default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_paused is null or (p_monthly_redeemable_cap is not null and p_monthly_redeemable_cap < 0) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update sim.reward_settings s set paused = p_paused,
         monthly_redeemable_cap = coalesce(p_monthly_redeemable_cap, s.monthly_redeemable_cap),
         updated_at = pg_catalog.now(), updated_by = 'founder:' || v_uid
  where s.id;
end;
$$;
revoke all on function public.app_founder_set_rewards(boolean, integer) from public, anon;
grant execute on function public.app_founder_set_rewards(boolean, integer) to authenticated;

-- Lock down: sim stays service-role only; members reach it only through the functions above.
revoke all on all tables in schema sim from public, anon, authenticated;
revoke all on all functions in schema sim from public, anon, authenticated;
alter table sim.point_rules enable row level security;
alter table sim.reward_settings enable row level security;
alter table sim.points_ledger enable row level security;
alter table sim.revenue_entries enable row level security;
alter table sim.settlements enable row level security;
alter table sim.settlement_lines enable row level security;
