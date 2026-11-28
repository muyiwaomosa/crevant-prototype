-- Link in bio (BL-002, MVP refinement sprint, founder authorized Nov 28, 2026).
--
-- Every member may add one optional website link to their profile. It is
-- shown as a clickable link on their profile, and they can change or remove
-- it at any time.
--
-- Safe URL rules (checked here, whatever the app sends):
--   * http or https only: no javascript:, data:, file: or other schemes;
--   * a host name with a dot (no bare IP literals, no "localhost"), no
--     user name or password before the host, no spaces or angle brackets;
--   * at most 200 characters; empty removes the link.
-- A link without a scheme gets https:// in front.
--
-- The link lives with the other optional profile details, so it follows
-- their rules: hidden while a moderator hides the member's details, gone when
-- the account is deleted (on delete cascade), and never shown for members the
-- viewer cannot see (blocked or removed). Nothing else changes.

alter table social.profile_details
  add column website text check (website is null or (
    char_length(website) <= 200
    and website ~ '^https?://[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}(?::[0-9]{1,5})?(?:[/?#][^\s<>"''\\^`{|}]*)?$'
  ));
comment on column social.profile_details.website is 'Optional link in bio (BL-002): one http(s) address, at most 200 characters. Written only through public.app_set_my_website; hidden with the other details while they are hidden.';

create function public.app_set_my_website(p_url text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_url text := nullif(pg_catalog.btrim(coalesce(p_url, '')), '');
begin
  if v_url is not null and v_url !~* '^[a-z][a-z0-9+.-]*:' then
    v_url := 'https://' || v_url;
  end if;
  if v_url is not null and (
       char_length(v_url) > 200
       or v_url !~* '^https?://'
       or v_url !~ '^https?://[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)*\.[A-Za-z]{2,63}(?::[0-9]{1,5})?(?:[/?#][^\s<>"''\\^`{|}]*)?$'
     ) then
    raise exception 'website_invalid' using errcode = 'P0001', detail = 'Use a web address such as https://example.com.';
  end if;
  -- A details row may not exist yet; creating one here never marks setup done.
  insert into social.profile_details as d (user_id, website)
  values (v_uid, v_url)
  on conflict (user_id) do update set website = excluded.website, updated_at = pg_catalog.now();
  return v_url;
end;
$$;
comment on function public.app_set_my_website(text) is 'Sets or removes (empty) the caller''s own link in bio, after the safe URL rules. Returns the stored link.';

create function public.app_my_website()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.website from social.profile_details d where d.user_id = social.current_member();
$$;
comment on function public.app_my_website() is 'The caller''s own link in bio, or null.';

create function public.app_member_website(p_member uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  -- Members only, like the other profile details.
  v_uid uuid := social.current_member();
begin
  return (
    select case when d.hidden_at is null then d.website end
    from social.visible_members p
    join social.profile_details d on d.user_id = p.id
    where p.id = p_member
  );
end;
$$;
comment on function public.app_member_website(uuid) is 'A visible member''s link in bio, or null (none, hidden by moderation, or not visible to the caller).';

revoke all on function public.app_set_my_website(text) from public, anon;
revoke all on function public.app_my_website() from public, anon;
revoke all on function public.app_member_website(uuid) from public, anon;
grant execute on function public.app_set_my_website(text) to authenticated;
grant execute on function public.app_my_website() to authenticated;
grant execute on function public.app_member_website(uuid) to authenticated;
