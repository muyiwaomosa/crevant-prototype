-- TEST ONLY (throwaway databases). Who can read and change what.
-- A = ...001 and B = ...002 (both confirmed, both have profiles).

update public.profiles set username = 'bee_profile', display_name = 'Bee'
where id = '00000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Signed in as A, before any pilot membership: identity only.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare
  n int;
  st text;
begin
  -- Reads: only A's own row is visible (identity, not membership).
  select count(*) into n from public.profiles;
  if n <> 1 or not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: A can see % profiles, or not their own', n;
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: A can read B''s profile';
  end if;
  select status into st from public.app_access_state();
  if st <> 'none' then
    raise exception 'FAIL: A''s access state is %, expected none', st;
  end if;
  -- Choosing a profile needs membership.
  begin
    perform public.app_set_profile('aye_profile', 'Aye');
    raise exception 'FAIL: A set a profile without pilot membership';
  exception when others then
    if sqlerrm <> 'no_pilot_access' then raise; end if;
  end;
  raise notice 'PASS: without membership, A reads only their own profile, learns their state is none, and cannot set a profile';
end $$;
commit;

-- The founder grants A membership (server only).
select ops.grant_member_access('00000000-0000-4000-8000-000000000001', 'tester', 'test');

-- ---------------------------------------------------------------------------
-- Signed in as A, now a pilot member.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$
begin
  perform public.app_set_profile('aye_profile', 'Aye');
  if (select username from public.profiles where id = '00000000-0000-4000-8000-000000000001') <> 'aye_profile' then
    raise exception 'FAIL: A could not set their own username and display name';
  end if;
  raise notice 'PASS: A reads and changes only their own profile, through app_set_profile';
end $$;

-- Direct writes (including to the formerly editable columns), inserts,
-- deletes and the private schema are refused.
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    $q$update public.profiles set username = 'direct_name' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$update public.profiles set display_name = 'Direct' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$update public.profiles set display_name = 'Hacked' where id = '00000000-0000-4000-8000-000000000002'$q$,
    $q$update public.profiles set id = '00000000-0000-4000-8000-000000000099' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$update public.profiles set created_at = now() - interval '1 year' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$update public.profiles set updated_at = now() - interval '1 year' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000098')$q$,
    $q$insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000001')$q$,
    $q$delete from public.profiles where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$truncate public.profiles$q$,
    $q$select count(*) from ops.invitations$q$,
    $q$select count(*) from ops.admins$q$,
    $q$select count(*) from ops.member_access$q$,
    $q$insert into ops.admins (user_id) values ('00000000-0000-4000-8000-000000000001')$q$
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: signed-in member was allowed: %', stmt;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'PASS: A cannot write profiles directly, add or delete profiles, or touch ops';
end $$;
commit;

-- B's profile is untouched, and A's own changes were saved (and trimmed).
do $$
begin
  if (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000002') <> 'Bee' then
    raise exception 'FAIL: B''s profile was changed by A';
  end if;
  if (select username from public.profiles where id = '00000000-0000-4000-8000-000000000001') <> 'aye_profile' then
    raise exception 'FAIL: A''s own change was not saved';
  end if;
  raise notice 'PASS: cross-user isolation holds after commit';
end $$;

-- updated_at is set by the database on each change.
do $$
begin
  if (select updated_at <= created_at from public.profiles where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: updated_at was not advanced by the database';
  end if;
  raise notice 'PASS: updated_at is maintained by the database';
end $$;

-- ---------------------------------------------------------------------------
-- Anonymous visitor (not signed in).
begin;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    $q$select count(*) from public.profiles$q$,
    $q$insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000097')$q$,
    $q$update public.profiles set display_name = 'x'$q$,
    $q$delete from public.profiles$q$,
    $q$select count(*) from ops.invitations$q$,
    $q$select count(*) from ops.admins$q$
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: anonymous visitor was allowed: %', stmt;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'PASS: anonymous visitors cannot read or change profiles or ops';
end $$;
rollback;

-- ---------------------------------------------------------------------------
-- Server code (service_role) can manage ops data.
begin;
set local role service_role;
insert into ops.admins (user_id) values ('00000000-0000-4000-8000-000000000001');
insert into ops.invitations (email, source, campaign, invited_by, expires_at)
values ('invitee@example.test', 'founder_outreach', 'pilot_wave_1', '00000000-0000-4000-8000-000000000001', now() + interval '14 days');
do $$
begin
  if (select count(*) from ops.invitations) <> 1 or (select count(*) from ops.admins) <> 1 then
    raise exception 'FAIL: service_role could not manage ops data';
  end if;
  raise notice 'PASS: server code can manage admins and invitations';
end $$;
rollback;
