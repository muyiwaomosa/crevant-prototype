-- Photo uploads on by default.
alter table ops.media_settings alter column photos_enabled set default true;
