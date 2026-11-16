-- Deliberate violation (rolled back): a social helper reaches private admin data
create or replace function social.is_member(p_user uuid) returns boolean language sql stable security invoker set search_path = '' as $$ select exists (select 1 from ops.admins a where a.user_id = p_user) $$;
