-- A storage bucket other than the approved private avatars bucket (a public one).
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
insert into storage.buckets (id, name, public) values ('photos', 'photos', true);
