-- Members could read the membership table.
grant usage on schema ops to authenticated;
grant select on ops.member_access to authenticated;
