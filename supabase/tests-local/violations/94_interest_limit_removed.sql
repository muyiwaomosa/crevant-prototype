-- Interests are no longer limited to the topic list.
alter table social.member_topics drop constraint member_topics_topic_fkey;
