-- Deliberate violation (rolled back): a public view exposes invitations
create view public.leaked_invitations as select email, source from ops.invitations;
