-- Invitation admins would become moderators.
create or replace function ops.moderator_active(p_user uuid) returns boolean language sql stable set search_path = '' as $$
  select exists (select 1 from ops.moderators m where m.user_id = p_user) or exists (select 1 from ops.admins a where a.user_id = p_user);
$$;
