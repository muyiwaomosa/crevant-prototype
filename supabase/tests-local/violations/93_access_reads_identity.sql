-- The identity preference would decide access: "creators" pass the membership check.
create or replace function ops.member_access_active(p_user uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (select 1 from ops.member_access a where a.user_id = p_user and a.status = 'active' and (a.expires_at is null or a.expires_at > pg_catalog.now()))
      or exists (select 1 from social.profile_details d where d.user_id = p_user and d.identity = 'creator');
$$;
