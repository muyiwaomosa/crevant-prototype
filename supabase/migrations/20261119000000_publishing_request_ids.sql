-- Publishing reliability (issue #48): idempotent post and comment creation.
--
-- The app gives each post or comment it sends a request id, made in the
-- browser and reused when the person retries. These new versions of
-- app_create_post and app_add_comment store that id, and a second call with
-- the same id (a retry after a lost answer, a double tap, two simultaneous
-- requests) returns the row the first call made instead of adding another.
--
--   social.posts.client_request_id     uuid, optional
--   social.comments.client_request_id  uuid, optional
--   unique (author_id, client_request_id) on each, only where the id is set
--
--   public.app_create_post(p_body text, p_request_id uuid)
--   public.app_add_comment(p_post uuid, p_body text, p_request_id uuid)
--
-- Behaviour of the new versions:
--   * a repeat with the same id and the same text returns the existing id,
--     and doesn't count against the rate limit again;
--   * the same id with different text (or, for a comment, another post) is
--     refused with 'request_reused', and nothing is written;
--   * two people can use the same id without affecting each other;
--   * a null id behaves exactly like the original version.
--
-- The original one-argument app_create_post(text) and two-argument
-- app_add_comment(uuid, text) are unchanged, so a page built before this
-- migration keeps working. Nothing here touches the waitlist, acquisition,
-- Connection Points, rewards or money. Staging only: the social schema is not
-- in supabase/production-migrations.txt. Rollback (staging only):
-- scripts/db/staging-rollback-publishing-requests.sql.

alter table social.posts add column client_request_id uuid;
alter table social.comments add column client_request_id uuid;
comment on column social.posts.client_request_id is 'The browser''s request id for this post, so a retried request returns the same post. Optional.';
comment on column social.comments.client_request_id is 'The browser''s request id for this comment, so a retried request returns the same comment. Optional.';

create unique index posts_request_once on social.posts (author_id, client_request_id) where client_request_id is not null;
create unique index comments_request_once on social.comments (author_id, client_request_id) where client_request_id is not null;

create function public.app_create_post(p_body text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''), e' \t\r\n');
  v_id uuid;
  v_existing_body text;
begin
  if p_request_id is null then
    return public.app_create_post(p_body);
  end if;

  -- A repeat of a request already stored: same text, same post.
  select s.id, s.body into v_id, v_existing_body
  from social.posts s where s.author_id = v_uid and s.client_request_id = p_request_id;
  if v_id is not null then
    if v_existing_body is distinct from v_body then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
    return v_id;
  end if;

  if v_body = '' then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 2000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  perform social.rate_check('post', v_uid);

  insert into social.posts (author_id, body, client_request_id)
  values (v_uid, v_body, p_request_id)
  on conflict (author_id, client_request_id) where client_request_id is not null do nothing
  returning social.posts.id into v_id;

  -- Lost a race with a simultaneous request with the same id: return its post.
  if v_id is null then
    select s.id, s.body into v_id, v_existing_body
    from social.posts s where s.author_id = v_uid and s.client_request_id = p_request_id;
    if v_existing_body is distinct from v_body then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;
comment on function public.app_create_post(text, uuid) is 'Publishes a text post (1 to 2,000 characters) once per request id: a repeat returns the same post.';

create function public.app_add_comment(p_post uuid, p_body text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.btrim(coalesce(p_body, ''), e' \t\r\n');
  v_id uuid;
  v_existing_post uuid;
  v_existing_body text;
begin
  if p_request_id is null then
    return public.app_add_comment(p_post, p_body);
  end if;

  -- A repeat of a request already stored: same post and text, same comment.
  select c.id, c.post_id, c.body into v_id, v_existing_post, v_existing_body
  from social.comments c where c.author_id = v_uid and c.client_request_id = p_request_id;
  if v_id is not null then
    if v_existing_post is distinct from p_post or v_existing_body is distinct from v_body then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
    return v_id;
  end if;

  if not exists (select 1 from social.posts where id = p_post and deleted_at is null) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_body = '' then
    raise exception 'empty' using errcode = 'P0001';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  perform social.rate_check('comment', v_uid);

  insert into social.comments (post_id, author_id, body, client_request_id)
  values (p_post, v_uid, v_body, p_request_id)
  on conflict (author_id, client_request_id) where client_request_id is not null do nothing
  returning social.comments.id into v_id;

  if v_id is null then
    select c.id, c.post_id, c.body into v_id, v_existing_post, v_existing_body
    from social.comments c where c.author_id = v_uid and c.client_request_id = p_request_id;
    if v_existing_post is distinct from p_post or v_existing_body is distinct from v_body then
      raise exception 'request_reused' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
end;
$$;
comment on function public.app_add_comment(uuid, text, uuid) is 'Adds a comment (1 to 1,000 characters) once per request id: a repeat returns the same comment.';

-- Signed-in members only, like every other member function.
revoke all on function public.app_create_post(text, uuid) from public, anon;
revoke all on function public.app_add_comment(uuid, text, uuid) from public, anon;
grant execute on function public.app_create_post(text, uuid) to authenticated, service_role;
grant execute on function public.app_add_comment(uuid, text, uuid) to authenticated, service_role;
