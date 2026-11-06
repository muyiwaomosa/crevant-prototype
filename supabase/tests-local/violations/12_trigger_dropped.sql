-- Deliberate violation (rolled back): the profile creation trigger is removed
drop trigger on_auth_user_confirmed on auth.users;
