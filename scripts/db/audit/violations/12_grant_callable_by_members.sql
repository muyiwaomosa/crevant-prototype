-- A member could grant themselves pilot membership.
grant usage on schema ops to authenticated;
grant execute on function ops.grant_member_access(uuid, text, text, timestamptz, text) to authenticated;
