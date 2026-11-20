-- Storage cleanup would also offer current pictures and fresh uploads.
create or replace function ops.storage_cleanup_candidates() returns table (path text, bytes bigint) language plpgsql stable set search_path = '' as $$
begin
  return query select o.name::text, 0::bigint from storage.objects o;
end;
$$;
