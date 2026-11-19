-- Violation: a server function that decides a feature from the waitlist
-- analysis labels (here, a "creator-only" gate). Locked to server code, so
-- only the analysis label check (007) can catch it.
create function ops.creator_feature_gate(p_email text) returns boolean language sql security definer set search_path = '' as
  $$ select coalesce((select 'active_creator' = any (participant_groups) from ops.waitlist where email = p_email), false) $$;
revoke all on function ops.creator_feature_gate(text) from public, anon, authenticated;
