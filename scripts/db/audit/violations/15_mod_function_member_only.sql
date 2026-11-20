-- A moderation function that checks membership but not moderation.
create or replace function public.app_mod_dismiss(p_report uuid, p_note text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := social.current_member();
begin
  update ops.content_reports set status = 'dismissed', resolved_at = pg_catalog.now() where id = p_report;
end;
$$;
