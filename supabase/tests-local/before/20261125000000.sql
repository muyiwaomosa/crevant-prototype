-- TEST ONLY (throwaway databases): a minimal stand-in for Supabase Storage's
-- two tables, so 20261125000000_avatars can create its bucket and its
-- cleanup can be tested. Hosted and local Supabase have the real ones.
do $$
begin
  if to_regnamespace('storage') is null then
    create schema storage;
    create table storage.buckets (
      id text primary key, name text not null, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now()
    );
    create table storage.objects (
      id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
      name text, owner_id text, created_at timestamptz default now(), metadata jsonb,
      unique (bucket_id, name)
    );
  end if;
end $$;
