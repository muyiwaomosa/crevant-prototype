-- The moderation audit trail could be edited.
drop trigger moderation_actions_no_update on ops.moderation_actions;
