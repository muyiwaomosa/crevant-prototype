-- Photo posting open to all members by default.
alter table ops.media_settings alter column photos_audience set default 'members';
