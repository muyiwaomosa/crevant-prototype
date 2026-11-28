-- TEST ONLY (throwaway databases). Link in bio (20261221000000), as real
-- signed-in accounts calling the same functions the app calls.
--
--   A = ...c1e01 sets a link   B = ...c1e02 views it
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-0000000c1e0' || n)::uuid, 'pl-' || n || '@example.test', now(), '{}'
from generate_series(1, 2) n;
reset role;
update public.profiles p set username = 'pl_' || right(p.id::text, 1), display_name = 'Pl ' || right(p.id::text, 1)
where p.id::text like '00000000-0000-4000-8000-0000000c1e0_';

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-0000000c1e0' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated;

begin;
select ops.grant_member_access('00000000-0000-4000-8000-0000000c1e01', 'creator', 'pl-test');
select ops.grant_member_access('00000000-0000-4000-8000-0000000c1e02', 'fan', 'pl-test');
do $$
declare
  got text;
begin
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  -- No scheme: https:// is added. The stored value comes back.
  got := public.app_set_my_website('example.com/recipes');
  if got is distinct from 'https://example.com/recipes' then raise exception 'FAIL: a bare address was stored as %', got; end if;
  if public.app_my_website() is distinct from 'https://example.com/recipes' then raise exception 'FAIL: my own link did not read back'; end if;
  -- Setting a link never marks first-time setup done (checked as the owner of the table).
  execute 'reset role';
  if (select onboarded_at from social.profile_details where user_id = '00000000-0000-4000-8000-0000000c1e01') is not null then
    raise exception 'FAIL: setting a link marked setup done';
  end if;
  execute 'set local role authenticated';
  -- Unsafe or malformed addresses are refused.
  perform pg_temp.expect_error($q$select public.app_set_my_website('javascript:alert(1)')$q$, 'website_invalid', 'a javascript: link');
  perform pg_temp.expect_error($q$select public.app_set_my_website('data:text/html,hi')$q$, 'website_invalid', 'a data: link');
  perform pg_temp.expect_error($q$select public.app_set_my_website('ftp://example.com')$q$, 'website_invalid', 'an ftp link');
  perform pg_temp.expect_error($q$select public.app_set_my_website('https://user:pw@example.com')$q$, 'website_invalid', 'a link with a password');
  perform pg_temp.expect_error($q$select public.app_set_my_website('http://localhost')$q$, 'website_invalid', 'a link to localhost');
  perform pg_temp.expect_error($q$select public.app_set_my_website('https://exa mple.com')$q$, 'website_invalid', 'a link with a space');
  perform pg_temp.expect_error($q$select public.app_set_my_website('https://example.com/<script>')$q$, 'website_invalid', 'a link with angle brackets');
  perform pg_temp.expect_error(format('select public.app_set_my_website(%L)', 'https://example.com/' || repeat('a', 190)), 'website_invalid', 'a link over 200 characters');
  if public.app_my_website() is distinct from 'https://example.com/recipes' then raise exception 'FAIL: a refused link changed the stored one'; end if;
  got := public.app_set_my_website('http://shop.example.co.uk:8080/a?b=1#c');
  if got is distinct from 'http://shop.example.co.uk:8080/a?b=1#c' then raise exception 'FAIL: a valid http link with a port, query and fragment was refused or changed: %', got; end if;
  execute 'reset role';

  -- Another member sees it on the profile.
  perform pg_temp.as_member('2');
  execute 'set local role authenticated';
  if public.app_member_website('00000000-0000-4000-8000-0000000c1e01') is distinct from 'http://shop.example.co.uk:8080/a?b=1#c' then
    raise exception 'FAIL: another member could not see the link';
  end if;
  -- A member without a details row can add one too.
  if public.app_set_my_website('https://b.example.org') is distinct from 'https://b.example.org' then raise exception 'FAIL: a member without details could not add a link'; end if;
  execute 'reset role';

  -- Hidden by a moderator: hidden with the other details.
  update social.profile_details set hidden_at = now() where user_id = '00000000-0000-4000-8000-0000000c1e01';
  perform pg_temp.as_member('2');
  execute 'set local role authenticated';
  if public.app_member_website('00000000-0000-4000-8000-0000000c1e01') is not null then raise exception 'FAIL: a hidden profile''s link was shown'; end if;
  execute 'reset role';
  update social.profile_details set hidden_at = null where user_id = '00000000-0000-4000-8000-0000000c1e01';

  -- Removing it: empty clears the link.
  perform pg_temp.as_member('1');
  execute 'set local role authenticated';
  if public.app_set_my_website('  ') is not null or public.app_my_website() is not null then raise exception 'FAIL: an empty link did not remove it'; end if;
  execute 'reset role';

  -- Visitors can't call any of it.
  execute 'set local role anon';
  perform pg_temp.expect_error($q$select public.app_member_website('00000000-0000-4000-8000-0000000c1e01')$q$, 'permission denied', 'a visitor reading a link');
  perform pg_temp.expect_error($q$select public.app_set_my_website('https://example.com')$q$, 'permission denied', 'a visitor setting a link');
  execute 'reset role';
  raise notice 'PASS: link in bio: one optional http(s) link, set, changed and removed by its member; unsafe addresses refused; shown to members, hidden with moderated details, never to visitors';
end $$;
rollback;
