-- Deliberate violation (rolled back): profiles gain an account type column
alter table public.profiles add column account_type text;
