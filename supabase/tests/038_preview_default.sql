-- Staging-safe, read-only: public previews on by default (20261222000000).
-- Catalog reads only, plus counts and the project switch reported, never failed. Skipped until applied.

\set ON_ERROR_STOP on
select to_regclass('social.preview_optouts') is not null as preview_default_applied \gset
\if :preview_default_applied

do $$
declare
  bad text[] := '{}';
  pp text := (select prosrc from pg_proc where oid = 'public.app_public_post(uuid, text)'::regprocedure);
  pa text := (select prosrc from pg_proc where oid = 'public.app_public_previews_allowed()'::regprocedure);
  ps text := (select prosrc from pg_proc where oid = 'public.app_set_public_previews(boolean, text)'::regprocedure);
begin
  -- The switch-off record is private: reached only through the functions.
  if not (select relrowsecurity from pg_class where oid = 'social.preview_optouts'::regclass)
     or has_table_privilege('anon', 'social.preview_optouts', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'social.preview_optouts', 'SELECT,INSERT,UPDATE,DELETE') then
    bad := bad || 'the switch-off record is directly readable or writable'::text;
  end if;
  -- Every safeguard still gates a preview: the project switch, visible members only,
  -- not deleted or hidden, not under review, not switched off, rate limited.
  if position('ops.public_preview_settings' in pp) = 0 or position('social.visible_members' in pp) = 0
     or position('s.deleted_at is null' in pp) = 0 or position('ops.content_reports' in pp) = 0
     or position('social.preview_optouts' in pp) = 0 or position('rate_limited' in pp) = 0 then
    bad := bad || 'a preview is served without one of its safeguards'::text;
  end if;
  -- A preview still shows nothing of the media or of other members.
  if position('media_path' in pp) > 0 or position('comments' in pp) > 0 or position('likes' in pp) > 0 then
    bad := bad || 'a preview reads media or engagement'::text;
  end if;
  if position('preview_optouts' in pa) = 0 or position('preview_optouts' in ps) = 0 or position('current_member' in ps) = 0 then
    bad := bad || 'members cannot see or switch their own previews'::text;
  end if;
  -- Visitors may call only the preview itself.
  if not has_function_privilege('anon', 'public.app_public_post(uuid, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.app_set_public_previews(boolean, text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.app_public_previews_allowed()', 'EXECUTE') then
    bad := bad || 'visitors have the wrong access to preview functions'::text;
  end if;
  if cardinality(bad) > 0 then
    raise exception 'FAIL: public previews on by default: %', bad;
  end if;
  raise notice 'PASS: public previews on by default: each preview still needs the project switch, a visible creator, a live, unreported post and no switch-off; the switch-off record is private; visitors reach only the preview';
end $$;

do $$
begin
  raise notice 'INFO: previews: project switch %, % member(s) switched off',
    coalesce((select s.enabled::text from ops.public_preview_settings s where s.id), 'false'),
    (select count(*) from social.preview_optouts);
end $$;

\else
\echo 'Skipped 038_preview_default.sql: 20261222000000 is not applied here.'
\endif
