-- TEST ONLY (throwaway databases). The deletion register (20261216000000).
--
--   F = ...de01 founder   A = ...de02 member who asks to be deleted
--   B = ...de03 member who deletes a post and keeps a comment
\set ON_ERROR_STOP on

set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'dg-' || n || '@example.test', now(), '{}'
from unnest(array['de01', 'de02', 'de03']) n;
reset role;
update public.profiles p set username = 'dg_' || v.u, display_name = 'Dg ' || upper(v.u)
from (values ('de01', 'f'), ('de02', 'a'), ('de03', 'b')) v(n, u)
where p.id = ('00000000-0000-4000-8000-fdfdfd00' || v.n)::uuid;
update ops.member_launch_settings set founder_user_id = '00000000-0000-4000-8000-fdfdfd00de01' where id;
select ops.grant_member_access('00000000-0000-4000-8000-fdfdfd00de01', 'founder', 'dg-test');
select ops.grant_member_access(('00000000-0000-4000-8000-fdfdfd00' || n)::uuid, 'fan', 'dg-test') from unnest(array['de02', 'de03']) n;

create function pg_temp.g(n text) returns uuid language sql immutable as $$ select ('00000000-0000-4000-8000-fdfdfd00' || n)::uuid $$;
grant execute on function pg_temp.g(text) to authenticated, anon;
create function pg_temp.as_member(n text) returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-fdfdfd00' || n || '","role":"authenticated"}', true) $$;
grant execute on function pg_temp.as_member(text) to authenticated, anon;

insert into social.posts (id, author_id, body) values
  (pg_temp.g('ee01'), pg_temp.g('de03'), 'A post B deletes'),
  (pg_temp.g('ee02'), pg_temp.g('de02'), 'A post by A');
insert into social.comments (id, post_id, author_id, body) values (pg_temp.g('ee03'), pg_temp.g('ee02'), pg_temp.g('de03'), 'A comment B keeps');

create temporary table dg_start as select coalesce(max(id), 0) as id from ops.deletion_register;
grant select on dg_start to authenticated;

-- 1. A member deletes their own post: one row, in the same transaction.
begin;
select pg_temp.as_member('de03');
set local role authenticated;
select public.app_delete_post(pg_temp.g('ee01'));
commit;

-- 2. A deletion that fails leaves no row (it rolls back with the change).
do $$
begin
  begin
    update social.comments set deleted_at = now() where id = pg_temp.g('ee03');
    raise exception 'simulated failure after the change';
  exception when others then null;
  end;
end $$;

-- 3. The founder deletes A's account through the real function.
insert into ops.member_requests (member_id, kind, details) values (pg_temp.g('de02'), 'deletion', 'Please delete me.');
select id as dg_req from ops.member_requests where member_id = pg_temp.g('de02') and kind = 'deletion' \gset
begin;
select pg_temp.as_member('de01');
set local role authenticated;
select public.app_founder_delete_member(:dg_req, 'dg_a');
commit;

do $$
declare
  got text;
begin
  select string_agg(kind || ':' || event || ':' || target_id::text, ',' order by id) into got
  from ops.deletion_register where id > (select id from dg_start);
  if got is distinct from 'post:deleted:' || pg_temp.g('ee01') || ',account:deleted:' || pg_temp.g('de02') then
    raise exception 'FAIL: the register should hold exactly the post and the account deletions, got %', got;
  end if;
  raise notice 'PASS: completed deletions are registered in the same transaction; a rolled-back deletion leaves no row';
end $$;

-- 4. Members can't see it; the drain's functions are for the service key only.
do $$
begin
  perform pg_temp.as_member('de03');
  set local role authenticated;
  begin
    perform count(*) from ops.deletion_register;
    raise exception 'FAIL: a member read the register';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.svc_deletion_register_unreported(10);
    raise exception 'FAIL: a member called the drain function';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: members can neither read the register nor call its functions';
end $$;

-- 5. The drain marks rows reported once logged; history can't be edited.
do $$
declare
  ids bigint[];
  n integer;
begin
  select array_agg(id) into ids from public.svc_deletion_register_unreported(500) where id > (select id from dg_start);
  n := public.svc_deletion_register_reported(ids);
  if n <> 2 or exists (select 1 from public.svc_deletion_register_unreported(500) where id = any (ids)) then
    raise exception 'FAIL: rows were not marked reported (%)', n;
  end if;
  begin
    update ops.deletion_register set target_id = gen_random_uuid() where id = ids[1];
    raise exception 'FAIL: a register row was edited';
  exception when raise_exception then
    if sqlerrm !~ 'append-only' then raise; end if;
  end;
  begin
    delete from ops.deletion_register where id = ids[1];
    raise exception 'FAIL: a recent register row was deleted';
  exception when raise_exception then
    if sqlerrm !~ 'append-only' then raise; end if;
  end;
  raise notice 'PASS: rows are marked reported once; the register cannot be edited, and recent rows cannot be removed';
end $$;

-- 6. Recovery: after a restore to before the deletions, re-applying the logged
--    events deletes the account and the post again, applies a later restore,
--    and ignores anything from before the backup.
--    (The restore is simulated: A and the post are put back as a backup would.)
set role supabase_auth_admin;
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values (pg_temp.g('de02'), 'dg-de02@example.test', now(), '{}');
reset role;
update social.posts set deleted_at = null where id = pg_temp.g('ee01');
insert into social.posts (id, author_id, body, created_at) values (pg_temp.g('ee04'), pg_temp.g('de03'), 'Deleted before the backup, restored after', now() - interval '4 hours');
update social.posts set deleted_at = now() - interval '2 hours' where id = pg_temp.g('ee04');

do $$
declare
  backup_at timestamptz := now() - interval '1 hour';
  r jsonb;
begin
  r := ops.reapply_deletions(jsonb_build_array(
    jsonb_build_object('id', 1, 'kind', 'post', 'target_id', pg_temp.g('ee04'), 'change', 'deleted', 'occurred_at', now() - interval '3 hours'),
    jsonb_build_object('id', 2, 'kind', 'post', 'target_id', pg_temp.g('ee01'), 'change', 'deleted', 'occurred_at', now() - interval '30 minutes'),
    jsonb_build_object('id', 3, 'kind', 'account', 'target_id', pg_temp.g('de02'), 'change', 'deleted', 'occurred_at', now() - interval '20 minutes'),
    jsonb_build_object('id', 4, 'kind', 'post', 'target_id', pg_temp.g('ee04'), 'change', 'restored', 'occurred_at', now() - interval '10 minutes')
  ), backup_at);
  if r <> '{"accounts_deleted": 1, "content_deleted": 1, "content_restored": 1, "skipped": 1}'::jsonb then
    raise exception 'FAIL: reapply_deletions returned %', r;
  end if;
  if exists (select 1 from auth.users where id = pg_temp.g('de02')) then
    raise exception 'FAIL: the deleted account came back after recovery';
  end if;
  if (select deleted_at from social.posts where id = pg_temp.g('ee01')) is null then
    raise exception 'FAIL: the deleted post is visible after recovery';
  end if;
  if (select deleted_at from social.posts where id = pg_temp.g('ee04')) is not null then
    raise exception 'FAIL: a post restored after the backup was not restored again';
  end if;
  -- Running it twice changes nothing more.
  r := ops.reapply_deletions(jsonb_build_array(
    jsonb_build_object('id', 3, 'kind', 'account', 'target_id', pg_temp.g('de02'), 'change', 'deleted', 'occurred_at', now() - interval '20 minutes')), backup_at);
  if (r->>'accounts_deleted')::int <> 0 then
    raise exception 'FAIL: re-applying twice deleted twice: %', r;
  end if;
  raise notice 'PASS: recovery re-deletes the account and the post deleted after the backup, re-applies a later restore, skips older events, and is safe to repeat';
end $$;

-- 7. Only the founder (postgres) can run recovery.
do $$
begin
  perform pg_temp.as_member('de01');
  set local role authenticated;
  begin
    perform ops.reapply_deletions('[]'::jsonb, now());
    raise exception 'FAIL: a member ran recovery';
  exception when insufficient_privilege then null;
  end;
  reset role;
  set local role service_role;
  begin
    perform ops.reapply_deletions('[]'::jsonb, now());
    raise exception 'FAIL: the service key ran recovery';
  exception when insufficient_privilege then null;
  end;
  reset role;
  raise notice 'PASS: only the founder can run recovery';
end $$;
