-- TEST ONLY (throwaway databases). Who can read and change what.
-- A = ...001 and B = ...002 (both confirmed, both have profiles).

update public.profiles set username = 'bee_profile', display_name = 'Bee'
where id = '00000000-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- Signed in as A.
begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  n int;
begin
  -- Reads: only A's own row is visible.
  select count(*) into n from public.profiles;
  if n <> 1 or not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: A can see % profiles, or not their own', n;
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000002') then
    raise exception 'FAIL: A can read B''s profile';
  end if;

  -- Cross-user writes: changing B's profile affects nothing.
  update public.profiles set display_name = 'Hacked' where id = '00000000-0000-4000-8000-000000000002';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'FAIL: A changed % rows of B''s profile', n;
  end if;
  update public.profiles set display_name = 'Hacked';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: an unfiltered update by A touched % rows (expected only their own)', n;
  end if;

  -- Own allowed fields can change.
  update public.profiles set username = 'aye_profile', display_name = 'Aye'
  where id = '00000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'FAIL: A could not update their own username and display name';
  end if;
  raise notice 'PASS: A reads and changes only their own profile';
end $$;

-- Protected fields, inserts, deletes and the private schema are refused.
do $$
declare
  stmt text;
begin
  foreach stmt in array array[
    $q$update public.profiles set id = '00000000-0000-4000-8000-000000000099' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$update public.profiles set created_at = now() - interval '1 year' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$update public.profiles set updated_at = now() - interval '1 year' where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000098')$q$,
    $q$insert into public.profiles (id) values ('00000000-0000-4000-8000-000000000001')$q$,
    $q$delete from public.profiles where id = '00000000-0000-4000-8000-000000000001'$q$,
    $q$truncate public.profiles$q$,
    $q$select count(*) from ops.invitations$q$,
    $q$select count(*) from ops.admins$q$,
    $q$insert into ops.admins (user_id) values ('00000000-0000-4000-8000-000000000001')$q$
  ] loop
    begin
      execute stmt;
      raise exception 'FAIL: signed-in member was allowed: %', stmt;
    exception when insufficient_privilege then
      null;
    end;
  end loop;
  raise notice 'PASS: A cannot change protected fields, add or delete profiles, or touch ops';
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
