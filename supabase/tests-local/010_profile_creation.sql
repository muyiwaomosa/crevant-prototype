-- TEST ONLY (throwaway databases). Profile creation, confirmation and backfill.
-- Identities are written as supabase_auth_admin, the role Supabase Auth uses,
-- which has no privileges on public.profiles: the trigger must still work.

-- 1. Backfill: identities confirmed before the migration got a profile; the
--    unconfirmed one did not.
do $$
begin
  if (select count(*) from public.profiles where id in ('00000000-0000-4000-8000-000000000001',
                                                       '00000000-0000-4000-8000-000000000002')) <> 2 then
    raise exception 'FAIL: confirmed identities that existed before the migration were not backfilled';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000003') then
    raise exception 'FAIL: an unconfirmed identity got a profile from the backfill';
  end if;
  raise notice 'PASS: backfill created profiles for existing confirmed identities only';
end $$;

-- 2. Running the backfill again changes nothing.
do $$
declare
  before int;
begin
  select count(*) into before from public.profiles;
  insert into public.profiles (id)
  select u.id from auth.users u where u.email_confirmed_at is not null
  on conflict (id) do nothing;
  if (select count(*) from public.profiles) <> before then
    raise exception 'FAIL: running the backfill twice changed the number of profiles';
  end if;
  raise notice 'PASS: backfill is idempotent';
end $$;

set role supabase_auth_admin;

-- 3. A new identity that is already confirmed gets exactly one profile.
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-4000-8000-000000000011', 'confirmed@example.test', now());

-- 4. An invited identity gets no profile until it confirms.
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-4000-8000-000000000012', 'invited@example.test', null);

reset role;
do $$
begin
  if (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000011') <> 1 then
    raise exception 'FAIL: a confirmed identity did not get exactly one profile';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000012') then
    raise exception 'FAIL: an unconfirmed invitee got a profile';
  end if;
  raise notice 'PASS: profiles are created for confirmed identities only';
end $$;

set role supabase_auth_admin;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-000000000012';
-- 5. Repeated confirmation: harmless, still one profile, no error.
update auth.users set email_confirmed_at = now() + interval '1 second' where id = '00000000-0000-4000-8000-000000000012';
update auth.users set email_confirmed_at = now() + interval '2 seconds' where id = '00000000-0000-4000-8000-000000000012';
reset role;

do $$
begin
  if (select count(*) from public.profiles where id = '00000000-0000-4000-8000-000000000012') <> 1 then
    raise exception 'FAIL: confirming (repeatedly) did not leave exactly one profile';
  end if;
  raise notice 'PASS: confirming creates one profile, and repeated confirmation is harmless';
end $$;

-- 6. A profile that already exists when confirmation happens is left alone.
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at)
values ('00000000-0000-4000-8000-000000000013', 'existing-profile@example.test', null);
reset role;
insert into public.profiles (id, display_name) values ('00000000-0000-4000-8000-000000000013', 'Keep me');
set role supabase_auth_admin;
update auth.users set email_confirmed_at = now() where id = '00000000-0000-4000-8000-000000000013';
reset role;
do $$
begin
  if (select display_name from public.profiles where id = '00000000-0000-4000-8000-000000000013') is distinct from 'Keep me' then
    raise exception 'FAIL: confirmation changed an existing profile';
  end if;
  raise notice 'PASS: confirmation leaves an existing profile unchanged';
end $$;

-- 7. Clearing confirmation keeps the profile.
set role supabase_auth_admin;
update auth.users set email_confirmed_at = null where id = '00000000-0000-4000-8000-000000000011';
reset role;
do $$
begin
  if not exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000011') then
    raise exception 'FAIL: clearing confirmation deleted the profile';
  end if;
  raise notice 'PASS: clearing confirmation keeps the profile';
end $$;

-- 8. Information attached at sign-up is ignored.
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values ('00000000-0000-4000-8000-000000000014', 'metadata@example.test', now(),
        '{"username": "chosen_by_signup", "display_name": "Injected", "role": "admin"}');
reset role;
do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000014'
             and (username is not null or display_name is not null)) then
    raise exception 'FAIL: sign-up metadata was copied into the profile';
  end if;
  raise notice 'PASS: sign-up metadata is ignored; only the id is copied';
end $$;

-- 9. Deleting an identity deletes its profile (Phase 1A behaviour).
set role supabase_auth_admin;
delete from auth.users where id = '00000000-0000-4000-8000-000000000014';
reset role;
do $$
begin
  if exists (select 1 from public.profiles where id = '00000000-0000-4000-8000-000000000014') then
    raise exception 'FAIL: deleting an identity left its profile behind';
  end if;
  raise notice 'PASS: deleting an identity deletes its profile';
end $$;
