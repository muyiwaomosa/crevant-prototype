-- The text-only rule loosened: empty text posts would be allowed.
alter table social.posts drop constraint posts_body_valid;
alter table social.posts add constraint posts_body_valid check (char_length(body) <= 2000);
