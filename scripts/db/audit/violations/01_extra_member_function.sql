-- A new function members can call that is not on the allow-list.
create function public.app_sneaky() returns integer language sql security definer set search_path = '' as 'select 1';
grant execute on function public.app_sneaky() to authenticated;
