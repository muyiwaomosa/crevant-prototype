-- A storage bucket created before the photo and video workstream.
create schema if not exists storage;
create table if not exists storage.buckets (id text primary key);
insert into storage.buckets (id) values ('avatars');
