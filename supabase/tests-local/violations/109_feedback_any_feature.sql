-- The feature allowlist removed (a URL or id could be stored).
alter table ops.feedback drop constraint feedback_feature_check;
