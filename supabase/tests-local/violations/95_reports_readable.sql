-- Members could read every report (and so who reported).
grant usage on schema ops to authenticated;
grant select on ops.content_reports to authenticated;
