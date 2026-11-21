-- Opening external access no longer needs its phrase.
create or replace function ops.set_external_access(p_actor text, p_approved boolean, p_confirm text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update ops.member_launch_settings set external_access_approved = p_approved, updated_at = pg_catalog.now(), updated_by = p_actor where id;
end; $$;
