-- IP-7 Advertising Engine (SP-TA-001 v2, WP-06; founder authorization and
-- the Commercial Relevance and Audience Matching refinement of November 25,
-- 2026). Review guide: docs/ADVERTISING.md.
--
-- The objective: connect members with businesses offering relevant solutions
-- to commercial needs the members chose to express. Everything an advertiser
-- pays is SIMULATED during the pilot; campaign observations (impressions,
-- clicks, feedback, verified conversions) are actual and kept apart, in the
-- ads schema, from the simulated money in sim.
--
-- 1. Managed advertiser onboarding (ADV-02): what they sell, the problem it
--    solves, the desired outcome, customer needs, the objective and the
--    conversion action, and legitimate eligibility limits. The founder
--    reviews and approves every advertiser. Audiences come from this
--    onboarding: no automated or AI audience generation.
-- 2. Commercial categories: a fixed, reviewed list. Prohibited and sensitive
--    categories (health, religion, politics, finance hardship, dating,
--    alcohol, gambling and so on) are not on it, so they can never be used to
--    target anyone.
-- 3. Member commercial preferences (ADV-01): optional, editable and
--    removable, without losing any access. Strictly separate from content
--    interests: no content interest, follow, search or post is ever read to
--    choose an ad. Members can also exclude an advertiser or a category and
--    hide an ad.
-- 4. Rules-based matching (ADV-03, ADV-07), explainable: a declared
--    preference first; then the non-sensitive topic of the post being viewed
--    (contextual; never faith or health content); then a non-personalized ad
--    where the campaign allows it; otherwise no ad. Respects campaign status,
--    dates, placement, approval, member exclusions and a per-campaign daily
--    frequency cap, plus a daily cap per member. Fair rotation among equally
--    relevant campaigns.
-- 5. Placement (ADV-04, ADV-05): content-associated (below a creator's post)
--    or general feed (between Home sections, never removing or reordering
--    posts). Labelled Sponsored, with "Why this ad" (ADV-08).
-- 6. Measurement (ADV-09 to ADV-11, ADV-13): one row per served ad, so a
--    view, a click or a piece of feedback counts once; a click only counts
--    after a valid view. Verified conversions are recorded manually. Reports
--    are aggregate only, with groups under 10 suppressed; advertisers never
--    receive member identities.
-- 7. Economics (ADV-12, ADV-14): the founder records a campaign's simulated
--    net revenue for a month; the content-associated share is attributed to
--    creators by their valid content views and enters the 40/20/40 model, the
--    general feed share is Splitpost's. Never for a closed month, once per
--    campaign and month. Viewing ads earns no Connection Points.

create schema ads;
comment on schema ads is 'Advertising: advertisers, campaigns, commercial categories and preferences, and actual campaign observations. Money stays in sim (simulated).';
revoke all on schema ads from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Commercial categories

create table ads.categories (
  slug       text primary key check (slug ~ '^[a-z][a-z_]{1,39}$'),
  label      text not null,
  sort_order integer not null
);
comment on table ads.categories is 'The reviewed commercial categories. No sensitive or prohibited category is on the list, so none can be targeted.';
insert into ads.categories (slug, label, sort_order) values
  ('home_kitchen',    'Home & kitchen',              10),
  ('food_groceries',  'Food & groceries',            20),
  ('tech_gadgets',    'Tech & gadgets',              30),
  ('software_apps',   'Software & apps',             40),
  ('courses',         'Courses & skills',            50),
  ('books_media',     'Books, music & media',        60),
  ('clothing',        'Clothing & accessories',      70),
  ('beauty',          'Beauty & personal care',      80),
  ('sports_outdoors', 'Sports & outdoors gear',      90),
  ('travel',          'Travel & experiences',       100),
  ('events',          'Events & tickets',           110),
  ('kids_family',     'Kids & family products',     120),
  ('pets',            'Pets',                       130),
  ('creative_tools',  'Creative tools & supplies',  140),
  ('small_business',  'Services for small business', 150);

-- Content topics that are never used for contextual ads (sensitive).
create function ads.topic_is_sensitive(p_topic text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_topic, '') in ('faith', 'wellness');
$$;

-- ---------------------------------------------------------------------------
-- 2. Advertisers and campaigns (managed by the founder)

create table ads.advertisers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 80),
  website          text not null check (char_length(website) <= 200 and website ~ '^https://[^\s]{3,}$'),
  offering         text not null check (char_length(offering) between 1 and 300),
  problem_solved   text not null check (char_length(problem_solved) between 1 and 300),
  desired_outcome  text not null check (char_length(desired_outcome) between 1 and 300),
  customer_needs   text not null check (char_length(customer_needs) between 1 and 300),
  objective        text not null check (objective in ('awareness', 'traffic', 'sign_ups', 'sales')),
  conversion_action text not null check (char_length(conversion_action) between 1 and 120),
  eligibility_notes text check (eligibility_notes is null or char_length(eligibility_notes) <= 300),
  categories       text[] not null default '{}',
  status           text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  review_note      text check (review_note is null or char_length(review_note) <= 500),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default pg_catalog.now(),
  updated_at       timestamptz not null default pg_catalog.now()
);
comment on table ads.advertisers is 'Managed advertiser onboarding: what they sell, the problem, the outcome, customer needs, objective, conversion action and eligibility limits. The founder approves each.';

create table ads.campaigns (
  id                 uuid primary key default gen_random_uuid(),
  advertiser_id      uuid not null references ads.advertisers (id) on delete cascade,
  name               text not null check (char_length(name) between 1 and 80),
  status             text not null default 'draft' check (status in ('draft', 'active', 'paused', 'completed')),
  placement          text not null check (placement in ('content', 'feed', 'both')),
  categories         text[] not null default '{}',
  context_topics     text[] not null default '{}',
  allow_general      boolean not null default false,
  starts_on          date not null,
  ends_on            date not null,
  daily_cap          integer not null default 3 check (daily_cap between 1 and 10),
  price_cents        bigint not null default 0 check (price_cents >= 0),
  headline           text not null check (char_length(headline) between 1 and 80),
  body               text not null check (char_length(body) between 1 and 200),
  cta_label          text not null check (char_length(cta_label) between 1 and 30),
  landing_url        text not null check (char_length(landing_url) <= 300 and landing_url ~ '^https://[^\s]{3,}$'),
  created_at         timestamptz not null default pg_catalog.now(),
  updated_at         timestamptz not null default pg_catalog.now(),
  constraint campaigns_dates check (ends_on >= starts_on)
);
create index campaigns_live on ads.campaigns (status, starts_on, ends_on);
comment on table ads.campaigns is 'Managed campaigns: commercial categories (from onboarding), optional non-sensitive content topics for contextual placement, whether a non-personalized fallback is allowed, dates, a daily frequency cap, the simulated fixed price and a text creative.';

-- Only reviewed categories, and never sensitive content topics, on a campaign or advertiser.
create function ads.check_targeting()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  t text;
begin
  foreach t in array new.categories loop
    if not exists (select 1 from ads.categories c where c.slug = t) then
      raise exception 'invalid_ad_category' using errcode = 'P0001', detail = 'Choose commercial categories from the list.';
    end if;
  end loop;
  if tg_table_name = 'campaigns' then
    foreach t in array new.context_topics loop
      if ads.topic_is_sensitive(t) or not exists (select 1 from social.topics s where s.slug = t) then
        raise exception 'invalid_topic' using errcode = 'P0001', detail = 'Faith and health content is never used for ads.';
      end if;
    end loop;
  end if;
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;
create trigger advertisers_targeting before insert or update on ads.advertisers for each row execute function ads.check_targeting();
create trigger campaigns_targeting before insert or update on ads.campaigns for each row execute function ads.check_targeting();

-- ---------------------------------------------------------------------------
-- 3. Member preferences and exclusions (separate from content interests)

create table ads.preferences (
  member_id  uuid not null references auth.users (id) on delete cascade,
  category   text not null references ads.categories (slug),
  created_at timestamptz not null default pg_catalog.now(),
  primary key (member_id, category)
);
comment on table ads.preferences is 'Commercial categories a member chose to see ads about. Optional, editable, removable. Never derived from content interests.';

create table ads.exclusions (
  member_id  uuid not null references auth.users (id) on delete cascade,
  kind       text not null check (kind in ('campaign', 'advertiser', 'category')),
  target     text not null,
  created_at timestamptz not null default pg_catalog.now(),
  primary key (member_id, kind, target)
);
comment on table ads.exclusions is 'Ads, advertisers and categories a member chose not to see.';

-- ---------------------------------------------------------------------------
-- 4. Observations (actual): one row per served ad

create table ads.impressions (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references ads.campaigns (id) on delete cascade,
  member_id      uuid references auth.users (id) on delete set null,
  surface        text not null check (surface in ('content', 'feed')),
  post_id        uuid,
  creator_id     uuid references auth.users (id) on delete set null,
  match          text not null check (match in ('preference', 'context', 'general')),
  matched        text,
  served_at      timestamptz not null default pg_catalog.now(),
  viewed_at      timestamptz,
  clicked_at     timestamptz,
  feedback       text check (feedback in ('relevant', 'not_relevant', 'hidden', 'reported')),
  feedback_at    timestamptz
);
create index impressions_member_day on ads.impressions (member_id, served_at);
create index impressions_campaign on ads.impressions (campaign_id, served_at);
comment on table ads.impressions is 'Actual campaign observations: one row per served ad. A view, a click and one piece of feedback each happen at most once; a click counts only after a valid view.';

-- Observations are recorded once and never rewritten.
create function ads.impressions_once()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'impressions are kept for reporting';
  end if;
  -- Only the observation columns may change, each from empty to a value once.
  -- (member_id and creator_id may also become null when an account is deleted.)
  if new.id <> old.id or new.campaign_id <> old.campaign_id or new.surface <> old.surface
     or new.post_id is distinct from old.post_id or new.match <> old.match
     or new.matched is distinct from old.matched or new.served_at <> old.served_at
     or (new.member_id is distinct from old.member_id and new.member_id is not null)
     or (new.creator_id is distinct from old.creator_id and new.creator_id is not null)
     or (old.viewed_at is not null and new.viewed_at is distinct from old.viewed_at)
     or (old.clicked_at is not null and new.clicked_at is distinct from old.clicked_at)
     or (old.feedback is not null and new.feedback is distinct from old.feedback) then
    raise exception 'impressions: each observation is recorded once';
  end if;
  return new;
end;
$$;
create trigger impressions_once before update or delete on ads.impressions for each row execute function ads.impressions_once();

create table ads.conversions (
  campaign_id  uuid not null references ads.campaigns (id) on delete cascade,
  month        date not null check (month = pg_catalog.date_trunc('month', month)::date),
  verified     integer not null check (verified >= 0),
  note         text not null check (char_length(note) between 1 and 300),
  recorded_at  timestamptz not null default pg_catalog.now(),
  primary key (campaign_id, month)
);
comment on table ads.conversions is 'Verified conversions, reconciled manually with what the advertiser provides, per campaign and month (aggregate only).';

create table ads.advertiser_feedback (
  campaign_id  uuid primary key references ads.campaigns (id) on delete cascade,
  satisfaction integer not null check (satisfaction between 1 and 5),
  note         text check (note is null or char_length(note) <= 300),
  recorded_at  timestamptz not null default pg_catalog.now()
);
comment on table ads.advertiser_feedback is 'Advertiser satisfaction (1 to 5), recorded by the founder after a campaign.';

create table ads.revenue_attributions (
  campaign_id  uuid not null references ads.campaigns (id) on delete cascade,
  month        date not null,
  net_cents    bigint not null check (net_cents > 0),
  content_cents bigint not null,
  feed_cents   bigint not null,
  recorded_at  timestamptz not null default pg_catalog.now(),
  primary key (campaign_id, month),
  constraint revenue_attributions_adds_up check (content_cents + feed_cents = net_cents)
);
comment on table ads.revenue_attributions is 'One SIMULATED revenue attribution per campaign and month; the entries themselves are in sim.revenue_entries.';
create trigger revenue_attributions_append_only before update or delete on ads.revenue_attributions
for each row execute function ops.history_append_only();

alter table ads.categories enable row level security;
alter table ads.advertisers enable row level security;
alter table ads.campaigns enable row level security;
alter table ads.preferences enable row level security;
alter table ads.exclusions enable row level security;
alter table ads.impressions enable row level security;
alter table ads.conversions enable row level security;
alter table ads.advertiser_feedback enable row level security;
alter table ads.revenue_attributions enable row level security;
revoke all on all tables in schema ads from public, anon, authenticated;
revoke all on all functions in schema ads from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Matching

-- The ad to show this member on this surface, or none. Pure: records nothing.
create function ads.choose(p_member uuid, p_surface text, p_topic text)
returns table (campaign_id uuid, match text, matched text)
language sql
stable
set search_path = ''
as $$
  with live as (
    select c.*
    from ads.campaigns c
    join ads.advertisers a on a.id = c.advertiser_id and a.status = 'approved'
    where c.status = 'active'
      and (pg_catalog.now() at time zone 'utc')::date between c.starts_on and c.ends_on
      and (c.placement = 'both' or c.placement = p_surface)
      and not exists (select 1 from ads.exclusions x where x.member_id = p_member
                      and ((x.kind = 'campaign' and x.target = c.id::text)
                        or (x.kind = 'advertiser' and x.target = c.advertiser_id::text)
                        or (x.kind = 'category' and x.target = any (c.categories))))
      and (select count(*) from ads.impressions i where i.campaign_id = c.id and i.member_id = p_member
           and i.served_at > pg_catalog.date_trunc('day', pg_catalog.now())) < c.daily_cap
  ),
  scored as (
    select l.id,
           case
             when exists (select 1 from ads.preferences p where p.member_id = p_member and p.category = any (l.categories)) then 'preference'
             when p_surface = 'content' and p_topic is not null and not ads.topic_is_sensitive(p_topic) and p_topic = any (l.context_topics) then 'context'
             when l.allow_general then 'general'
           end as match,
           case
             when exists (select 1 from ads.preferences p where p.member_id = p_member and p.category = any (l.categories))
               then (select c.label from ads.preferences p join ads.categories c on c.slug = p.category
                     where p.member_id = p_member and p.category = any (l.categories) order by c.sort_order limit 1)
             when p_surface = 'content' and p_topic is not null and not ads.topic_is_sensitive(p_topic) and p_topic = any (l.context_topics)
               then (select t.label from social.topics t where t.slug = p_topic)
           end as matched,
           (select count(*) from ads.impressions i where i.campaign_id = l.id and i.member_id = p_member
            and i.served_at > pg_catalog.date_trunc('day', pg_catalog.now())) as seen_today
    from live l
  )
  select s.id, s.match, s.matched
  from scored s
  where s.match is not null
  order by case s.match when 'preference' then 0 when 'context' then 1 else 2 end,
           s.seen_today,
           pg_catalog.md5(s.id::text || ((pg_catalog.now() at time zone 'utc')::date)::text)
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 6. Member functions

create function public.app_ad_categories()
returns table (slug text, label text, chosen boolean, excluded boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select c.slug, c.label,
         exists (select 1 from ads.preferences p where p.member_id = v_uid and p.category = c.slug),
         exists (select 1 from ads.exclusions x where x.member_id = v_uid and x.kind = 'category' and x.target = c.slug)
  from ads.categories c
  order by c.sort_order;
end;
$$;
comment on function public.app_ad_categories() is 'The commercial categories, with whether the member chose or excluded each. Never derived from content interests.';
revoke all on function public.app_ad_categories() from public, anon;
grant execute on function public.app_ad_categories() to authenticated;

create function public.app_set_ad_preference(p_category text, p_state text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  if p_category is null or not exists (select 1 from ads.categories c where c.slug = p_category)
     or p_state is null or p_state not in ('chosen', 'excluded', 'none') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  delete from ads.preferences where member_id = v_uid and category = p_category;
  delete from ads.exclusions where member_id = v_uid and kind = 'category' and target = p_category;
  if p_state = 'chosen' then
    insert into ads.preferences (member_id, category) values (v_uid, p_category);
  elsif p_state = 'excluded' then
    insert into ads.exclusions (member_id, kind, target) values (v_uid, 'category', p_category);
  end if;
end;
$$;
comment on function public.app_set_ad_preference(text, text) is 'Chooses, excludes or clears one commercial category for the member.';
revoke all on function public.app_set_ad_preference(text, text) from public, anon;
grant execute on function public.app_set_ad_preference(text, text) to authenticated;

create function public.app_clear_ad_preferences()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  delete from ads.preferences where member_id = v_uid;
  delete from ads.exclusions where member_id = v_uid;
end;
$$;
comment on function public.app_clear_ad_preferences() is 'Removes all the member''s commercial preferences and exclusions. Access is unchanged.';
revoke all on function public.app_clear_ad_preferences() from public, anon;
grant execute on function public.app_clear_ad_preferences() to authenticated;

create function public.app_my_ad_exclusions()
returns table (kind text, target text, label text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  return query
  select x.kind, x.target,
         case x.kind
           when 'campaign' then (select a.name || ': ' || c.headline from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id where c.id::text = x.target)
           when 'advertiser' then (select a.name from ads.advertisers a where a.id::text = x.target)
           else (select c.label from ads.categories c where c.slug = x.target)
         end,
         x.created_at
  from ads.exclusions x
  where x.member_id = v_uid and x.kind in ('campaign', 'advertiser')
  order by x.created_at desc;
end;
$$;
comment on function public.app_my_ad_exclusions() is 'The ads and advertisers the member hid.';
revoke all on function public.app_my_ad_exclusions() from public, anon;
grant execute on function public.app_my_ad_exclusions() to authenticated;

create function public.app_remove_ad_exclusion(p_kind text, p_target text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
begin
  delete from ads.exclusions where member_id = v_uid and kind = p_kind and target = p_target;
end;
$$;
comment on function public.app_remove_ad_exclusion(text, text) is 'Shows an ad or advertiser the member hid again.';
revoke all on function public.app_remove_ad_exclusion(text, text) from public, anon;
grant execute on function public.app_remove_ad_exclusion(text, text) to authenticated;

-- Serves one ad for a surface (content: below a post the member can see;
-- feed: on Home), or nothing. Records the served ad for measurement.
create function public.app_ad_for(p_surface text, p_post uuid default null)
returns table (impression_id uuid, advertiser text, headline text, body text, cta_label text, landing_url text,
               match text, matched text, placement text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  v_topic text;
  v_creator uuid;
  v_pick record;
  v_id uuid;
begin
  if p_surface is null or p_surface not in ('content', 'feed') or (p_surface = 'content') <> (p_post is not null) then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_surface = 'content' then
    select s.topic, s.author_id into v_topic, v_creator
    from social.posts s join social.visible_members m on m.id = s.author_id
    where s.id = p_post and s.deleted_at is null;
    if v_creator is null or v_creator = v_uid then
      return; -- no ad on a post the member can't see, or on their own post
    end if;
  end if;
  -- At most 20 ads a day and one every 20 seconds for a member.
  if (select count(*) from ads.impressions i where i.member_id = v_uid and i.served_at > pg_catalog.date_trunc('day', pg_catalog.now())) >= 20
     or exists (select 1 from ads.impressions i where i.member_id = v_uid and i.served_at > pg_catalog.now() - interval '20 seconds'
                and i.surface = p_surface and i.post_id is not distinct from p_post) then
    return;
  end if;
  select * into v_pick from ads.choose(v_uid, p_surface, v_topic);
  if v_pick.campaign_id is null then
    return;
  end if;
  insert into ads.impressions (campaign_id, member_id, surface, post_id, creator_id, match, matched)
  values (v_pick.campaign_id, v_uid, p_surface, p_post, v_creator, v_pick.match, v_pick.matched)
  returning id into v_id;
  return query
  select v_id, a.name, c.headline, c.body, c.cta_label, c.landing_url, v_pick.match, v_pick.matched, p_surface
  from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
  where c.id = v_pick.campaign_id;
end;
$$;
comment on function public.app_ad_for(text, uuid) is 'One ad for a surface, matched by rules (a declared commercial preference, then the non-sensitive topic of the post, then a non-personalized ad if allowed), or none. Never uses content interests. Records the served ad.';
revoke all on function public.app_ad_for(text, uuid) from public, anon;
grant execute on function public.app_ad_for(text, uuid) to authenticated;

-- Records what happened to a served ad: a valid view, an outbound click, or
-- the member's feedback (relevant, not relevant, hide, report). Each once.
create function public.app_ad_event(p_impression uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_member();
  i ads.impressions%rowtype;
begin
  if p_kind is null or p_kind not in ('view', 'click', 'relevant', 'not_relevant', 'hidden', 'reported') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select * into i from ads.impressions where id = p_impression and member_id = v_uid for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if p_kind = 'view' then
    update ads.impressions set viewed_at = pg_catalog.now() where id = i.id and viewed_at is null;
  elsif p_kind = 'click' then
    -- Only after a valid view, and once.
    update ads.impressions set clicked_at = pg_catalog.now() where id = i.id and viewed_at is not null and clicked_at is null;
  else
    update ads.impressions set feedback = p_kind, feedback_at = pg_catalog.now() where id = i.id and feedback is null;
    if p_kind in ('hidden', 'reported') then
      insert into ads.exclusions (member_id, kind, target) values (v_uid, 'campaign', i.campaign_id::text) on conflict do nothing;
    end if;
  end if;
end;
$$;
comment on function public.app_ad_event(uuid, text) is 'Records a view, an outbound click (only after a view) or feedback on one served ad, each at most once. Hiding or reporting an ad stops it being shown to the member. Earns no Connection Points.';
revoke all on function public.app_ad_event(uuid, text) from public, anon;
grant execute on function public.app_ad_event(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Founder: onboarding, campaigns, conversions, reports, revenue

create function ads.text_array(p jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce((select pg_catalog.array_agg(v) from pg_catalog.jsonb_array_elements_text(coalesce(p, '[]'::jsonb)) v), '{}');
$$;

create function public.app_founder_save_advertiser(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if v_id is null then
    insert into ads.advertisers (name, website, offering, problem_solved, desired_outcome, customer_needs, objective, conversion_action, eligibility_notes, categories)
    values (pg_catalog.btrim(p->>'name'), pg_catalog.btrim(p->>'website'), pg_catalog.btrim(p->>'offering'), pg_catalog.btrim(p->>'problem_solved'),
            pg_catalog.btrim(p->>'desired_outcome'), pg_catalog.btrim(p->>'customer_needs'), p->>'objective', pg_catalog.btrim(p->>'conversion_action'),
            nullif(pg_catalog.btrim(coalesce(p->>'eligibility_notes', '')), ''), ads.text_array(p->'categories'))
    returning id into v_id;
  else
    update ads.advertisers set name = pg_catalog.btrim(p->>'name'), website = pg_catalog.btrim(p->>'website'), offering = pg_catalog.btrim(p->>'offering'),
           problem_solved = pg_catalog.btrim(p->>'problem_solved'), desired_outcome = pg_catalog.btrim(p->>'desired_outcome'),
           customer_needs = pg_catalog.btrim(p->>'customer_needs'), objective = p->>'objective', conversion_action = pg_catalog.btrim(p->>'conversion_action'),
           eligibility_notes = nullif(pg_catalog.btrim(coalesce(p->>'eligibility_notes', '')), ''), categories = ads.text_array(p->'categories')
    where id = v_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when check_violation or not_null_violation then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'Fill in every onboarding field (website and links start with https://).';
end;
$$;
comment on function public.app_founder_save_advertiser(jsonb) is 'Founder: managed advertiser onboarding (offering, problem, outcome, customer needs, objective, conversion action, eligibility limits, commercial categories).';
revoke all on function public.app_founder_save_advertiser(jsonb) from public, anon;
grant execute on function public.app_founder_save_advertiser(jsonb) to authenticated;

create function public.app_founder_review_advertiser(p_advertiser uuid, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  update ads.advertisers set status = case when p_approve then 'approved' else 'declined' end,
         review_note = nullif(pg_catalog.btrim(coalesce(p_note, '')), ''), reviewed_at = pg_catalog.now()
  where id = p_advertiser;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not p_approve then
    update ads.campaigns set status = 'paused' where advertiser_id = p_advertiser and status = 'active';
  end if;
end;
$$;
comment on function public.app_founder_review_advertiser(uuid, boolean, text) is 'Founder: approves or declines an advertiser against the Advertising Policy, with a recorded reason. Declining pauses its campaigns.';
revoke all on function public.app_founder_review_advertiser(uuid, boolean, text) from public, anon;
grant execute on function public.app_founder_review_advertiser(uuid, boolean, text) to authenticated;

create function public.app_founder_save_campaign(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_id uuid := nullif(p->>'id', '')::uuid;
begin
  if v_id is null then
    insert into ads.campaigns (advertiser_id, name, placement, categories, context_topics, allow_general, starts_on, ends_on, daily_cap, price_cents,
                               headline, body, cta_label, landing_url)
    values ((p->>'advertiser_id')::uuid, pg_catalog.btrim(p->>'name'), p->>'placement', ads.text_array(p->'categories'), ads.text_array(p->'context_topics'),
            coalesce((p->>'allow_general')::boolean, false), (p->>'starts_on')::date, (p->>'ends_on')::date, coalesce((p->>'daily_cap')::integer, 3),
            coalesce((p->>'price_cents')::bigint, 0), pg_catalog.btrim(p->>'headline'), pg_catalog.btrim(p->>'body'), pg_catalog.btrim(p->>'cta_label'),
            pg_catalog.btrim(p->>'landing_url'))
    returning id into v_id;
  else
    update ads.campaigns set name = pg_catalog.btrim(p->>'name'), placement = p->>'placement', categories = ads.text_array(p->'categories'),
           context_topics = ads.text_array(p->'context_topics'), allow_general = coalesce((p->>'allow_general')::boolean, false),
           starts_on = (p->>'starts_on')::date, ends_on = (p->>'ends_on')::date, daily_cap = coalesce((p->>'daily_cap')::integer, 3),
           price_cents = coalesce((p->>'price_cents')::bigint, 0), headline = pg_catalog.btrim(p->>'headline'), body = pg_catalog.btrim(p->>'body'),
           cta_label = pg_catalog.btrim(p->>'cta_label'), landing_url = pg_catalog.btrim(p->>'landing_url')
    where id = v_id;
    if not found then
      raise exception 'not_found' using errcode = 'P0001';
    end if;
  end if;
  return v_id;
exception
  when check_violation or not_null_violation or invalid_text_representation or foreign_key_violation then
    raise exception 'invalid_request' using errcode = 'P0001', detail = 'Check every campaign field (dates, https:// link, lengths).';
end;
$$;
comment on function public.app_founder_save_campaign(jsonb) is 'Founder: a managed campaign: placement, commercial categories, optional non-sensitive content topics, non-personalized fallback, dates, daily cap, simulated price and a text creative.';
revoke all on function public.app_founder_save_campaign(jsonb) from public, anon;
grant execute on function public.app_founder_save_campaign(jsonb) to authenticated;

create function public.app_founder_set_campaign_status(p_campaign uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_status is null or p_status not in ('draft', 'active', 'paused', 'completed') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if p_status = 'active' and not exists (select 1 from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id
                                         where c.id = p_campaign and a.status = 'approved') then
    raise exception 'advertiser_not_approved' using errcode = 'P0001', detail = 'Approve the advertiser before activating a campaign.';
  end if;
  update ads.campaigns set status = p_status where id = p_campaign;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
comment on function public.app_founder_set_campaign_status(uuid, text) is 'Founder: activates, pauses or completes a campaign (only for an approved advertiser).';
revoke all on function public.app_founder_set_campaign_status(uuid, text) from public, anon;
grant execute on function public.app_founder_set_campaign_status(uuid, text) to authenticated;

create function public.app_founder_ads()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return pg_catalog.jsonb_build_object(
    'advertisers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by a.created_at desc) from ads.advertisers a), '[]'::jsonb),
    'campaigns', coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) || pg_catalog.jsonb_build_object('advertiser', a.name) order by c.created_at desc)
                           from ads.campaigns c join ads.advertisers a on a.id = c.advertiser_id), '[]'::jsonb),
    'categories', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('slug', c.slug, 'label', c.label) order by c.sort_order) from ads.categories c),
    'topics', (select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('slug', t.slug, 'label', t.label) order by t.sort_order)
               from social.topics t where not ads.topic_is_sensitive(t.slug)));
end;
$$;
comment on function public.app_founder_ads() is 'Founder: advertisers, campaigns, the commercial categories and the content topics usable for contextual ads (never faith or health).';
revoke all on function public.app_founder_ads() from public, anon;
grant execute on function public.app_founder_ads() to authenticated;

create function public.app_founder_record_conversions(p_campaign uuid, p_month date, p_verified integer, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  if p_month is null or p_verified is null or p_verified < 0 or coalesce(pg_catalog.btrim(p_note), '') = '' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  insert into ads.conversions (campaign_id, month, verified, note)
  values (p_campaign, pg_catalog.date_trunc('month', p_month)::date, p_verified, pg_catalog.btrim(p_note))
  on conflict (campaign_id, month) do update set verified = excluded.verified, note = excluded.note, recorded_at = pg_catalog.now();
exception
  when foreign_key_violation then
    raise exception 'not_found' using errcode = 'P0001';
end;
$$;
comment on function public.app_founder_record_conversions(uuid, date, integer, text) is 'Founder: verified conversions for a campaign and month, reconciled manually with the advertiser (aggregate only).';
revoke all on function public.app_founder_record_conversions(uuid, date, integer, text) from public, anon;
grant execute on function public.app_founder_record_conversions(uuid, date, integer, text) to authenticated;

create function public.app_founder_record_advertiser_feedback(p_campaign uuid, p_satisfaction integer, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  insert into ads.advertiser_feedback (campaign_id, satisfaction, note)
  values (p_campaign, p_satisfaction, nullif(pg_catalog.btrim(coalesce(p_note, '')), ''))
  on conflict (campaign_id) do update set satisfaction = excluded.satisfaction, note = excluded.note, recorded_at = pg_catalog.now();
exception
  when check_violation or foreign_key_violation then
    raise exception 'invalid_request' using errcode = 'P0001';
end;
$$;
comment on function public.app_founder_record_advertiser_feedback(uuid, integer, text) is 'Founder: the advertiser''s satisfaction with a campaign (1 to 5).';
revoke all on function public.app_founder_record_advertiser_feedback(uuid, integer, text) from public, anon;
grant execute on function public.app_founder_record_advertiser_feedback(uuid, integer, text) to authenticated;

-- Hides a count below 10 (null), so no small group can be identified.
create function ads.private_count(n bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when n >= 10 then n end;
$$;

create function public.app_founder_campaign_report(p_campaign uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  c ads.campaigns%rowtype;
  v_audience bigint;
begin
  select * into c from ads.campaigns where id = p_campaign;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  -- Eligible audience: members who chose one of the campaign's categories and excluded none of it.
  select count(distinct p.member_id) into v_audience
  from ads.preferences p
  where p.category = any (c.categories)
    and not exists (select 1 from ads.exclusions x where x.member_id = p.member_id
                    and ((x.kind = 'category' and x.target = any (c.categories)) or (x.kind = 'campaign' and x.target = c.id::text)
                         or (x.kind = 'advertiser' and x.target = c.advertiser_id::text)));
  return (
    with i as (select * from ads.impressions where campaign_id = c.id),
    by_match as (
      select m.match,
             count(i.id) filter (where i.viewed_at is not null) as views,
             count(i.id) filter (where i.clicked_at is not null) as clicks
      from (values ('preference'), ('context'), ('general')) m(match)
      left join i on i.match = m.match
      group by m.match)
    select pg_catalog.jsonb_build_object(
      'kind', 'actual observations',
      'minimum_group', 10,
      'eligible_audience', ads.private_count(v_audience),
      'served', (select count(*) from i),
      'impressions', (select count(*) from i where viewed_at is not null),
      'clicks', (select count(*) from i where clicked_at is not null),
      'ctr', case when (select count(*) from i where viewed_at is not null) > 0
                  then pg_catalog.round((select count(*) from i where clicked_at is not null)::numeric / (select count(*) from i where viewed_at is not null), 4) end,
      'reach', ads.private_count((select count(distinct member_id) from i where viewed_at is not null)),
      'relevant', (select count(*) from i where feedback = 'relevant'),
      'not_relevant', (select count(*) from i where feedback = 'not_relevant'),
      'hidden', (select count(*) from i where feedback = 'hidden'),
      'reported', (select count(*) from i where feedback = 'reported'),
      'by_match', (select pg_catalog.jsonb_object_agg(b.match, pg_catalog.jsonb_build_object('impressions', b.views, 'clicks', b.clicks)) from by_match b),
      'content_impressions', (select count(*) from i where viewed_at is not null and surface = 'content'),
      'feed_impressions', (select count(*) from i where viewed_at is not null and surface = 'feed'),
      'verified_conversions', coalesce((select sum(v.verified) from ads.conversions v where v.campaign_id = c.id), 0),
      'advertiser_satisfaction', (select f.satisfaction from ads.advertiser_feedback f where f.campaign_id = c.id),
      'simulated_revenue_cents', coalesce((select sum(r.net_cents) from ads.revenue_attributions r where r.campaign_id = c.id), 0)));
end;
$$;
comment on function public.app_founder_campaign_report(uuid) is 'Founder: a campaign''s aggregate report (actual observations; simulated revenue marked as such). Audience and reach under 10 are withheld. Never names, ids or usernames.';
revoke all on function public.app_founder_campaign_report(uuid) from public, anon;
grant execute on function public.app_founder_campaign_report(uuid) to authenticated;

create function public.app_founder_ad_demand()
returns table (category text, label text, members bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
begin
  return query
  select c.slug, c.label, ads.private_count((select count(*) from ads.preferences p where p.category = c.slug))
  from ads.categories c
  order by c.sort_order;
end;
$$;
comment on function public.app_founder_ad_demand() is 'Founder: basic aggregate commercial demand: how many members chose each category (under 10 withheld).';
revoke all on function public.app_founder_ad_demand() from public, anon;
grant execute on function public.app_founder_ad_demand() to authenticated;

-- Attributes a campaign's SIMULATED net revenue for a month: the content
-- share to creators by their valid content views (into 40/20/40), the feed
-- share to Splitpost. Once per campaign and month; never a closed month.
create function public.app_founder_attribute_campaign_revenue(p_campaign uuid, p_month date, p_net_cents bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := social.current_founder();
  v_month date := pg_catalog.date_trunc('month', p_month)::date;
  c ads.campaigns%rowtype;
  v_content bigint;
  v_feed bigint;
  v_content_cents bigint;
  r record;
begin
  if p_month is null or p_net_cents is null or p_net_cents <= 0 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select * into c from ads.campaigns where id = p_campaign;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_month >= pg_catalog.date_trunc('month', pg_catalog.now())::date then
    raise exception 'month_not_over' using errcode = 'P0001';
  end if;
  if exists (select 1 from sim.settlements s where s.month = v_month) then
    raise exception 'already_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from ads.revenue_attributions a where a.campaign_id = c.id and a.month = v_month) then
    raise exception 'already_attributed' using errcode = 'P0001';
  end if;
  select count(*) filter (where surface = 'content'), count(*) filter (where surface = 'feed') into v_content, v_feed
  from ads.impressions i
  where i.campaign_id = c.id and i.viewed_at is not null and pg_catalog.date_trunc('month', i.viewed_at)::date = v_month;
  if v_content + v_feed = 0 then
    raise exception 'no_impressions' using errcode = 'P0001', detail = 'This campaign had no valid impressions that month.';
  end if;
  -- Content and feed shares in proportion to valid views (whole cents).
  v_content_cents := p_net_cents * v_content / (v_content + v_feed);
  insert into ads.revenue_attributions (campaign_id, month, net_cents, content_cents, feed_cents)
  values (c.id, v_month, p_net_cents, v_content_cents, p_net_cents - v_content_cents);
  if p_net_cents - v_content_cents > 0 then
    insert into sim.revenue_entries (month, kind, net_cents, note, recorded_by)
    values (v_month, 'feed_ad', p_net_cents - v_content_cents, 'campaign ' || c.id || ' (feed)', 'founder:' || v_uid);
  end if;
  if v_content_cents > 0 then
    -- Each creator's share by their valid content views, in whole cents; the
    -- cents left over go to the creator with the most views (computed before
    -- inserting: revenue entries are append-only).
    for r in
      with v as (
        select i.creator_id, count(*) as views
        from ads.impressions i
        where i.campaign_id = c.id and i.viewed_at is not null and i.surface = 'content' and i.creator_id is not null
          and pg_catalog.date_trunc('month', i.viewed_at)::date = v_month
        group by i.creator_id),
      s as (
        select v.creator_id, v.views, v_content_cents * v.views / v_content as base,
               pg_catalog.row_number() over (order by v.views desc, v.creator_id) as rn
        from v)
      select s.creator_id, s.base + case when s.rn = 1 then v_content_cents - (select sum(base) from s) else 0 end as cents
      from s
    loop
      if r.cents > 0 then
        insert into sim.revenue_entries (month, kind, creator_id, net_cents, note, recorded_by)
        values (v_month, 'content_ad', r.creator_id, r.cents, 'campaign ' || c.id || ' (content)', 'founder:' || v_uid);
      end if;
    end loop;
  end if;
  return pg_catalog.jsonb_build_object('content_cents', v_content_cents, 'feed_cents', p_net_cents - v_content_cents,
                                       'content_impressions', v_content, 'feed_impressions', v_feed);
end;
$$;
comment on function public.app_founder_attribute_campaign_revenue(uuid, date, bigint) is 'Founder: attributes a campaign''s SIMULATED net revenue for a finished, open month: content-associated share to creators by valid views (40/20/40), feed share to Splitpost. Once per campaign and month.';
revoke all on function public.app_founder_attribute_campaign_revenue(uuid, date, bigint) from public, anon;
grant execute on function public.app_founder_attribute_campaign_revenue(uuid, date, bigint) to authenticated;

-- Lock down: the ads schema is reached only through the functions above.
revoke all on all tables in schema ads from public, anon, authenticated;
revoke all on all functions in schema ads from public, anon, authenticated;
