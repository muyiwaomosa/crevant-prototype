-- TEST ONLY (throwaway databases). Identities that already exist when the
-- migrations run, so the backfill can be tested: two confirmed, one not.
insert into auth.users (id, email, email_confirmed_at) values
  ('00000000-0000-4000-8000-000000000001', 'pre-confirmed-1@example.test', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000000002', 'pre-confirmed-2@example.test', now() - interval '1 day'),
  ('00000000-0000-4000-8000-000000000003', 'pre-unconfirmed@example.test', null);
