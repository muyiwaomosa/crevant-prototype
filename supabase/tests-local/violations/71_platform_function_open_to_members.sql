-- Violation: a platform-style function in public, left with the default
-- grants (PUBLIC, anon, authenticated), as Supabase installs
-- public.rls_auto_enable() on some hosted projects.
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path = pg_catalog as $$ begin end $$;
