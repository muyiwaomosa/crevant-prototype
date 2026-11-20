-- Members could commit any upload themselves, skipping the Edge Function's image checks.
grant execute on function public.svc_avatar_commit(text) to authenticated;
