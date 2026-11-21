-- Who may post photos (Build 5.3 activation safeguard).
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- The founder's photo switch (20261127000000) is global: once on, every
-- active pilot member could post photos. This adds an audience to it:
--
--   * ops.media_settings.photos_audience: 'founder' (the default) or
--     'members'. With 'founder', only the signed-in member who is active and
--     in the founder cohort may post photos: the same founder rule as the
--     feedback inbox (social.current_founder) and the processing check
--     (app_is_founder). Everyone else is refused exactly as if photos were
--     off ('photos_unavailable').
--   * ops.photos_open(), which every photo-posting step already asks
--     (app_photo_status, app_photo_upload_begin, and publishing with a photo;
--     the post-media function's upload goes through app_photo_upload_begin),
--     now also checks the audience for the caller. It fails closed: no
--     signed-in caller, or anything but an active founder, is refused unless
--     the audience is 'members'.
--   * ops.set_photo_audience: server only, recorded in ops.media_admin_events.
--     Opening photo posting to all members needs the exact phrase
--     OPEN PHOTO POSTING TO ALL MEMBERS; returning to founder-only needs none.
--
-- Viewing photos, text posting, cleanup and evidence are unchanged.

alter table ops.media_settings add column photos_audience text not null default 'founder'
  check (photos_audience in ('founder', 'members'));
comment on column ops.media_settings.photos_audience is 'Who may post photos while photos are on: founder (default: the active founder cohort only) or members (every active pilot member). Changed only through ops.set_photo_audience.';

-- The audience change is a recorded action.
alter table ops.media_admin_events drop constraint media_admin_events_action_check;
alter table ops.media_admin_events add constraint media_admin_events_action_check
  check (action in ('settings_changed', 'processing_check', 'hidden_media_queued', 'audience_changed'));

-- Whether photo uploads may be authorised now, for the signed-in caller.
create or replace function ops.photos_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select s.photos_enabled
     and s.photo_storage_cap_bytes is not null
     and (s.photos_audience = 'members'
          or exists (select 1 from ops.member_access a
                     where a.user_id = auth.uid() and a.cohort = 'founder' and ops.member_access_active(a.user_id)))
  from ops.media_settings s where s.id;
$$;
revoke all on function ops.photos_open() from public, anon, authenticated;

-- Server only, recorded. Widening to all members needs the exact phrase.
create function ops.set_photo_audience(p_actor text, p_audience text, p_confirm text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from text;
begin
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 then
    raise exception 'audience refused: give an actor label (not an email address)';
  end if;
  if p_audience is null or p_audience not in ('founder', 'members') then
    raise exception 'audience refused: choose founder or members';
  end if;
  if p_audience = 'members' and p_confirm is distinct from 'OPEN PHOTO POSTING TO ALL MEMBERS' then
    raise exception 'audience refused: opening photo posting to all members needs the exact phrase OPEN PHOTO POSTING TO ALL MEMBERS';
  end if;
  select s.photos_audience into v_from from ops.media_settings s where s.id for update;
  if v_from = p_audience then
    return;
  end if;
  update ops.media_settings set photos_audience = p_audience, updated_at = pg_catalog.now(), updated_by = p_actor where id;
  insert into ops.media_admin_events (actor, action, detail)
  values (p_actor, 'audience_changed', pg_catalog.format('photo posting audience %s -> %s', v_from, p_audience));
end;
$$;
revoke all on function ops.set_photo_audience(text, text, text) from public, anon, authenticated;
grant execute on function ops.set_photo_audience(text, text, text) to service_role;
