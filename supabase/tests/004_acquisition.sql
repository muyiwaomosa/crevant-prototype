-- Staging-safe, read-only checks for creator acquisition. Also run by the
-- staging deploy workflow. Skipped entirely until the migration is applied.

do $$
declare
  t text;
  r text;
begin
  if to_regclass('ops.creator_links') is null then
    raise notice 'SKIP: creator acquisition is not applied here';
    return;
  end if;

  -- Private tables, row level security on, no API or waitlist role access.
  foreach t in array array['ops.pilot_creators', 'ops.creator_links', 'ops.creator_link_redemptions', 'ops.acquisition_events'] loop
    if not (select relrowsecurity from pg_class where oid = t::regclass) then
      raise exception 'FAIL: % has row level security off', t;
    end if;
    if exists (select 1 from pg_policies where schemaname || '.' || tablename = t) then
      raise exception 'FAIL: % has a row level security policy (none are allowed)', t;
    end if;
    foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
      if has_table_privilege(r, t, 'SELECT') or has_table_privilege(r, t, 'INSERT')
         or has_table_privilege(r, t, 'UPDATE') or has_table_privilege(r, t, 'DELETE') then
        raise exception 'FAIL: % has privileges on %', r, t;
      end if;
    end loop;
  end loop;

  -- Every new function has a fixed, empty search path.
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where (n.nspname, p.proname) in (('ops', 'create_creator_link'), ('ops', 'resolve_creator_link'), ('ops', 'join_waitlist_v2'),
                                     ('ops', 'record_invite_follow_decision'), ('ops', 'creator_links_require_accepted_creator'),
                                     ('ops', 'invitations_copy_creator_link'), ('ops', 'invitations_record_link_redemption'))
      and not coalesce(p.proconfig, '{}') @> array['search_path=""']
  ) then
    raise exception 'FAIL: an acquisition function has no fixed empty search path';
  end if;

  -- Only accepted creators can hold active links; attribution follows invitations.
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.creator_links'::regclass
                 and tgname = 'creator_links_require_accepted_creator' and tgenabled <> 'D') then
    raise exception 'FAIL: links are not limited to accepted creators';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'ops.invitations'::regclass
                 and tgname = 'invitations_record_link_redemption' and tgenabled <> 'D') then
    raise exception 'FAIL: accepted invitations do not record link redemptions';
  end if;

  -- Events hold no personal data; nothing here holds points, rewards or money.
  if exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'acquisition_events'
             and column_name ~* '(email|user|account|ip|address|name|handle|introducer|text)') then
    raise exception 'FAIL: acquisition events hold personal data';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'ops'
             and table_name in ('pilot_creators', 'creator_links', 'creator_link_redemptions', 'acquisition_events')
             and column_name ~* '(point|cp|reward|payout|revenue|amount|balance|earn|money|cash|follower)') then
    raise exception 'FAIL: acquisition data has a points, money or follower column';
  end if;

  -- The new entry points run with their owner's rights and only for their own role.
  if not has_function_privilege('waitlist_writer', 'waitlist_api.submit_v2(text, text[], text, text, text, text, boolean, boolean, text, text, text, text, boolean, text, text)', 'EXECUTE')
     or not has_function_privilege('waitlist_admin', 'waitlist_api.admin_acquisition_summary()', 'EXECUTE') then
    raise exception 'FAIL: a waitlist login role cannot run its new entry point';
  end if;
  raise notice 'PASS: creator acquisition data is private, anonymous where measured, and kept apart from points and money';
end $$;
