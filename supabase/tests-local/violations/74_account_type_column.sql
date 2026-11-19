-- Violation: an account type on social data (a member_type on posts).
alter table social.posts add column member_type text;
