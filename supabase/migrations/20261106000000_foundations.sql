-- Phase 0: the separated data areas for the Crevant pilot.
--
--   public     real member activity (Supabase's default schema; protected by
--              row level security on every table added in later phases)
--   intent     Support Intent and Creator Pro willingness to pay: real member
--              behaviour, but every amount is hypothetical and nonbinding.
--              No payment is collected and nothing here is a balance.
--   sim        simulated advertising: fictional campaigns, ad slots,
--              impressions, illustrative earnings. Never real money.
--   analytics  pilot measurement: events, post views, snapshots, costs
--
-- The pilot collects no real payments, so there is no finance schema yet.
-- If real payments launch later, a finance schema is added in its own
-- migration and joins the separation rule below.
--
-- Members (anon, authenticated) get no direct access to intent, sim, or
-- analytics. Later phases expose only what each person may see, through
-- narrowly scoped views and functions. Server code uses service_role.
-- No view or function may combine two of the amount schemas (intent, sim,
-- and finance once it exists); supabase/tests enforces this in CI, so
-- hypothetical support, illustrative ad earnings, and real money can never
-- be added together.

create schema if not exists intent;
create schema if not exists sim;
create schema if not exists analytics;

comment on schema intent is 'Hypothetical, nonbinding support amounts. Not payments, not balances. Never combined with sim or finance.';
comment on schema sim is 'Simulated advertising only. Illustrative, never payable. Never combined with intent or finance.';
comment on schema analytics is 'Pilot measurement. Admin and server access only.';

-- Lock the private schemas down for members and anonymous visitors.
revoke all on schema intent, sim, analytics from public;
revoke all on schema intent, sim, analytics from anon, authenticated;
grant usage on schema intent, sim, analytics to service_role;

-- Anything created in these schemas later starts locked down too.
do $$
declare
  s text;
begin
  foreach s in array array['intent', 'sim', 'analytics'] loop
    execute format('alter default privileges in schema %I revoke all on tables from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on sequences from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on functions from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I grant all on tables to service_role', s);
    execute format('alter default privileges in schema %I grant all on sequences to service_role', s);
    execute format('alter default privileges in schema %I grant execute on functions to service_role', s);
  end loop;
end
$$;
