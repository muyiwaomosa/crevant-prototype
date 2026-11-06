-- TEST ONLY (throwaway databases). Username and display name rules, tested
-- as the signed-in member A, the way the app will write them.

begin;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Usernames
do $$
declare
  ok text;
  bad text;
begin
  foreach ok in array array['abc', 'maya_99', '___', 'a1_', repeat('z', 30)] loop
    update public.profiles set username = ok where id = '00000000-0000-4000-8000-000000000001';
  end loop;
  foreach bad in array array[
    'ab', repeat('z', 31), 'Alice', 'al ice', 'al-ice', 'al.ice', 'émile', 'maya!', '',
    'admin', 'administrator', 'crevant', 'support', 'help', 'staff', 'moderator', 'official',
    'root', 'system', 'api', 'app', 'auth', 'tour', 'sign_in', 'settings', 'null'
  ] loop
    begin
      update public.profiles set username = bad where id = '00000000-0000-4000-8000-000000000001';
      raise exception 'FAIL: username % was accepted', bad;
    exception when check_violation then
      null;
    end;
  end loop;
  -- Taken by B (case-insensitive by construction: only lowercase is allowed).
  begin
    update public.profiles set username = 'bee_profile' where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: duplicate username was accepted';
  exception when unique_violation then
    null;
  end;
  raise notice 'PASS: username format, length, reserved names and uniqueness are enforced';
end $$;

-- Display names
do $$
declare
  pair text[];
  bad text;
  got text;
begin
  -- input, expected stored value
  foreach pair slice 1 in array array[
    array['Ålice', 'Ålice'],
    array['山田太郎', '山田太郎'],
    array['مريم', 'مريم'],
    array[E'\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466', E'\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466'],
    array[E'José', E'José'],
    array['  spaced out  ', 'spaced out'],
    array[E'  Name​﻿', 'Name'],
    array[E'Mary Jane', E'Mary Jane'],
    array[E'\tTabbed\n', 'Tabbed'],
    array[repeat('x', 50), repeat('x', 50)],
    array[repeat(E'\U0001F331', 50), repeat(E'\U0001F331', 50)]
  ] loop
    update public.profiles set display_name = pair[1] where id = '00000000-0000-4000-8000-000000000001';
    select display_name into got from public.profiles where id = '00000000-0000-4000-8000-000000000001';
    if got is distinct from pair[2] then
      raise exception 'FAIL: display name % was stored as % (expected %)', pair[1], got, pair[2];
    end if;
  end loop;

  foreach bad in array array[
    '', '   ', E'  ', E'​​', E'‍', E'﻿', E'⁠　',
    E'a\u0007b', E'line\nbreak', E'tab\tinside', E'del\u007Fete', E'c1\u0085x\u0090',
    repeat('x', 51), repeat(E'\U0001F331', 51)
  ] loop
    begin
      update public.profiles set display_name = bad where id = '00000000-0000-4000-8000-000000000001';
      raise exception 'FAIL: display name % was accepted', bad;
    exception when check_violation then
      null;
    end;
  end loop;

  -- Clearing a display name is allowed.
  update public.profiles set display_name = null where id = '00000000-0000-4000-8000-000000000001';
  raise notice 'PASS: display names allow any language and emoji, are trimmed, and reject invisible-only, control characters and over 50 code points';
end $$;
rollback;
