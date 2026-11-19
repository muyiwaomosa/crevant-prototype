-- A private table opened to members.
grant usage on schema social to authenticated;
grant select on table social.posts to authenticated;
