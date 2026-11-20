-- Reports would hide content automatically.
create function ops.auto_hide() returns trigger language plpgsql set search_path = '' as $$
begin
  update social.posts set hidden_at = pg_catalog.now(), deleted_at = pg_catalog.now() where id = new.target_id;
  return new;
end;
$$;
create trigger auto_hide after insert on ops.content_reports for each row execute function ops.auto_hide();
