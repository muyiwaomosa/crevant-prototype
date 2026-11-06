-- Deliberate violation (rolled back): members can call the profile creation function
grant execute on function ops.create_profile_for_confirmed_user() to authenticated;
