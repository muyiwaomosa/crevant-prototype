-- Members could claim and delete queued files themselves.
grant execute on function public.svc_media_drain_claim(integer) to authenticated;
