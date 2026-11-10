-- TEST ONLY (throwaway databases). Waitlist operations, as the real login
-- roles: the admin overview, invitation-wave preparation, retention with
-- duplicate signups, and the emergency close script
-- (scripts/db/emergency-close.sql). One transaction, rolled back.

begin;

create function pg_temp.k(seed text) returns text language sql as $$ select encode(sha256(convert_to(seed, 'UTF8')), 'hex') $$;
create function pg_temp.submit(p_email text, p_shares text default null, p_interests text[] default '{}', p_client text default 'ops-client')
returns text language plpgsql as $$
declare
  r text;
  ek text := pg_temp.k('email:' || lower(btrim(p_email)));
  ck text := pg_temp.k(p_client);
begin
  set local role waitlist_writer;
  r := waitlist_api.submit(p_email, p_interests, p_shares, null, null, 'ops', true, true, 'notice-ops', ek, ck);
  reset role;
  return r;
end $$;
create function pg_temp.admin(call text) returns jsonb language plpgsql as $$
declare r jsonb;
begin
  set local role waitlist_admin;
  execute 'select ' || call into r;
  reset role;
  return r;
end $$;

-- Setup: open, then six people with different answers, joined in order.
do $$
declare
  i integer := 0;
  e text;
begin
  perform pg_temp.admin($q$waitlist_api.admin_set_notice_version('notice-ops')$q$);
  perform pg_temp.admin('waitlist_api.admin_open()');
  foreach e in array array['c1@ops.test', 'c2@ops.test', 'a1@ops.test', 's1@ops.test', 'cs@ops.test', 'q1@ops.test'] loop
    i := i + 1;
    if pg_temp.submit(e,
         case when e like 'c%' then 'yes' when e like 'a%' then 'not_yet' end,
         case when e in ('a1@ops.test') then array['reach_followers']
              when e in ('s1@ops.test', 'cs@ops.test') then array['support_creators'] else '{}' end,
         'client-' || i) <> 'ok' then
      raise exception 'FAIL: setup submission % was refused', e;
    end if;
    update ops.waitlist set joined_at = now() - make_interval(days => 10 - i) where email = e;
  end loop;
  -- Stands in for the future verification flow: four verified, a1 and q1 not.
  update ops.waitlist set email_verified_at = now() where email in ('c1@ops.test', 'c2@ops.test', 'cs@ops.test', 's1@ops.test');
end $$;

-- 1. The overview: counts only, verified apart, groups, recent signups, status.
do $$
declare
  s jsonb := pg_temp.admin('waitlist_api.admin_summary()');
begin
  if s::text ~* '@|ops\.test|[0-9a-f]{8}-[0-9a-f]{4}-' then
    raise exception 'FAIL: the overview contains an address or id: %', s;
  end if;
  if (s->>'total')::int <> 6 or (s->>'verified')::int <> 4 or (s->>'unverified')::int <> 2
     or (s->>'joined_last_7_days')::int <> 3 or (s->>'joined_last_24_hours')::int <> 0
     or s->'participant_groups' <> '{"active_creator": 3, "aspiring_creator": 1, "supporter": 2, "none_answered": 1}'::jsonb
     or s->'status' <> '{"new": 6}'::jsonb or s->'waves' <> '{}'::jsonb or s->>'submissions' <> 'ON' then
    raise exception 'FAIL: the overview is wrong: %', s;
  end if;
  raise notice 'PASS: the overview gives counts only, with verified, groups and recent signups';
end $$;

-- 2. Wave preview and selection: VERIFIED entries only, approved groups and
--    reasons, earliest signups first, counts only, never re-picking someone.
do $$
declare
  r jsonb;
begin
  r := pg_temp.admin($q$waitlist_api.admin_wave_preview('any')$q$);
  if (r->>'eligible')::int <> 4 or (r->>'not_eligible_unverified')::int <> 2 then
    raise exception 'FAIL: wave preview is wrong: %', r;
  end if;
  if (pg_temp.admin($q$waitlist_api.admin_wave_preview('aspiring_creator')$q$)->>'eligible')::int <> 0 then
    raise exception 'FAIL: an unverified aspiring creator was counted as eligible';
  end if;

  r := pg_temp.admin($q$waitlist_api.admin_wave_select('wave_1', 'active_creator', array['group_balance'], 2)$q$);
  if r::text ~* '@|[0-9a-f]{8}-[0-9a-f]{4}-' or (r->>'selected')::int <> 2 then
    raise exception 'FAIL: wave selection is wrong or exposes people: %', r;
  end if;
  -- Earliest signups first: c1 and c2, not cs.
  if (select array_agg(w.email order by w.email) from ops.waitlist_selections s join ops.waitlist w on w.id = s.waitlist_id where s.wave = 'wave_1')
     <> array['c1@ops.test', 'c2@ops.test']
     or (select status from ops.waitlist where email = 'c1@ops.test') <> 'shortlisted' then
    raise exception 'FAIL: wave selection did not pick the earliest signups, or did not shortlist them';
  end if;
  -- 'any' takes the remaining VERIFIED entries only: cs and s1, never a1 or q1.
  r := pg_temp.admin($q$waitlist_api.admin_wave_select('wave_2', 'any', array['targeted_feedback', 'group_balance'], 10)$q$);
  if (r->>'selected')::int <> 2 then
    raise exception 'FAIL: a second wave re-picked someone, missed someone or took an unverified entry: %', r;
  end if;
  if exists (select 1 from ops.waitlist_selections s join ops.waitlist w on w.id = s.waitlist_id where not w.verified) then
    raise exception 'FAIL: an unverified entry entered a wave';
  end if;

  r := pg_temp.admin($q$waitlist_api.admin_wave_summary('wave_2')$q$);
  if (r->>'selected')::int <> 2 or r->'reasons' <> '{"group_balance": 2, "targeted_feedback": 2}'::jsonb
     or (r->'participant_groups'->>'supporter')::int <> 2 or r::text ~ '@' then
    raise exception 'FAIL: the wave summary is wrong: %', r;
  end if;

  -- The table itself refuses an unverified entry, whoever writes it.
  begin
    insert into ops.waitlist_selections (waitlist_id, wave, reasons)
    select id, 'wave_9', array['group_balance'] from ops.waitlist where email = 'q1@ops.test';
    raise exception 'FAIL: an unverified entry was written into a wave directly';
  exception when check_violation then null;
  end;
  raise notice 'PASS: waves take verified entries only, by approved group and reason, earliest first, counts only';
end $$;

-- 3. Waves refuse anything outside the approved lists, and never invite.
do $$
declare
  bad text;
begin
  foreach bad in array array[
    $q$waitlist_api.admin_wave_select('wave_3', 'vip', array['group_balance'], 1)$q$,
    $q$waitlist_api.admin_wave_select('wave_3', 'any', array['great vibes'], 1)$q$,
    $q$waitlist_api.admin_wave_select('wave_3', 'any', array[]::text[], 1)$q$,
    $q$waitlist_api.admin_wave_select('wave_3', 'any', array['group_balance'], 0)$q$,
    $q$waitlist_api.admin_wave_select('wave_3', 'any', array['group_balance'], 101)$q$,
    $q$waitlist_api.admin_wave_select('Wave 3!', 'any', array['group_balance'], 1)$q$,
    $q$waitlist_api.admin_wave_select('wave_3', 'any', array['group_balance'], 1, true)$q$,
    $q$waitlist_api.admin_wave_preview('vip')$q$
  ] loop
    begin
      perform pg_temp.admin(bad);
      raise exception 'FAIL: accepted %', bad;
    exception when check_violation or raise_exception or undefined_function then
      if sqlerrm like 'FAIL:%' then raise; end if;
    end;
  end loop;
  -- Unverified entries still can't be marked invited.
  begin
    update ops.waitlist set status = 'invited' where email = 'q1@ops.test';
    raise exception 'FAIL: an unverified entry was marked invited';
  exception when check_violation then null;
  end;
  if exists (select 1 from ops.invitations where email like '%@ops.test') then
    raise exception 'FAIL: wave preparation created an invitation';
  end if;
  raise notice 'PASS: waves refuse unapproved groups, reasons and sizes, and never invite';
end $$;

-- 4. Only the admin login can prepare waves.
do $$
declare
  r text;
begin
  foreach r in array array['anon', 'authenticated', 'service_role', 'waitlist_writer'] loop
    execute format('set local role %I', r);
    begin
      perform waitlist_api.admin_wave_select('wave_x', 'any', array['group_balance'], 1);
      raise exception 'FAIL: % could prepare a wave', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  raise notice 'PASS: only the admin login can prepare waves';
end $$;

-- 5. Clearing a wave undoes it, but never touches someone already invited.
do $$
declare
  r jsonb;
begin
  -- c2 is verified, so it may be invited (stands in for a future invitation step).
  update ops.waitlist set status = 'invited' where email = 'c2@ops.test';
  r := pg_temp.admin($q$waitlist_api.admin_wave_clear('wave_1')$q$);
  if (r->>'cleared')::int <> 1
     or (select status from ops.waitlist where email = 'c1@ops.test') <> 'new'
     or (select status from ops.waitlist where email = 'c2@ops.test') <> 'invited'
     or not exists (select 1 from ops.waitlist_selections s join ops.waitlist w on w.id = s.waitlist_id where w.email = 'c2@ops.test') then
    raise exception 'FAIL: clearing a wave did not undo it correctly: %', r;
  end if;
  raise notice 'PASS: clearing a wave undoes it, leaving invited entries alone';
end $$;

-- 6. Retention with duplicates: a repeat signup never extends retention, the
--    12 month purge removes the entry with its selections, and a verified
--    confirmation keeps someone.
do $$
declare
  r jsonb;
begin
  update ops.waitlist set joined_at = now() - interval '13 months' where email in ('q1@ops.test', 's1@ops.test', 'a1@ops.test');
  -- q1 signs up again today: nothing about the entry changes.
  if pg_temp.submit('q1@ops.test', 'yes', array['support_creators'], 'client-99') <> 'ok' then
    raise exception 'FAIL: a repeat signup did not answer ok';
  end if;
  if (select joined_at from ops.waitlist where email = 'q1@ops.test') > now() - interval '12 months'
     or (select participant_groups from ops.waitlist where email = 'q1@ops.test') <> '{}'::text[] then
    raise exception 'FAIL: a repeat signup changed the entry or extended its retention';
  end if;
  -- a1 is verified and confirmed interest last month: kept.
  update ops.waitlist set email_verified_at = now() - interval '2 months', interest_confirmed_at = now() - interval '1 month' where email = 'a1@ops.test';
  r := pg_temp.admin('waitlist_api.admin_purge(12)');
  if (r->>'waitlist')::int <> 2
     or exists (select 1 from ops.waitlist where email in ('q1@ops.test', 's1@ops.test'))
     or not exists (select 1 from ops.waitlist where email = 'a1@ops.test')
     or exists (select 1 from ops.waitlist_selections s where not exists (select 1 from ops.waitlist w where w.id = s.waitlist_id)) then
    raise exception 'FAIL: the 12 month purge removed the wrong entries or left selections behind: %', r;
  end if;
  raise notice 'PASS: retention ignores repeat signups, purges after 12 months with selections, keeps verified confirmations';
end $$;

-- 7. The emergency close script (run exactly as written in the SQL editor).
update ops.settings set enabled = true where key = 'waitlist_submissions';
\i scripts/db/emergency-close.sql
do $$
begin
  if (select enabled from ops.settings where key = 'waitlist_submissions') or pg_temp.submit('late@ops.test') <> 'closed' then
    raise exception 'FAIL: the emergency close script did not close the waitlist';
  end if;
  if (select value from ops.settings where key = 'waitlist_notice_version') <> 'notice-ops' or (select count(*) from ops.waitlist) <> 4 then
    raise exception 'FAIL: the emergency close script changed something else';
  end if;
  raise notice 'PASS: the emergency close script closes the waitlist and changes nothing else';
end $$;

rollback;
