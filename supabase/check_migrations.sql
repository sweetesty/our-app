-- ============================================================================
-- check_migrations.sql — did 0038–0053 actually land?
-- ============================================================================
-- Not a migration. Paste the whole thing into the SQL editor and read the
-- answer.
--
-- Deliberately ONE query. The editor only shows the result of the last
-- statement, so a file of three queries silently throws the first two away.
--
-- It checks for the objects each migration should have created rather than for
-- a row in a migrations table — a file can be pasted in, fail halfway, and
-- still leave you certain you ran it. This looks at what is actually there.

with expected(migration, kind, name) as (values
  ('0038 card rounds',      'table',    'card_rounds'),
  ('0038 card rounds',      'function', 'current_round'),
  ('0038 card rounds',      'function', 'answer_card'),
  ('0038 card rounds',      'function', 'next_card'),
  ('0039 custom nudges',    'table',    'custom_nudges'),
  ('0039 custom nudges',    'column',   'nudges.emoji'),
  ('0042 handbook',         'table',    'handbook_entries'),
  ('0042 handbook',         'table',    'handbook_acks'),
  ('0042 handbook',         'table',    'handbook_sections'),
  ('0042 handbook',         'function', 'handbook'),
  ('0042 handbook',         'function', 'ack_handbook'),
  ('0044 bucket list',      'table',    'bucket_items'),
  ('0044 bucket list',      'function', 'complete_bucket_item'),
  ('0045 date generator',   'table',    'date_ideas'),
  ('0045 date generator',   'table',    'date_picks'),
  ('0046 games',            'table',    'games'),
  ('0046 games',            'table',    'game_prompts'),
  ('0046 games',            'table',    'game_sessions'),
  ('0046 games',            'table',    'game_rounds'),
  ('0046 games',            'table',    'game_answers'),
  ('0046 games',            'function', 'start_game'),
  ('0046 games',            'function', 'current_game_round'),
  ('0048 date generator+',  'function', 'plan_date'),
  ('0050 fights',           'table',    'fights'),
  ('0050 fights',           'function', 'fight_stats'),
  ('0050 fights',           'function', 'log_fight'),
  ('0051 search',           'function', 'search_everything'),
  ('0052 on this day',      'function', 'on_this_day'),
  ('0052 on this day',      'function', 'answered_before'),
  ('0053 push budget',      'table',    'push_log'),
  ('0053 push budget',      'table',    'push_tiers'),
  ('0053 push budget',      'function', 'push_allowed'),
  ('0053 push budget',      'column',   'couples.timezone')
),
present as (
  select e.migration, e.name,
    case e.kind
      when 'table' then exists (
        select 1 from information_schema.tables
        where table_schema = 'public' and table_name = e.name
      )
      when 'function' then exists (
        select 1 from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = e.name
      )
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = split_part(e.name, '.', 1)
          and column_name = split_part(e.name, '.', 2)
      )
    end as ok
  from expected e
),
schema_check as (
  select
    1 as ord,
    migration as item,
    (count(*) filter (where ok))::text || '/' || count(*)::text as found,
    case when count(*) filter (where not ok) = 0
      then '✅ OK'
      else '❌ MISSING: ' || string_agg(name, ', ') filter (where not ok)
    end as status
  from present
  group by migration
),
-- The seeds are the half that fails quietly: a migration can report success
-- and insert nothing at all.
seeds(item, actual, expected) as (
  select 'seed · handbook sections',
         (select count(*) from public.handbook_sections where couple_id is null), 92
  union all select 'seed · games',
         (select count(*) from public.games), 11
  union all select 'seed · game prompts',
         (select count(*) from public.game_prompts where couple_id is null), 152
  union all select 'seed · date ideas',
         (select count(*) from public.date_ideas where couple_id is null), 91
  union all select 'seed · built-in cards',
         (select count(*) from public.cards where couple_id is null), 151
  union all select 'seed · push tiers',
         (select count(*) from public.push_tiers), 20
),
seed_check as (
  select 2 as ord, item,
         actual::text || '/~' || expected::text as found,
         case
           when actual = 0 then '❌ EMPTY — the seed did not run'
           -- Counted from the migration files rather than estimated. A few
           -- over is fine — a seed run twice before 0049 added its unique
           -- index could leave near-duplicates that differ by whitespace.
           when actual < expected then '⚠️ short of expected'
           else '✅ OK'
         end as status
  from seeds
),
-- Not a schema object, so nothing else would catch it. Quiet hours are
-- computed against this, and UTC is the wrong night for anyone outside London.
tz_check as (
  select 3 as ord, 'setting · timezone' as item,
         coalesce(c.timezone, 'null') as found,
         case when c.timezone is null
           then '⚠️ not set — quiet hours will use UTC'
           else '✅ OK' end as status
  from public.couples c
)
select item, found, status from (
  select * from schema_check
  union all select * from seed_check
  union all select * from tz_check
) all_checks
order by ord, item;
