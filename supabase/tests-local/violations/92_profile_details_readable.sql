-- Members could read everyone's profile details directly.
grant usage on schema social to authenticated;
grant select on social.profile_details to authenticated;
