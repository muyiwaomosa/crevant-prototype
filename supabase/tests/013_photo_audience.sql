-- Staging-safe, read-only: who may post photos (20261128000000).
-- Catalog reads only: no member data.

\set ON_ERROR_STOP on
select exists (select 1 from information_schema.columns where table_schema = 'ops' and table_name = 'media_settings' and column_name = 'photos_audience')
       or case when to_regclass('supabase_migrations.schema_migrations') is null then false
               else (xpath('/row/n/text()', query_to_xml(
                       'select count(*) as n from supabase_migrations.schema_migrations where version = ''20261128000000''',
                       false, true, '')))[1]::text::int > 0
          end as audience_applied \gset
\if :audience_applied

do $$
declare
  open_src text := (select prosrc from pg_proc where oid = 'ops.photos_open()'::regprocedure);
  def text := (select column_default from information_schema.columns where table_schema = 'ops' and table_name = 'media_settings' and column_name = 'photos_audience');
  chk text := (select string_agg(pg_get_constraintdef(c.oid), ' ') from pg_constraint c where c.conrelid = 'ops.media_settings'::regclass);
  f text;
begin
  -- 1. Founder-only by default; only founder or members.
  if def is distinct from '''founder''::text' then
    raise exception 'FAIL: photo posting is not founder-only by default (default %)', def;
  end if;
  if position('''founder''' in chk) = 0 or position('''members''' in chk) = 0 then
    raise exception 'FAIL: the audience no longer accepts only founder or members';
  end if;
  -- 2. The switch checks the audience for the caller, with the founder rule (active member, founder cohort).
  if position('photos_audience = ''members''' in open_src) = 0 or position('a.user_id = auth.uid()' in open_src) = 0
     or position('a.cohort = ''founder''' in open_src) = 0 or position('ops.member_access_active(a.user_id)' in open_src) = 0 then
    raise exception 'FAIL: ops.photos_open no longer restricts photo posting to the founder unless opened to members';
  end if;
  -- 3. Every photo-posting step still asks it.
  foreach f in array array['public.app_photo_status()', 'public.app_photo_upload_begin()', 'public.app_create_post(text, uuid, uuid, text)'] loop
    if position('ops.photos_open()' in (select prosrc from pg_proc where oid = f::regprocedure)) = 0 then
      raise exception 'FAIL: % no longer checks the photo switch and audience', f;
    end if;
  end loop;
  -- 4. Changing the audience: server only, recorded, phrase to widen.
  if has_function_privilege('authenticated', 'ops.set_photo_audience(text, text, text)', 'EXECUTE')
     or has_function_privilege('anon', 'ops.set_photo_audience(text, text, text)', 'EXECUTE') then
    raise exception 'FAIL: members or visitors can change who may post photos';
  end if;
  if position('OPEN PHOTO POSTING TO ALL MEMBERS' in (select prosrc from pg_proc where oid = 'ops.set_photo_audience(text, text, text)'::regprocedure)) = 0
     or position('audience_changed' in (select prosrc from pg_proc where oid = 'ops.set_photo_audience(text, text, text)'::regprocedure)) = 0 then
    raise exception 'FAIL: widening the audience no longer needs the phrase, or is no longer recorded';
  end if;
  raise notice 'PASS: photo posting is founder-only by default, enforced for the caller at every step, and only server code can widen it (with the phrase, recorded)';
end $$;

\else
do $$
begin
  if to_regprocedure('ops.set_photo_audience(text, text, text)') is not null then
    raise exception 'FAIL: part of the photo audience migration exists although it is not recorded';
  end if;
  raise notice 'PASS: the photo audience (20261128000000) is not applied yet, and none of it exists';
end $$;
\endif
