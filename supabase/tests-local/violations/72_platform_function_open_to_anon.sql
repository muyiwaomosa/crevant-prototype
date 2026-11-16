-- Violation: a function this repo did not make, runnable by anon only (not
-- by the waitlist logins), so only 006_platform_functions.sql can catch it.
create function public.platform_helper() returns integer language sql as 'select 1';
revoke all on function public.platform_helper() from public, authenticated;
grant execute on function public.platform_helper() to anon;
