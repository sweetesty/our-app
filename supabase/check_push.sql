-- ============================================================================
-- check_push.sql — is the notification chain actually joined up?
-- ============================================================================
-- Not a migration. push_diagnostics() returns one jsonb cell, which the SQL
-- editor truncates to whatever fits — so the interesting part is usually the
-- half you cannot see. This unpacks it into rows.
--
-- One query, because the editor only shows the result of the last statement.

with d as (select public.push_diagnostics() as j)
select item, value, meaning from (
  select 1 as ord,
         'Edge Function reachable' as item,
         (j -> 'configured')::text as value,
         case when (j ->> 'configured')::boolean
           then '✅ Postgres knows the URL and push is enabled'
           else '❌ private.push_config is empty or disabled — nothing will ever send'
         end as meaning
  from d

  union all
  select 2,
         'My devices',
         (j ->> 'my_devices'),
         case when (j ->> 'my_devices')::int > 0
           then '✅ you would receive one'
           else '⚠️ no device token — open the app on your phone and allow notifications'
         end
  from d

  union all
  select 3,
         'Their devices',
         (j ->> 'their_devices'),
         case when (j ->> 'their_devices')::int > 0
           then '✅ they would receive one'
           else '⚠️ nothing registered for them — they need to allow notifications too'
         end
  from d

  -- The hourly job matters only for vault letters: those become openable
  -- because time passed, so nothing writes a row to trigger them.
  union all
  select 4,
         'Hourly job',
         coalesce((j #>> '{jobs,0,name}'), 'none'),
         case when (j #>> '{jobs,0,active}') = 'true'
           then '✅ scheduled · last run ' || coalesce((j #>> '{jobs,0,last_run}'), '—')
           else '⚠️ not scheduled — vault letters will never announce themselves'
         end
  from d

  -- Which event types are budgeted, and how hard. An unbudgeted type still
  -- gets through, but it is a sign a trigger was added and never tiered.
  union all
  select 5,
         'Budget · ' || t.type,
         t.tier || ' · ' || coalesce(t.per_hour::text, 'no limit') || '/hr',
         case t.tier
           when 'always' then 'always gets through'
           when 'quiet'  then 'held between 10pm and 8am'
           else 'rate limited only'
         end
  from public.push_tiers t
  where t.type in ('turn', 'table_chat', 'message', 'nudge')

  -- Anything the budget threw away in the last day, with the reason.
  union all
  select 6,
         'Dropped · ' || l.type,
         to_char(l.sent_at, 'DD Mon HH24:MI'),
         coalesce(l.reason, 'unknown')
  from public.push_log l
  where not l.delivered
    and l.sent_at > now() - interval '1 day'

  -- And what did get sent, so "nothing arrives" can be told apart from
  -- "nothing was ever attempted".
  union all
  select 7,
         'Sent in the last hour',
         count(*)::text,
         case when count(*) = 0
           then 'nothing was attempted — no trigger fired'
           else 'Postgres posted these to the Edge Function'
         end
  from public.push_log
  where delivered and sent_at > now() - interval '1 hour'
) rows
order by ord, item;
