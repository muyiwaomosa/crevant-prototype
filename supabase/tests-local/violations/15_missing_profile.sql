-- Deliberate violation (rolled back): a confirmed identity has no profile
delete from public.profiles where id = '00000000-0000-4000-8000-000000000002';
