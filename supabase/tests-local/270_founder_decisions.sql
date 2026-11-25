-- TEST ONLY (throwaway databases). Founder decisions of Nov 25 (20261215000000).
--
--   F = ...cd01 founder (and moderator)   C = ...cd02 creator who invites
--   P = ...cd03 another creator   N1 = ...cd04 joins through C, first follows C
--   N2 = ...cd05 joins through C, first follows P   M1 = ...cd06 moderator   M2 = ...cd07 moderator
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fd-' || n || '@example.test', now(), '{}'
from unnest(array['cd01', 'cd02', 'cd03', 'cd04', 'cd05', 'cd06', 'cd07']) n;
reset role;
update public.profiles p set username = 'fd_' || v.u, display_name = 'Fd ' || upper(v.u)
from (values ('cd01', 'f'), ('cd02', 'c'), ('cd03', 'p'), ('cd04', 'n1'), ('cd05', 'n2'), ('cd06', 'm1'), ('cd07', 'm2')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd00cd01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd00cd01', 'founder', 'fd-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'fd-test') from unnest(array['cd02', 'cd03', 'cd04', 'cd05', 'cd06', 'cd07']) n;
select ops.grant_moderator(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fd-test', 'test') from unnest(array['cd01', 'cd06', 'cd07']) n;
insert into ops.age_attestations (user_id, wording_version, source)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'v1', 'registration' from unnest(array['cd04', 'cd05']) n on conflict do nothing;
insert into ops.registrations (user_id, kind, referrer_id, cohort, account_created_at)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'referral', '00000000-0000-4000-8000-fdfdfd00cd02', 'fan', now() from unnest(array['cd04', 'cd05']) n;

create function pg_temp.expect_error(sql text, expected text, what text)
returns void language plpgsql as $$
declare got text;
begin
  begin execute sql; exception when others then got := sqlerrm; end;
  if got is null then raise exception 'FAIL: % succeeded, expected "%"', what, expected; end if;
  if got !~ expected then raise exception 'FAIL: % failed with "%", expected "%"', what, got, expected; end if;
end; $$;
grant execute on function pg_temp.expect_error(text, text, text) to authenticated, anon;
create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd00' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon;

-- 1. Referrals. N1's first follow is C (C's own audience); N2's first follow is P.
begin;
select pg_temp.as_member('cd04');
set local role authenticated;
select public.app_follow(pg_temp.g('cd02'));
select public.app_follow(pg_temp.g('cd03'));
commit;
begin;
select pg_temp.as_member('cd05');
set local role authenticated;
select public.app_follow(pg_temp.g('cd03'));
commit;

do $$
declare
  r record;
begin
  select * into r from sim.points_ledger where source_key = 'referral:' || pg_temp.g('cd04');
  if r.action is distinct from 'own_audience_referral' or r.points <> 20 or r.redeemable or r.status <> 'recognized' or r.member_id <> pg_temp.g('cd02') then
    raise exception 'FAIL: bringing someone to your own profile should be 20 recognized points, never redeemable: %', r;
  end if;
  if (select count(*) from sim.points_ledger where source_key like 'referral:' || pg_temp.g('cd04') || '%') <> 1 then
    raise exception 'FAIL: a later follow added a second referral award';
  end if;
  select * into r from sim.points_ledger where source_key = 'referral:' || pg_temp.g('cd05');
  if r.action is distinct from 'qualified_referral' or r.points <> 100 or not r.redeemable or r.status <> 'pending_review' or r.member_id <> pg_temp.g('cd02') then
    raise exception 'FAIL: a creator referring someone to another creator should earn the usual qualified referral, pending review: %', r;
  end if;
  if exists (select 1 from sim.points_ledger where action in ('qualified_referral', 'own_audience_referral') and member_id <> pg_temp.g('cd02')
             and source_key in ('referral:' || pg_temp.g('cd04'), 'referral:' || pg_temp.g('cd05'))) then
    raise exception 'FAIL: someone other than the direct referrer was rewarded (no downstream rewards)';
  end if;
  raise notice 'PASS: referring someone to your own profile earns recognition only, once; referring to another creator earns the usual reviewed referral; only the direct referrer is rewarded';
end $$;

-- 2. Moderator authority.
insert into social.posts (id, author_id, body) values (pg_temp.g('ce01'), pg_temp.g('cd07'), 'M2 posts something against the standards');
begin;
select pg_temp.as_member('cd06');
set local role authenticated;
select public.app_report('post', pg_temp.g('ce01'), 'spam', null);
do $$
begin
  perform pg_temp.expect_error(format('select public.app_mod_enforce(%L, ''warning'', ''spam'', null, null, null, false)', pg_temp.g('cd07')),
    'escalate_to_founder', 'a moderator warning another moderator');
  perform pg_temp.expect_error(format('select public.app_mod_enforce(%L, ''warning'', ''spam'', null, null, null, false)', pg_temp.g('cd01')),
    'escalate_to_founder', 'a moderator warning the founder');
  raise notice 'PASS: disciplinary action against a moderator or the founder is escalated to the founder';
end $$;
commit;
select id as fd_report from ops.content_reports where target_id = '00000000-0000-4000-8000-fdfdfd00ce01' \gset
begin;
select pg_temp.as_member('cd06');
set local role authenticated;
select public.app_mod_hide(:'fd_report', 'Spam, hidden while the founder decides on the moderator');
commit;
do $$
begin
  if (select hidden_at from social.posts where id = pg_temp.g('ce01')) is null then
    raise exception 'FAIL: a moderator could not hide another moderator''s content';
  end if;
  raise notice 'PASS: a moderator can report and hide another moderator''s content (emergency protection kept)';
end $$;
begin;
select pg_temp.as_member('cd01');
set local role authenticated;
select public.app_mod_enforce(pg_temp.g('cd07'), 'warning', 'spam', null, null, 'Founder decision on a moderator', false);
commit;
do $$
begin
  if not exists (select 1 from ops.enforcements where member_id = pg_temp.g('cd07') and level = 'warning') then
    raise exception 'FAIL: the founder could not act on a moderator';
  end if;
  raise notice 'PASS: the founder decides disciplinary action against a moderator, recorded as usual';
end $$;
