-- Phase 0: the four separated data areas for the Crevant pilot.
--
--   public     real member activity (Supabase's default schema; protected by
--              row level security on every table added in later phases)
--   finance    real money: tips, ledger, payouts, refunds, disputes,
--              subscriptions, Stripe events, reconciliation
--   sim        simulated advertising: fictional campaigns, ad slots,
--              impressions, illustrative earnings. Never real money.
--   analytics  pilot measurement: events, post views, snapshots, costs
--
-- Members (anon, authenticated) get no direct access to finance, sim, or
-- analytics. Later phases expose only what each person may see, through
-- narrowly scoped views and functions. Server code uses service_role.
-- No view or function may read both finance and sim; supabase/tests
-- enforces this in CI.

create schema if not exists finance;
create schema if not exists sim;
create schema if not exists analytics;

comment on schema finance is 'Real money only. Never joined with sim.';
comment on schema sim is 'Simulated advertising only. Illustrative, never payable. Never joined with finance.';
comment on schema analytics is 'Pilot measurement. Admin and server access only.';

-- Lock the three private schemas down for members and anonymous visitors.
revoke all on schema finance, sim, analytics from public;
revoke all on schema finance, sim, analytics from anon, authenticated;
grant usage on schema finance, sim, analytics to service_role;

-- Anything created in these schemas later starts locked down too.
do $$
declare
  s text;
begin
  foreach s in array array['finance', 'sim', 'analytics'] loop
    execute format('alter default privileges in schema %I revoke all on tables from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on sequences from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I revoke all on functions from public, anon, authenticated', s);
    execute format('alter default privileges in schema %I grant all on tables to service_role', s);
    execute format('alter default privileges in schema %I grant all on sequences to service_role', s);
    execute format('alter default privileges in schema %I grant execute on functions to service_role', s);
  end loop;
end
$$;
