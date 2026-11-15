-- TEST ONLY (throwaway databases). Creator acquisition through the real entry
-- points: links only for accepted creators, safe failure for unusable codes,
-- self-reported attribution kept apart from verified invitations, attribution
-- carried from waitlist to invitation to account, the person's own follow
-- decision, anonymous events, and what each role can NOT do.
-- Everything happens in one transaction that is rolled back.

begin;

create function pg_temp.k(seed text) returns text language sql as $$ select encode(sha256(convert_to(seed, 'UTF8')), 'hex') $$;
create function pg_temp.submit2(p_email text, p_intent text default null, p_introduced boolean default null,
                                p_introducer text default null, p_ref text default null, p_source text default null,
                                p_client text default 'client-a')
returns text language plpgsql as $$
declare
  r text;
begin
  set local role waitlist_writer;
  r := waitlist_api.submit_v2(p_email, '{}', null, null, null, p_source, true, true, 'notice-2026-11',
                              pg_temp.k('email:' || lower(btrim(p_email))), pg_temp.k(p_client),
                              p_intent, p_introduced, p_introducer, p_ref);
  reset role;
  return r;
end $$;
create function pg_temp.admin_text(call text) returns text language plpgsql as $$
declare r text;
begin
  set local role waitlist_admin;
  execute 'select ' || call into r;
  reset role;
  return r;
end $$;
create function pg_temp.preview(p_code text, p_client text default 'visitor-a') returns jsonb language plpgsql as $$
declare r jsonb;
begin
  set local role waitlist_writer;
  r := waitlist_api.invite_preview(p_code, pg_temp.k(p_client));
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

-- Two creators, one fan. (The profile trigger makes their profiles.)
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-0000-0000-0000000000c1', 'priya@example.com', now()),
  ('00000000-0000-0000-0000-0000000000c2', 'paused@example.com', now()),
  ('00000000-0000-0000-0000-0000000000f1', 'ana@example.com', now());

-- 0. Nobody but server code can see or change any of it.
do $$
declare
  r text;
  t text;
begin
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'waitlist_admin'] loop
    foreach t in array array['ops.pilot_creators', 'ops.creator_links', 'ops.creator_link_redemptions', 'ops.acquisition_events', 'ops.invite_preview_limits'] loop
      execute format('set local role %I', r);
      begin
        execute format('select count(*) from %s', t);
        raise exception 'FAIL: % could read %', r, t;
      exception when insufficient_privilege then null;
      end;
      reset role;
    end loop;
    execute format('set local role %I', r);
    begin
      perform ops.resolve_creator_link('0123456789abcdef0123');
      raise exception 'FAIL: % could resolve a creator link', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform ops.create_creator_link('00000000-0000-0000-0000-0000000000c1');
      raise exception 'FAIL: % could create a creator link', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform ops.record_invite_follow_decision('00000000-0000-0000-0000-0000000000f1', 'followed');
      raise exception 'FAIL: % could record a follow decision', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  foreach r in array array['anon', 'authenticated', 'waitlist_admin', 'service_role'] loop
    execute format('set local role %I', r);
    begin
      perform waitlist_api.submit_v2('a@example.com', '{}', null, null, null, null, true, true, 'v1', repeat('a', 64), repeat('b', 64), null, null, null, null);
      raise exception 'FAIL: % could call waitlist_api.submit_v2', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'service_role'] loop
    execute format('set local role %I', r);
    begin
      perform waitlist_api.admin_acquisition_summary();
      raise exception 'FAIL: % could read the acquisition summary', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  -- Issuing and revoking links, and accepting creators, is the admin login's
  -- alone; the public preview is the server function's alone.
  foreach r in array array['anon', 'authenticated', 'waitlist_writer', 'service_role'] loop
    execute format('set local role %I', r);
    begin
      perform waitlist_api.admin_issue_creator_link('00000000-0000-0000-0000-0000000000c1');
      raise exception 'FAIL: % could issue a link', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform waitlist_api.admin_revoke_creator_link('0123456789abcdef0123');
      raise exception 'FAIL: % could revoke a link', r;
    exception when insufficient_privilege then null;
    end;
    begin
      perform waitlist_api.admin_accept_creator('00000000-0000-0000-0000-0000000000f1');
      raise exception 'FAIL: % could accept a creator', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  foreach r in array array['anon', 'authenticated', 'waitlist_admin', 'service_role'] loop
    execute format('set local role %I', r);
    begin
      perform waitlist_api.invite_preview('0123456789abcdef0123', repeat('a', 64));
      raise exception 'FAIL: % could call the invitation preview', r;
    exception when insufficient_privilege then null;
    end;
    reset role;
  end loop;
  set local role service_role;
  begin
    perform ops.create_creator_link('00000000-0000-0000-0000-0000000000c1');
    raise exception 'FAIL: server code could create a link without the admin';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: acquisition data is reachable by server code only, and links are issued by the admin only';
end $$;

-- 1. Off by default: the new entry point stores nothing while the switch is off.
do $$
begin
  if pg_temp.submit2('closed@example.com', 'discover') <> 'closed' then
    raise exception 'FAIL: submit_v2 accepted a signup while the waitlist is off';
  end if;
  if pg_temp.preview('0123456789abcdef0123') <> '{"status": "closed"}'::jsonb then
    raise exception 'FAIL: the invitation preview answered while the waitlist is off';
  end if;
  if exists (select 1 from ops.waitlist) or exists (select 1 from ops.acquisition_events)
     or exists (select 1 from ops.waitlist_rate_limits) or exists (select 1 from ops.invite_preview_limits) then
    raise exception 'FAIL: something was stored while the switch is off';
  end if;
  raise notice 'PASS: submit_v2 is closed by default and stores nothing';
end $$;

-- Open the waitlist for the rest of this (rolled back) test.
select pg_temp.admin($q$waitlist_api.admin_set_notice_version('notice-2026-11')$q$);
select pg_temp.admin('waitlist_api.admin_open()');

-- 2. Only accepted creators can hold an active link.
do $$
declare
  v_code text;
begin
  begin
    perform ops.create_creator_link('00000000-0000-0000-0000-0000000000c1');
    raise exception 'FAIL: a link was created for someone not accepted into the pilot';
  exception when check_violation then null;
  end;
  insert into ops.pilot_creators (user_id, categories) values ('00000000-0000-0000-0000-0000000000c1', array['fitness', 'wellness']);
  insert into ops.pilot_creators (user_id, status) values ('00000000-0000-0000-0000-0000000000c2', 'paused');
  begin
    perform ops.create_creator_link('00000000-0000-0000-0000-0000000000c2');
    raise exception 'FAIL: a paused creator was given an active link';
  exception when check_violation then null;
  end;
  begin
    insert into ops.pilot_creators (user_id, categories) values ('00000000-0000-0000-0000-0000000000f1', array['astrology']);
    raise exception 'FAIL: an unknown category was accepted';
  exception when check_violation then null;
  end;
  if pg_temp.admin_text($q$waitlist_api.admin_accept_creator('00000000-0000-0000-0000-00000000dead')$q$) <> 'no_such_account' then
    raise exception 'FAIL: a creator was accepted without an account';
  end if;
  begin
    perform pg_temp.admin_text($q$waitlist_api.admin_issue_creator_link('00000000-0000-0000-0000-0000000000c1', 366)$q$);
    raise exception 'FAIL: a link longer than a year was issued';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;
  v_code := pg_temp.admin_text($q$waitlist_api.admin_issue_creator_link('00000000-0000-0000-0000-0000000000c1', 30, 'pilot_wave_1')$q$);
  if (select expires_at::date - created_at::date from ops.creator_links where code = v_code) <> 30 then
    raise exception 'FAIL: the admin''s expiry was not used';
  end if;
  -- The default is 90 days.
  if (select expires_at::date - created_at::date from ops.creator_links
      where code = pg_temp.admin_text($q$waitlist_api.admin_issue_creator_link('00000000-0000-0000-0000-0000000000c1')$q$)) <> 90 then
    raise exception 'FAIL: the default link expiry is not 90 days';
  end if;
  delete from ops.creator_links where code <> v_code;
  if v_code !~ '^[0-9a-f]{20}$' then
    raise exception 'FAIL: link code is not 20 random hex characters: %', v_code;
  end if;
  if v_code like '%' || replace('00000000-0000-0000-0000-0000000000c1', '-', '') || '%' then
    raise exception 'FAIL: the link code contains the creator id';
  end if;
  raise notice 'PASS: only accepted creators get links, and codes reveal nothing about them';
end $$;

-- 3. Unusable codes fail safely, each with a clear status and no id.
do $$
declare
  v_code text := (select code from ops.creator_links limit 1);
  r record;
begin
  select * into r from ops.resolve_creator_link(v_code);
  if r.status <> 'valid' or r.link_id is null or r.creator_id <> '00000000-0000-0000-0000-0000000000c1' then
    raise exception 'FAIL: a valid link did not resolve: %', r;
  end if;
  foreach v_code in array array['', 'not-a-code', '0123456789abcdef0123', upper((select code from ops.creator_links limit 1)), null] loop
    select * into r from ops.resolve_creator_link(v_code);
    if r.status <> 'unknown' or r.link_id is not null then
      raise exception 'FAIL: % resolved as %', coalesce(v_code, 'null'), r;
    end if;
  end loop;
  raise notice 'PASS: unknown or malformed codes resolve to nothing';
end $$;

-- 4. The waitlist: intent, self-reported attribution and verified links.
do $$
declare
  v_code text := (select code from ops.creator_links limit 1);
  w record;
begin
  if pg_temp.submit2('fan1@example.com', 'discover', true, '@priyaruns', v_code, 'ig_bio', 'c1') <> 'ok' then
    raise exception 'FAIL: a valid signup through a creator link was refused';
  end if;
  select * into w from ops.waitlist where email = 'fan1@example.com';
  if w.intent <> 'discover' or w.introduced_by_creator is not true or w.introducer_reported <> '@priyaruns'
     or w.creator_link_id <> (select id from ops.creator_links where code = v_code) or w.source <> 'ig_bio' then
    raise exception 'FAIL: the signup did not keep its answers and verified link: %', w;
  end if;

  -- A self-reported name alone is NOT a verified referral.
  if pg_temp.submit2('fan2@example.com', 'both', true, 'Priya Raman', null, null, 'c2') <> 'ok' then
    raise exception 'FAIL: a self-reported introduction was refused';
  end if;
  if (select creator_link_id from ops.waitlist where email = 'fan2@example.com') is not null then
    raise exception 'FAIL: a typed name became a verified link';
  end if;

  -- An unusable code is ignored and the signup still works, unattributed.
  if pg_temp.submit2('fan3@example.com', 'create', null, null, 'ffffffffffffffffffff', null, 'c3') <> 'ok' then
    raise exception 'FAIL: a signup with an unknown code was refused';
  end if;
  if (select creator_link_id from ops.waitlist where email = 'fan3@example.com') is not null then
    raise exception 'FAIL: an unknown code was attributed';
  end if;

  -- Bad answers are refused and nothing is stored.
  if pg_temp.submit2('bad1@example.com', 'influencer', null, null, null, null, 'c4') <> 'invalid'
     or pg_temp.submit2('bad2@example.com', null, false, '@priyaruns', null, null, 'c4') <> 'invalid'
     or pg_temp.submit2('bad3@example.com', null, null, '@priyaruns', null, null, 'c4') <> 'invalid'
     or pg_temp.submit2('bad4@example.com', null, true, 'https://evil.example/x', null, null, 'c5') <> 'invalid'
     or pg_temp.submit2('bad5@example.com', null, true, 'priya@example.com', null, null, 'c5') <> 'invalid'
     or pg_temp.submit2('bad6@example.com', null, true, 'call 07700900123', null, null, 'c5') <> 'invalid'
     or pg_temp.submit2('bad7@example.com', null, true, 'priya.com', null, null, 'c6') <> 'invalid'
     or pg_temp.submit2('bad8@example.com', null, true, repeat('a', 61), null, null, 'c6') <> 'invalid'
     or pg_temp.submit2('bad9@example.com', null, true, '<script>', null, null, 'c6') <> 'invalid' then
    raise exception 'FAIL: an invalid intent or introducer was accepted';
  end if;
  if exists (select 1 from ops.waitlist where email like 'bad%') then
    raise exception 'FAIL: an invalid signup was stored';
  end if;

  -- A repeat submission changes nothing, attribution included.
  if pg_temp.submit2('fan2@example.com', 'create', true, 'Someone Else', v_code, null, 'c7') <> 'ok' then
    raise exception 'FAIL: a repeat signup did not answer ok';
  end if;
  if (select (intent, introducer_reported, creator_link_id) from ops.waitlist where email = 'fan2@example.com')
     is distinct from ('both'::text, 'Priya Raman'::text, null::uuid) then
    raise exception 'FAIL: a repeat signup changed an existing entry';
  end if;

  -- Names in any language are fine.
  if pg_temp.submit2('fan4@example.com', null, true, 'Zoë O’Brien-Nakamura', null, null, 'c8') <> 'ok' then
    raise exception 'FAIL: an ordinary international name was refused';
  end if;

  -- The first entry point still works and leaves the new answers empty.
  set local role waitlist_writer;
  perform waitlist_api.submit('old@example.com', '{}', null, null, null, null, true, true, 'notice-2026-11',
                              pg_temp.k('email:old@example.com'), pg_temp.k('c9'));
  reset role;
  if (select (intent, introduced_by_creator, creator_link_id) from ops.waitlist where email = 'old@example.com')
     is distinct from (null::text, null::boolean, null::uuid) then
    raise exception 'FAIL: the first entry point stored new answers';
  end if;
  -- It is the waitlist migration's own code, untouched: it records no acquisition event.
  if (select count(*) from ops.acquisition_events where event = 'waitlist_signup') <> 4 then
    raise exception 'FAIL: unexpected signup events after the first entry point';
  end if;
  raise notice 'PASS: intent, self-reported and verified attribution are stored separately and validated';
end $$;

-- 5. Expired, revoked and inactive-creator links stop attributing at once.
do $$
declare
  v_code text := (select code from ops.creator_links limit 1);
  v_status text;
begin
  if pg_temp.admin_text(format('waitlist_api.admin_revoke_creator_link(%L)', v_code)) <> 'revoked' then
    raise exception 'FAIL: the admin could not revoke a link';
  end if;
  if (select status from ops.resolve_creator_link(v_code)) <> 'revoked' then
    raise exception 'FAIL: a revoked link still resolves';
  end if;
  if pg_temp.submit2('late1@example.com', null, null, null, v_code, null, 'd1') <> 'ok' then
    raise exception 'FAIL: a signup with a revoked link was refused';
  end if;
  if not exists (select 1 from ops.waitlist where email = 'late1@example.com' and creator_link_id is null) then
    raise exception 'FAIL: a revoked link attributed a signup';
  end if;
  -- Revocation is explicit and final.
  begin
    update ops.creator_links set revoked_at = null where code = v_code;
    raise exception 'FAIL: a revoked link was restored';
  exception when check_violation then null;
  end;
  if pg_temp.admin_text(format('waitlist_api.admin_revoke_creator_link(%L)', v_code)) <> 'already_revoked'
     or pg_temp.admin_text($q$waitlist_api.admin_revoke_creator_link('ffffffffffffffffffff')$q$) <> 'unknown' then
    raise exception 'FAIL: revoking an unknown or revoked link did not say so';
  end if;
  -- A new link for the rest of the test; pausing the creator stops it at once.
  v_code := pg_temp.admin_text($q$waitlist_api.admin_issue_creator_link('00000000-0000-0000-0000-0000000000c1', 30)$q$);
  if pg_temp.admin_text($q$waitlist_api.admin_set_creator_status('00000000-0000-0000-0000-0000000000c1', 'paused')$q$) <> 'paused' then
    raise exception 'FAIL: the admin could not pause a creator';
  end if;
  if (select status from ops.resolve_creator_link(v_code)) <> 'creator_inactive' then
    raise exception 'FAIL: a paused creator''s link still resolves';
  end if;
  perform pg_temp.admin_text($q$waitlist_api.admin_set_creator_status('00000000-0000-0000-0000-0000000000c1', 'accepted')$q$);
  update ops.creator_links set created_at = now() - interval '40 days', expires_at = now() - interval '1 day' where code = v_code;
  if (select status from ops.resolve_creator_link(v_code)) <> 'expired' then
    raise exception 'FAIL: an expired link still resolves';
  end if;
  update ops.creator_links set expires_at = now() + interval '30 days' where code = v_code;
  raise notice 'PASS: revoked, expired and inactive-creator links fail safely';
end $$;

-- 6. Attribution carries through invitation and account creation, and the
--    follow is only ever the person's own decision.
do $$
declare
  v_link uuid := (select creator_link_id from ops.waitlist where email = 'fan1@example.com');
  v_inv uuid;
begin
  -- Invitations still need a verified address.
  update ops.waitlist set email_verified_at = now() where email = 'fan1@example.com';
  insert into ops.invitations (email, expires_at) values ('fan1@example.com', now() + interval '7 days') returning id into v_inv;
  if (select creator_link_id from ops.invitations where id = v_inv) is distinct from v_link then
    raise exception 'FAIL: the invitation did not carry the verified link';
  end if;

  insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000f2', 'fan1@example.com', now());
  update ops.invitations set accepted_at = now(), accepted_user_id = '00000000-0000-0000-0000-0000000000f2' where id = v_inv;

  if (select (link_id, creator_id, follow_decision) from ops.creator_link_redemptions where user_id = '00000000-0000-0000-0000-0000000000f2')
     is distinct from (v_link, '00000000-0000-0000-0000-0000000000c1'::uuid, 'pending'::text) then
    raise exception 'FAIL: accepting the invitation did not record a pending redemption';
  end if;

  if ops.record_invite_follow_decision('00000000-0000-0000-0000-0000000000f2', 'followed') <> 'followed'
     or ops.record_invite_follow_decision('00000000-0000-0000-0000-0000000000f2', 'declined') <> 'unchanged' then
    raise exception 'FAIL: the follow decision was not recorded once, by the person';
  end if;
  begin
    perform ops.record_invite_follow_decision('00000000-0000-0000-0000-0000000000f2', 'auto');
    raise exception 'FAIL: an unknown decision was accepted';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
  end;

  -- No new table or column connects attribution to Connection Points, rewards, money or follows.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'ops' and table_name in ('pilot_creators', 'creator_links', 'creator_link_redemptions', 'acquisition_events')
      and column_name ~* '(point|cp|reward|payout|revenue|amount|balance|earn|money|cash|follower)'
  ) then
    raise exception 'FAIL: acquisition data has a points, money or follower column';
  end if;
  raise notice 'PASS: attribution flows from waitlist to account; following stays the person''s own choice';
end $$;

-- 7. Events are anonymous counts, and the summary shows counts only.
do $$
declare
  s jsonb;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'ops' and table_name = 'acquisition_events'
      and column_name ~* '(email|user|account|ip|address|name|handle|introducer|text)'
  ) then
    raise exception 'FAIL: acquisition events hold personal data';
  end if;
  if (select count(*) from ops.acquisition_events where event = 'waitlist_signup') <> 5
     or (select count(*) from ops.acquisition_events where event = 'waitlist_signup' and self_reported_referral) <> 3
     or (select count(*) from ops.acquisition_events where event = 'waitlist_signup' and creator_link_id is not null) <> 1
     or (select count(*) from ops.acquisition_events where event = 'invitation_accepted') <> 1
     or (select count(*) from ops.acquisition_events where event = 'invite_follow_confirmed') <> 1 then
    raise exception 'FAIL: unexpected event counts: %', (select jsonb_agg(e) from ops.acquisition_events e);
  end if;
  s := pg_temp.admin('waitlist_api.admin_acquisition_summary()');
  if s::text ~* '(@example\.com|priya|someone|0000000000)' then
    raise exception 'FAIL: the summary exposes an address, name or id: %', s;
  end if;
  if (s->>'verified_link_signups')::int <> 1 or (s->>'self_reported_with_name')::int <> 3 or (s->>'accepted_creators')::int <> 1 then
    raise exception 'FAIL: unexpected summary: %', s;
  end if;
  raise notice 'PASS: events and the summary are anonymous counts';
end $$;

-- 9. The public invitation preview: a usable link shows only the name its
--    creator agreed to; every unusable link looks the same; visits are
--    counted anonymously, at most once per visitor per link per day, and
--    kept apart from signups and follows.
do $$
declare
  v_creator uuid := '00000000-0000-0000-0000-0000000000c1';
  v_code text;
  v_old text := (select code from ops.creator_links where revoked_at is not null limit 1);
  v_link uuid;
  p jsonb;
  s jsonb;
  i int;
begin
  v_code := pg_temp.admin_text($q$waitlist_api.admin_issue_creator_link('00000000-0000-0000-0000-0000000000c1', 30, 'preview_test')$q$);
  v_link := (select id from ops.creator_links where code = v_code);

  -- No agreed name yet: valid, but nameless.
  p := pg_temp.preview(v_code);
  if p <> '{"status": "ok", "invite": "valid", "name": null}'::jsonb then
    raise exception 'FAIL: unexpected preview without a public name: %', p;
  end if;

  -- A name needs a safe format, and is shown only once agreed.
  begin
    perform pg_temp.admin_text($q$waitlist_api.admin_set_creator_public_name('00000000-0000-0000-0000-0000000000c1', 'priya.com')$q$);
    raise exception 'FAIL: a web address was accepted as a public name';
  exception when check_violation then null;
  end;
  if pg_temp.admin_text($q$waitlist_api.admin_set_creator_public_name('00000000-0000-0000-0000-0000000000c1', 'Priya Raman')$q$) <> 'set' then
    raise exception 'FAIL: the admin could not record the agreed public name';
  end if;
  if (select public_name_agreed_at from ops.pilot_creators where user_id = v_creator) is null then
    raise exception 'FAIL: the agreed public name was not recorded with its time';
  end if;
  p := pg_temp.preview(v_code, 'visitor-b');
  if p <> '{"status": "ok", "invite": "valid", "name": "Priya Raman"}'::jsonb then
    raise exception 'FAIL: unexpected preview: %', p;
  end if;
  if p::text ~* ('(00000000|priya@|example\.com|fitness|accepted|' || v_creator::text || ')') then
    raise exception 'FAIL: the preview exposes private creator details: %', p;
  end if;

  -- Unknown, malformed, revoked, expired and paused links all look the same.
  foreach v_old in array array['ffffffffffffffffffff', 'not-a-code', '', v_old] loop
    if pg_temp.preview(v_old, 'visitor-c') <> '{"status": "ok", "invite": "unavailable"}'::jsonb then
      raise exception 'FAIL: an unusable link (%) said more than unavailable', v_old;
    end if;
  end loop;
  perform pg_temp.admin_text($q$waitlist_api.admin_set_creator_status('00000000-0000-0000-0000-0000000000c1', 'paused')$q$);
  if pg_temp.preview(v_code, 'visitor-c') <> '{"status": "ok", "invite": "unavailable"}'::jsonb then
    raise exception 'FAIL: a paused creator''s link still previews';
  end if;
  perform pg_temp.admin_text($q$waitlist_api.admin_set_creator_status('00000000-0000-0000-0000-0000000000c1', 'accepted')$q$);

  -- Visits: one per visitor per link per day, however often they reload;
  -- only usable links count; the events say nothing about the visitor.
  for i in 1..5 loop perform pg_temp.preview(v_code, 'visitor-a'); end loop;
  if (select count(*) from ops.acquisition_events where event = 'creator_link_visit' and creator_link_id = v_link) <> 2 then
    raise exception 'FAIL: expected 2 visits (visitors a and b, however often a reloads), got %',
      (select count(*) from ops.acquisition_events where event = 'creator_link_visit' and creator_link_id = v_link);
  end if;
  if exists (select 1 from ops.acquisition_events where event = 'creator_link_visit' and creator_link_id is null) then
    raise exception 'FAIL: an unusable link counted as a visit';
  end if;

  -- A visit is not a signup: only joining the waitlist through the link counts as one.
  if pg_temp.submit2('visitor@example.com', 'discover', null, null, v_code, null, 'visitor-a') <> 'ok' then
    raise exception 'FAIL: signup through a previewed link was refused';
  end if;
  s := pg_temp.admin('waitlist_api.admin_acquisition_summary()');
  if not (s->'links') @> jsonb_build_array(jsonb_build_object('link', left(v_code, 6), 'campaign', 'preview_test', 'state', 'active',
            'visits', 2, 'signups', 1, 'accounts', 0, 'follows_confirmed', 0, 'follows_declined', 0)) then
    raise exception 'FAIL: the per-link funnel is wrong: %', s->'links';
  end if;
  if s::text ~ v_code or s::text ~* 'priya' then
    raise exception 'FAIL: the summary exposes a full link code or a creator name';
  end if;

  -- Rate limited per visitor.
  for i in 1..40 loop p := pg_temp.preview('ffffffffffffffffffff', 'busy-visitor'); end loop;
  if p <> '{"status": "rate_limited"}'::jsonb then
    raise exception 'FAIL: the preview is not rate limited: %', p;
  end if;

  -- Withdrawing agreement removes the name at once.
  if pg_temp.admin_text($q$waitlist_api.admin_set_creator_public_name('00000000-0000-0000-0000-0000000000c1', null)$q$) <> 'cleared' then
    raise exception 'FAIL: the public name could not be cleared';
  end if;
  if pg_temp.preview(v_code, 'visitor-d')->>'name' is not null then
    raise exception 'FAIL: a withdrawn public name is still shown';
  end if;
  -- The preview's limits hold salted hashes only, never a link id or code.
  if exists (select 1 from ops.invite_preview_limits where bucket ~ v_link::text or bucket ~ v_code) then
    raise exception 'FAIL: the preview limits store a link id or code';
  end if;
  raise notice 'PASS: the invitation preview shows only an agreed name, unusable links look alike, and visits are counted apart from signups';
end $$;

-- 8. Deleting a waitlist entry removes the self-reported name with it.
do $$
begin
  perform ops.waitlist_delete((select id from ops.waitlist where email = 'fan2@example.com'));
  if exists (select 1 from ops.waitlist where introducer_reported = 'Priya Raman') then
    raise exception 'FAIL: the self-reported name survived deletion';
  end if;
  raise notice 'PASS: deletion removes the self-reported name';
end $$;

rollback;
