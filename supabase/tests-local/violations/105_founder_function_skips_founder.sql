-- A founder function that checks only membership: any pilot member could read the inbox.
create or replace function public.app_founder_feedback(p_id uuid)
returns table (
  id uuid, category text, feature text, body text, status text, cohort text,
  submitter_username text, submitter_display_name text,
  created_at timestamptz, updated_at timestamptz, notes jsonb, history jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query select f.id, f.category, f.feature, f.body, f.status, f.cohort, null::text, null::text, f.created_at, f.updated_at, '[]'::jsonb, '[]'::jsonb
  from ops.feedback f where f.id = p_id;
end;
$$;
