-- Staging-safe, read-only: link in bio (20261221000000).
-- Catalog reads only, plus a count reported, never failed. Skipped until applied.

\set ON_ERROR_STOP on
select to_regprocedure('public.app_set_my_website(text)') is not null as link_applied \gset
\if :link_applied

do $$
declare
  bad text[] := '{}';
  f text;
  setter text := (select prosrc from pg_proc where oid = 'public.app_set_my_website(text)'::regprocedure);
  reader text := (select prosrc from pg_proc where oid = 'public.app_member_website(uuid)'::regprocedure);
  chk text := (select pg_get_constraintdef(c.oid) from pg_constraint c
               where c.conrelid = 'social.profile_details'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) ~ 'website');
begin
  -- Members only, through the functions; visitors never.
  foreach f in array array['public.app_set_my_website(text)', 'public.app_my_website()', 'public.app_member_website(uuid)'] loop
    if has_function_privilege('anon', f, 'EXECUTE') or not has_function_privilege('authenticated', f, 'EXECUTE')
       or not (select prosecdef from pg_proc where oid = f::regprocedure) then
      bad := bad || (f || ' has the wrong access');
    end if;
  end loop;
  if has_table_privilege('authenticated', 'social.profile_details', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('anon', 'social.profile_details', 'SELECT,INSERT,UPDATE,DELETE') then
    bad := bad || 'profile details are directly readable or writable'::text;
  end if;
  -- Safe URLs only, in the table itself as well as the setter.
  if chk is null or position('https?://' in chk) = 0 or position('200' in chk) = 0 then
    bad := bad || 'the table does not hold the website to http(s) and 200 characters'::text;
  end if;
  if position('website_invalid' in setter) = 0 or position('current_member' in setter) = 0 then
    bad := bad || 'the setter does not validate, or does not write only the caller''s own row'::text;
  end if;
  -- Shown only for visible members, and hidden with the other details.
  if position('visible_members' in reader) = 0 or position('hidden_at' in reader) = 0 or position('current_member' in reader) = 0 then
    bad := bad || 'the link can be read for hidden or invisible members'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: link in bio: %', bad;
  end if;
  raise notice 'PASS: link in bio: members only, through security definer functions; http(s) only and at most 200 characters; hidden with the other details and never for members the viewer cannot see';
end $$;

do $$
begin
  raise notice 'INFO: link in bio: % member(s) have one', (select count(*) from social.profile_details where website is not null);
end $$;

\else
\echo 'Skipped 037_profile_link.sql: 20261221000000 is not applied here.'
\endif
