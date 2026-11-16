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
  foreach t in array array['ops.pilot_creators', 'ops.creator_links', 'ops.creator_link_redemptions', 'ops.acquisition_events', 'ops.invite_preview_limits'] loop
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
                                     ('ops', 'creator_links_require_accepted_creator'),
                                     ('ops', 'invitations_copy_creator_link'), ('ops', 'invitations_record_link_redemption'), ('ops', 'invite_preview_hit'),
                                     ('waitlist_api', 'submit_v2'), ('waitlist_api', 'invite_preview'),
                                     ('waitlist_api', 'admin_acquisition_summary'), ('waitlist_api', 'admin_accept_creator'),
                                     ('waitlist_api', 'admin_set_creator_status'), ('waitlist_api', 'admin_set_creator_public_name'),
                                     ('waitlist_api', 'admin_issue_creator_link'), ('waitlist_api', 'admin_revoke_creator_link'),
                                     ('waitlist_api', 'admin_purge_acquisition_events'))
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
             and column_name ~* '(email|user|account|ip|address|name|handle|introducer|text|hash|key)') then
    raise exception 'FAIL: acquisition events hold personal data';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'ops'
             and table_name in ('pilot_creators', 'creator_links', 'creator_link_redemptions', 'acquisition_events')
             and column_name ~* '(point|cp|reward|payout|revenue|amount|balance|earn|money|cash|follower)') then
    raise exception 'FAIL: acquisition data has a points, money or follower column';
  end if;

  -- The new entry points run with their owner's rights and only for their own role.
  if not has_function_privilege('waitlist_writer', 'waitlist_api.submit_v2(text, text[], text, text, text, text, boolean, boolean, text, text, text, text, boolean, text)', 'EXECUTE')
     or not has_function_privilege('waitlist_admin', 'waitlist_api.admin_acquisition_summary()', 'EXECUTE') then
    raise exception 'FAIL: a waitlist login role cannot run its new entry point';
  end if;
  -- Founder/admin-controlled issuance: only the admin login issues or revokes
  -- links; not server code, not the public login.
  foreach r in array array['anon', 'authenticated', 'service_role', 'waitlist_writer', 'waitlist_admin'] loop
    if has_function_privilege(r, 'ops.create_creator_link(uuid, integer, text)', 'EXECUTE') then
      raise exception 'FAIL: % can create links directly', r;
    end if;
  end loop;
  foreach t in array array['waitlist_api.admin_accept_creator(uuid, text[])', 'waitlist_api.admin_set_creator_status(uuid, text)',
                           'waitlist_api.admin_set_creator_public_name(uuid, text)', 'waitlist_api.admin_issue_creator_link(uuid, integer, text)',
                           'waitlist_api.admin_revoke_creator_link(text)', 'waitlist_api.admin_purge_acquisition_events(integer)'] loop
    if not has_function_privilege('waitlist_admin', t, 'EXECUTE') then
      raise exception 'FAIL: the admin login cannot run %', t;
    end if;
    foreach r in array array['anon', 'authenticated', 'service_role', 'waitlist_writer'] loop
      if has_function_privilege(r, t, 'EXECUTE') then
        raise exception 'FAIL: % can run %', r, t;
      end if;
    end loop;
  end loop;
  -- The public preview is the server function's alone.
  if not has_function_privilege('waitlist_writer', 'waitlist_api.invite_preview(text, text)', 'EXECUTE') then
    raise exception 'FAIL: the server function cannot preview invitations';
  end if;
  foreach r in array array['anon', 'authenticated', 'service_role', 'waitlist_admin'] loop
    if has_function_privilege(r, 'waitlist_api.invite_preview(text, text)', 'EXECUTE') then
      raise exception 'FAIL: % can preview invitations', r;
    end if;
  end loop;
  -- A shown name needs the creator's recorded agreement and a safe format.
  if (select count(*) from pg_constraint where conrelid = 'ops.pilot_creators'::regclass
      and conname in ('pilot_creators_public_name_agreed', 'pilot_creators_public_name_format')) <> 2 then
    raise exception 'FAIL: public names are not limited to agreed, safe display names';
  end if;
  -- Event times are kept to the hour (no exact timestamps to match against entries).
  if not exists (select 1 from pg_constraint where conrelid = 'ops.acquisition_events'::regclass and conname = 'acquisition_events_hourly') then
    raise exception 'FAIL: acquisition events may keep exact times';
  end if;
  -- No typed creator name or handle anywhere in the waitlist.
  if exists (select 1 from pg_attribute where attrelid = 'ops.waitlist'::regclass and not attisdropped
             and attname ~* '(introducer|reported|handle)') then
    raise exception 'FAIL: the waitlist stores a typed creator name or handle';
  end if;
  -- No completed follow can be recorded before real-account follows exist.
  if not exists (select 1 from pg_constraint where conrelid = 'ops.creator_link_redemptions'::regclass
                 and conname = 'creator_link_redemptions_pending_until_follows')
     or to_regprocedure('ops.record_invite_follow_decision(uuid, text)') is not null
     or exists (select 1 from ops.creator_link_redemptions where follow_decision <> 'pending') then
    raise exception 'FAIL: an invitation follow decision can be recorded before real follows exist';
  end if;
  -- The original waitlist entry point is untouched, so this can be rolled back on its own.
  if (select prosrc from pg_proc where oid = 'ops.join_waitlist(text, text[], text, text, text, text, boolean, boolean, text, text, text)'::regprocedure) ~ 'join_waitlist_v2' then
    raise exception 'FAIL: ops.join_waitlist was redefined by the acquisition migration';
  end if;

  raise notice 'PASS: creator acquisition data is private, anonymous where measured, and kept apart from points and money';
end $$;
