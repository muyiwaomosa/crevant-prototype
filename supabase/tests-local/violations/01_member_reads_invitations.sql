-- Deliberate violation (rolled back): a member can read invitations
grant select on ops.invitations to authenticated;
