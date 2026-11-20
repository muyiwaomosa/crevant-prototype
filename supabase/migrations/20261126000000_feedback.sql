-- Member feedback and the founder's feedback inbox (Build 5, Stage 5.2c).
-- STAGING ONLY until approved for Production (see supabase/production-migrations.txt).
--
-- What this migration adds:
--   * ops.feedback: what pilot members send from "Send feedback": a
--     category (a problem, an improvement, something they like), the app
--     feature they were using (a fixed list of safe names, never a URL or
--     an id), a description of 10 to 1,000 characters, and the member's
--     pilot cohort when they sent it. Private: no member can read it,
--     including their own after sending.
--   * ops.feedback_notes: the founder's private notes on an entry.
--   * ops.feedback_actions: the append-only audit trail of every status
--     change, note and retention deletion (never the note or feedback text).
--   * social.current_founder(): the signed-in member with active pilot
--     membership AND the founder cohort. Every founder function uses it.
--   * Member functions: app_feedback_submit (any pilot member) and
--     app_is_founder, and the founder set app_founder_feedback_list,
--     app_founder_feedback, app_founder_feedback_set_status and
--     app_founder_feedback_add_note.
--
-- Abuse and mistakes: 3 entries in any 10 minutes and 10 a day per member;
-- the app's request id makes a retried or double-tapped send one entry; the
-- same text again within 10 minutes returns the first entry.
--
-- Retention (docs/FEEDBACK.md): kept through the pilot evaluation, then
-- deleted with ops.purge_feedback (server only, recorded). Deleting an
-- account deletes its feedback and the notes on it; the audit trail keeps
-- only ids, statuses and times.

-- ---------------------------------------------------------------------------
-- 1. Feedback, notes and the audit trail (ops: server only).

create table ops.feedback (
  id                uuid primary key default gen_random_uuid(),
  submitter_id      uuid not null references auth.users (id) on delete cascade,
  category          text not null check (category in ('problem', 'improvement', 'praise')),
  -- Where the member was when they opened the form: a fixed list, nothing else.
  feature           text not null check (feature in ('home', 'discover', 'profile', 'clique', 'post', 'create', 'catch_up', 'other')),
  body              text not null check (
    char_length(body) between 10 and 1000
    and body ~ '\S'
    and body !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]'
  ),
  -- The member's pilot cohort when they sent it (null if they had none recorded).
  cohort            text check (cohort is null or cohort in ('founder', 'creator', 'fan', 'tester')),
  status            text not null default 'new' check (status in ('new', 'reviewing', 'planned', 'resolved', 'closed')),
  client_request_id uuid not null,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now()
);
create unique index feedback_one_per_request on ops.feedback (submitter_id, client_request_id);
create index feedback_by_submitter on ops.feedback (submitter_id, created_at);
create index feedback_newest on ops.feedback (created_at desc, id desc);
comment on table ops.feedback is 'Pilot members'' feedback. Private: read only by the founder through app_founder_* functions. Kept through the pilot evaluation, then deleted with ops.purge_feedback (docs/FEEDBACK.md).';

create table ops.feedback_notes (
  id          bigint generated always as identity primary key,
  feedback_id uuid not null references ops.feedback (id) on delete cascade,
  -- The founder who wrote it (kept as null if that account is deleted).
  author_id   uuid references auth.users (id) on delete set null,
  body        text not null check (
    char_length(body) between 1 and 1000
    and body ~ '\S'
    and body !~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]'
  ),
  created_at  timestamptz not null default pg_catalog.now()
);
create index feedback_notes_by_entry on ops.feedback_notes (feedback_id, created_at);
comment on table ops.feedback_notes is 'The founder''s private notes on feedback. Never shown to members. Deleted with their feedback entry.';
-- Notes are added, never edited.
create trigger feedback_notes_no_update
before update on ops.feedback_notes
for each row execute function ops.history_append_only();

create table ops.feedback_actions (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default pg_catalog.now(),
  -- No foreign keys: the audit trail outlives entries and accounts. It never
  -- holds feedback or note text.
  feedback_id     uuid,
  actor_id        uuid,
  actor_label     text not null check (char_length(actor_label) between 1 and 100 and strpos(actor_label, '@') = 0),
  action          text not null check (action in ('status_changed', 'note_added', 'retention_purge')),
  from_status     text,
  to_status       text,
  detail          text check (detail is null or char_length(detail) <= 200),
  db_session_user text not null default session_user,
  db_role         text not null default pg_catalog.current_setting('role')
);
create index feedback_actions_by_entry on ops.feedback_actions (feedback_id, occurred_at);
comment on table ops.feedback_actions is 'Append-only audit trail of feedback status changes, notes added and retention deletions. Holds no feedback or note text.';
create trigger feedback_actions_no_update
before update or delete on ops.feedback_actions
for each row execute function ops.history_append_only();
create trigger feedback_actions_no_truncate
before truncate on ops.feedback_actions
for each statement execute function ops.history_append_only();

alter table ops.feedback enable row level security;
alter table ops.feedback_notes enable row level security;
alter table ops.feedback_actions enable row level security;
revoke all on table ops.feedback, ops.feedback_notes, ops.feedback_actions from public, anon, authenticated;
grant select on table ops.feedback, ops.feedback_notes, ops.feedback_actions to service_role;

-- Retention: deletes feedback (and its notes) sent more than p_days ago.
-- Server only (the founder, through an approved process, after the pilot
-- evaluation). Needs an actor label and the exact phrase; recorded.
create function ops.purge_feedback(p_days integer, p_actor text, p_confirm text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_days is null or p_days < 0 then
    raise exception 'purge refused: give an age in days (0 deletes everything)';
  end if;
  if p_actor is null or char_length(p_actor) not between 1 and 100 or strpos(p_actor, '@') > 0 then
    raise exception 'purge refused: give an actor label (not an email address)';
  end if;
  if p_confirm is distinct from 'DELETE PILOT FEEDBACK' then
    raise exception 'purge refused: confirm with the exact phrase DELETE PILOT FEEDBACK';
  end if;
  delete from ops.feedback f where f.created_at < pg_catalog.now() - pg_catalog.make_interval(days => p_days);
  get diagnostics n = row_count;
  insert into ops.feedback_actions (actor_label, action, detail)
  values (p_actor, 'retention_purge', pg_catalog.format('%s entr%s older than %s days deleted', n, case when n = 1 then 'y' else 'ies' end, p_days));
  return n;
end;
$$;
revoke all on function ops.purge_feedback(integer, text, text) from public, anon, authenticated;
grant execute on function ops.purge_feedback(integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The founder: active pilot membership AND the founder cohort.

create function social.current_founder()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if not exists (select 1 from ops.member_access a where a.user_id = v_uid and a.cohort = 'founder') then
    raise exception 'not_founder' using errcode = 'P0001', detail = 'Only the founder can do this.';
  end if;
  return v_uid;
end;
$$;
revoke all on function social.current_founder() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Sending feedback (any pilot member).

create function public.app_feedback_submit(p_category text, p_feature text, p_body text, p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_body text := pg_catalog.regexp_replace(coalesce(p_body, ''), '^\s+|\s+$', '', 'g');
  v_id uuid;
begin
  if p_request_id is null then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_category is null or p_category not in ('problem', 'improvement', 'praise') then
    raise exception 'invalid_category' using errcode = 'P0001', detail = 'Choose what kind of feedback this is.';
  end if;
  if p_feature is null or p_feature not in ('home', 'discover', 'profile', 'clique', 'post', 'create', 'catch_up', 'other') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if char_length(v_body) < 10 then
    raise exception 'feedback_too_short' using errcode = 'P0001', detail = 'Please write at least 10 characters.';
  end if;
  if char_length(v_body) > 1000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  if v_body ~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]' then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;

  -- One send at a time per member, so the checks below can't race.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('feedback:' || v_uid::text, 0));

  -- A retried or double-tapped send: the entry it already made.
  select f.id into v_id from ops.feedback f where f.submitter_id = v_uid and f.client_request_id = p_request_id;
  if v_id is not null then
    return v_id;
  end if;
  -- The same text sent again within 10 minutes: the first entry.
  select f.id into v_id from ops.feedback f
  where f.submitter_id = v_uid and f.body = v_body and f.created_at > pg_catalog.now() - interval '10 minutes'
  order by f.created_at desc limit 1;
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from ops.feedback f where f.submitter_id = v_uid and f.created_at > pg_catalog.now() - interval '10 minutes') >= 3
     or (select count(*) from ops.feedback f where f.submitter_id = v_uid and f.created_at > pg_catalog.now() - interval '1 day') >= 10 then
    raise exception 'rate_limited' using errcode = 'P0001', detail = 'Please slow down and try again later.';
  end if;

  insert into ops.feedback (submitter_id, category, feature, body, cohort, client_request_id)
  values (v_uid, p_category, p_feature, v_body,
          (select a.cohort from ops.member_access a where a.user_id = v_uid), p_request_id)
  returning id into v_id;
  return v_id;
end;
$$;

-- Whether the caller is the founder. Not an error for other members: it only
-- decides whether the app shows the feedback inbox.
create function public.app_is_founder()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return exists (select 1 from ops.member_access a where a.user_id = v_uid and a.cohort = 'founder');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The founder's inbox (active pilot member AND founder cohort).

-- Newest first, optionally filtered; at most 50 at a time, then older ones
-- from (p_before, p_before_id). Names and usernames only, never an email.
create function public.app_founder_feedback_list(
  p_category text default null, p_status text default null, p_cohort text default null,
  p_before timestamptz default null, p_before_id uuid default null, p_limit integer default 50
)
returns table (
  id uuid, category text, feature text, body text, status text, cohort text,
  submitter_username text, submitter_display_name text, note_count bigint,
  created_at timestamptz, updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if (p_category is not null and p_category not in ('problem', 'improvement', 'praise'))
     or (p_status is not null and p_status not in ('new', 'reviewing', 'planned', 'resolved', 'closed'))
     or (p_cohort is not null and p_cohort not in ('founder', 'creator', 'fan', 'tester'))
     or ((p_before is null) <> (p_before_id is null)) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  return query
  select f.id, f.category, f.feature, f.body, f.status, f.cohort,
         p.username, p.display_name,
         (select count(*) from ops.feedback_notes n where n.feedback_id = f.id),
         f.created_at, f.updated_at
  from ops.feedback f
  left join public.profiles p on p.id = f.submitter_id
  where (p_category is null or f.category = p_category)
    and (p_status is null or f.status = p_status)
    and (p_cohort is null or f.cohort = p_cohort)
    and (p_before is null or (f.created_at, f.id) < (p_before, p_before_id))
  order by f.created_at desc, f.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 50);
end;
$$;

-- One entry, with its notes (oldest first) and its history.
create function public.app_founder_feedback(p_id uuid)
returns table (
  id uuid, category text, feature text, body text, status text, cohort text,
  submitter_username text, submitter_display_name text,
  created_at timestamptz, updated_at timestamptz, notes jsonb, history jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return query
  select f.id, f.category, f.feature, f.body, f.status, f.cohort,
         p.username, p.display_name, f.created_at, f.updated_at,
         coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'body', n.body, 'author', coalesce(a.display_name, 'Former founder'), 'created_at', n.created_at)
                   order by n.created_at, n.id)
                   from ops.feedback_notes n left join public.profiles a on a.id = n.author_id
                   where n.feedback_id = f.id), '[]'::jsonb),
         coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                     'action', x.action, 'from', x.from_status, 'to', x.to_status,
                     'by', coalesce(b.display_name, x.actor_label), 'at', x.occurred_at)
                   order by x.occurred_at, x.id)
                   from ops.feedback_actions x left join public.profiles b on b.id = x.actor_id
                   where x.feedback_id = f.id), '[]'::jsonb)
  from ops.feedback f
  left join public.profiles p on p.id = f.submitter_id
  where f.id = p_id;
end;
$$;

-- Changes an entry's status, and records who changed it from what to what.
-- Setting the status it already has changes and records nothing.
create function public.app_founder_feedback_set_status(p_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_from text;
begin
  if p_status is null or p_status not in ('new', 'reviewing', 'planned', 'resolved', 'closed') then
    raise exception 'invalid_status' using errcode = 'P0001';
  end if;
  select f.status into v_from from ops.feedback f where f.id = p_id for update;
  if v_from is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_from = p_status then
    return;
  end if;
  update ops.feedback set status = p_status, updated_at = pg_catalog.now() where id = p_id;
  insert into ops.feedback_actions (feedback_id, actor_id, actor_label, action, from_status, to_status)
  values (p_id, v_uid, 'founder', 'status_changed', v_from, p_status);
end;
$$;

-- Adds a private note (1 to 1,000 characters), recorded in the audit trail
-- (without its text).
create function public.app_founder_feedback_add_note(p_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_note text := pg_catalog.regexp_replace(coalesce(p_note, ''), '^\s+|\s+$', '', 'g');
begin
  if v_note = '' then
    raise exception 'note_required' using errcode = 'P0001';
  end if;
  if char_length(v_note) > 1000 then
    raise exception 'too_long' using errcode = 'P0001';
  end if;
  if v_note ~ '[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]' then
    raise exception 'invalid_text' using errcode = 'P0001';
  end if;
  perform 1 from ops.feedback f where f.id = p_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  insert into ops.feedback_notes (feedback_id, author_id, body) values (p_id, v_uid, v_note);
  update ops.feedback set updated_at = pg_catalog.now() where id = p_id;
  insert into ops.feedback_actions (feedback_id, actor_id, actor_label, action)
  values (p_id, v_uid, 'founder', 'note_added');
end;
$$;

comment on function public.app_feedback_submit(text, text, text, uuid) is 'Sends feedback (any pilot member). Validated here; 3 in 10 minutes and 10 a day; one entry per request id; the same text within 10 minutes returns the first entry.';
comment on function public.app_is_founder() is 'Whether the signed-in pilot member is in the founder cohort.';
comment on function public.app_founder_feedback_list(text, text, text, timestamptz, uuid, integer) is 'Founder only: feedback, newest first, filtered by category, status and cohort.';
comment on function public.app_founder_feedback(uuid) is 'Founder only: one feedback entry with its private notes and history.';
comment on function public.app_founder_feedback_set_status(uuid, text) is 'Founder only: changes a feedback entry''s status, and records it.';
comment on function public.app_founder_feedback_add_note(uuid, text) is 'Founder only: adds a private note to a feedback entry, and records it.';

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.app_feedback_submit(text, text, text, uuid)',
    'public.app_is_founder()',
    'public.app_founder_feedback_list(text, text, text, timestamptz, uuid, integer)',
    'public.app_founder_feedback(uuid)',
    'public.app_founder_feedback_set_status(uuid, text)',
    'public.app_founder_feedback_add_note(uuid, text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public, anon', f);
    execute pg_catalog.format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end;
$$;
