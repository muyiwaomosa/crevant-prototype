-- REHEARSAL BRANCH ONLY. Read only. Run in the SQL editor of the project
-- created by "Restore to a new project" from the rehearsal project's backup,
-- to confirm the restored copy is complete. Every column must be true.
select
  (select count(*) = 1 from env_identity.marker where label = 'splitpost-members-production') as identity_marker,
  (select max(version) = '20261129000000' and count(*) = 18 from supabase_migrations.schema_migrations) as migration_history,
  exists (select 1 from pg_trigger where tgrelid = 'ops.member_access'::regclass and tgname = 'member_access_launch_gate' and tgenabled = 'O') as launch_gate_enabled,
  (select founder_user_id is not null and not external_access_approved from ops.member_launch_settings where id) as founder_set_invitations_closed,
  (select count(*) = 1 and bool_and(a.user_id = s.founder_user_id) from ops.member_access a cross join ops.member_launch_settings s where s.id and a.status = 'active') as founder_is_the_only_active_member,
  (select not photos_enabled from ops.media_settings where id) as photos_off,
  (select count(*) = 2 from pg_roles where rolname in ('waitlist_writer', 'waitlist_admin') and rolconnlimit = 0) as waitlist_logins_locked,
  (select count(*) = 0 from ops.invitations) as no_invitations;
