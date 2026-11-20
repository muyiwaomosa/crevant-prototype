-- An author's delete no longer queues the photo's files.
drop trigger post_media_on_delete on social.posts;
