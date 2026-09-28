-- ============================================================================
-- check_migrations.sql — did 0038–0053 actually land?
-- ============================================================================
-- Not a migration. Paste it into the SQL editor and read the answer.
--
-- Checks for the objects each file is supposed to have created, rather than
-- for a row in a migrations table — a file can be pasted in, fail halfway, and
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
  select e.migration, e.kind, e.name,
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
)
select
  migration,
  count(*) filter (where ok)     as found,
  count(*)                        as expected,
  case when count(*) filter (where not ok) = 0
    then 'OK'
    else 'MISSING: ' || string_agg(name, ', ') filter (where not ok)
  end as status
from present
group by migration
order by migration;

-- ---------------------------------------------------------------------------
-- and the seeds, which are the half that silently does nothing
-- ---------------------------------------------------------------------------

select 'handbook sections' as seed, count(*) as rows, 92  as expected
  from public.handbook_sections where couple_id is null
union all
select 'games',               count(*), 11   from public.games
union all
select 'game prompts',        count(*), 160  from public.game_prompts where couple_id is null
union all
select 'date ideas',          count(*), 92   from public.date_ideas where couple_id is null
union all
select 'cards (all decks)',   count(*), 152  from public.cards where couple_id is null
union all
select 'push tiers',          count(*), 20   from public.push_tiers;

-- ---------------------------------------------------------------------------
-- the one setting that is not a schema object
-- ---------------------------------------------------------------------------
-- Quiet hours are computed against this. Null means UTC, which for anyone not
-- in London is the wrong night.

select id, name, coalesce(timezone, '⚠️ not set — quiet hours will use UTC') as timezone
from public.couples;
