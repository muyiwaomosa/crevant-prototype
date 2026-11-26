-- Financial and advertising reconciliation (read-only; changes nothing).
--
-- One row per invariant: check, ok (true/false) and, when it fails, a short
-- detail with counts only (never a member). Safe to paste into the staging
-- SQL editor. Run by scripts/db/restore-drill.sh before a backup and after
-- the restore, and by the Browser CI job after every journey has run.
--
-- Everything here is SIMULATED pilot money: nothing is paid.

with
lines as (
  select settlement_id, sum(value_cents) as cents, sum(points) as points, min(value_cents) as min_cents
  from sim.settlement_lines group by settlement_id
),
settle as (
  select count(*) filter (where s.points > 0 and coalesce(l.cents, 0) <> s.pool_cents) as cents_off,
         count(*) filter (where coalesce(l.points, 0) <> s.points) as points_off,
         count(*) filter (where l.min_cents < 0) as negative
  from sim.settlements s left join lines l on l.settlement_id = s.id
),
redeemable as (
  -- An award's state is its latest review, settlement or reversal row (sim.award_state).
  select coalesce(sum(l.points) filter (where l.redeemable and sim.award_state(l.id) in ('approved', 'settled')), 0) as approved,
         count(*) filter (where not l.redeemable and sim.award_state(l.id) in ('pending_review', 'approved', 'settled')) as recognition_redeemed
  from sim.points_ledger l
  where l.reverses is null
),
monthly as (
  select count(*) as months_over
  from (select date_trunc('month', created_at) m, sum(points) p
        from sim.points_ledger where redeemable and reverses is null and points > 0 group by 1) x
  where x.p > (select monthly_redeemable_cap from sim.reward_settings where id)
),
imps as (
  select count(*) filter (where clicked_at is not null and viewed_at is null) as click_without_view,
         count(*) filter (where played_at is not null and viewed_at is null) as play_without_view,
         count(*) filter (where completed_at is not null and played_at is null) as complete_without_play,
         count(*) filter (where surface = 'feed' and (post_id is not null or creator_id is not null)) as feed_with_post,
         count(*) filter (where surface = 'content' and post_id is null) as content_without_post,
         count(*) filter (where viewed_at is not null and viewed_at < served_at) as viewed_before_served
  from ads.impressions
),
caps as (
  select (select count(*) from (select member_id, date_trunc('day', served_at) from ads.impressions
                                where member_id is not null group by 1, 2 having count(*) > 6) a) as member_days_over,
         (select count(*) from (select i.campaign_id, i.member_id, date_trunc('day', i.served_at)
                                from ads.impressions i join ads.campaigns c on c.id = i.campaign_id
                                where i.member_id is not null group by 1, 2, 3, c.daily_cap having count(*) > c.daily_cap) b) as campaign_days_over
),
switches as (
  select count(*) as out_of_step
  from ops.feature_switches s
  where s.updated_by <> 'migration'
    and s.enabled is distinct from (select e.enabled from ops.feature_switch_events e where e.feature = s.feature order by e.id desc limit 1)
)
select 'every closed month allocates exactly its pool, to the cent' as check, settle.cents_off = 0 as ok,
       case when settle.cents_off > 0 then settle.cents_off || ' month(s) off' end as detail from settle
union all
select 'every closed month''s lines carry exactly its points', settle.points_off = 0,
       case when settle.points_off > 0 then settle.points_off || ' month(s) off' end from settle
union all
select 'no settlement line is negative', settle.negative = 0, case when settle.negative > 0 then settle.negative || ' month(s)' end from settle
union all
select 'settled points never exceed approved redeemable points',
       (select coalesce(sum(points), 0) from sim.settlement_lines) <= redeemable.approved,
       case when (select coalesce(sum(points), 0) from sim.settlement_lines) > redeemable.approved
            then (select coalesce(sum(points), 0) from sim.settlement_lines) || ' settled, ' || redeemable.approved || ' approved' end from redeemable
union all
select 'recognition points are never reviewed for payment, approved or settled', redeemable.recognition_redeemed = 0,
       case when redeemable.recognition_redeemed > 0 then redeemable.recognition_redeemed || ' award(s)' end from redeemable
union all
select 'no month awarded more redeemable points than the cap', monthly.months_over = 0,
       case when monthly.months_over > 0 then monthly.months_over || ' month(s)' end from monthly
union all
select 'campaign revenue splits add up (posts + feed = net)',
       not exists (select 1 from ads.revenue_attributions where content_cents + feed_cents <> net_cents or content_cents < 0 or feed_cents < 0), null
union all
select 'a click, play or completion only follows a valid view',
       imps.click_without_view + imps.play_without_view + imps.complete_without_play + imps.viewed_before_served = 0,
       case when imps.click_without_view + imps.play_without_view + imps.complete_without_play + imps.viewed_before_served > 0
            then imps.click_without_view || ' clicks, ' || imps.play_without_view || ' plays, ' || imps.complete_without_play || ' completions, '
                 || imps.viewed_before_served || ' early views' end from imps
union all
select 'feed impressions carry no post or creator; post impressions carry their post',
       imps.feed_with_post + imps.content_without_post = 0,
       case when imps.feed_with_post + imps.content_without_post > 0 then imps.feed_with_post || ' feed, ' || imps.content_without_post || ' post' end from imps
union all
select 'no member was served more than 6 ads in a day', caps.member_days_over = 0,
       case when caps.member_days_over > 0 then caps.member_days_over || ' member-day(s)' end from caps
union all
select 'no member saw one campaign more than its daily cap', caps.campaign_days_over = 0,
       case when caps.campaign_days_over > 0 then caps.campaign_days_over || ' campaign-day(s)' end from caps
union all
select 'each operational switch matches its latest recorded change', switches.out_of_step = 0,
       case when switches.out_of_step > 0 then switches.out_of_step || ' switch(es)' end from switches
union all
-- The deletion register (20261216000000, docs/RECOVERY.md): a completed deletion
-- not yet in the function log after 30 minutes means reporting is failing.
-- Counts only; passes where the migration is not applied.
select 'every completed deletion reached the function log within 30 minutes', dr.waiting = 0,
       case when dr.waiting > 0 then dr.waiting || ' deletion(s) not yet logged' end
from (select case when to_regclass('ops.deletion_register') is null then 0
                  else (xpath('/row/n/text()', query_to_xml(
                          'select count(*) as n from ops.deletion_register where reported_at is null and occurred_at < pg_catalog.now() - interval ''30 minutes''',
                          false, true, '')))[1]::text::int end as waiting) dr;
