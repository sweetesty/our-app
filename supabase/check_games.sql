-- ============================================================================
-- check_games.sql — which of 0054–0070 actually landed?
-- ============================================================================
-- Not a migration. Paste the whole thing in; it is one query.
--
-- The earlier checker asks "does this object exist", which is enough when a
-- migration creates something. Most of these do not: they REPLACE a function
-- that already existed, so the name is there either way and existence proves
-- nothing. A fix can be missing while everything looks present.
--
-- So this reads the function bodies and looks for a marker from each change —
-- a variable, a clause, a phrase that only the fixed version contains. It is
-- the difference between "the function is there" and "the function is the one
-- with the fix in it".

with src as (
  select p.proname, pg_get_functiondef(p.oid) as def
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
),
has_obj(name, kind, present) as (
  select 'board_matches', 'table', exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'board_matches')
  union all select 'board_hands', 'table', exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'board_hands')
  union all select 'board_secrets', 'table', exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'board_secrets')
  union all select 'board_chat', 'table', exists (select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'board_chat')
  union all select 'options column', 'column', exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'board_matches' and column_name = 'options')
),
checks(ord, migration, test, ok) as (
  select 1, '0054 board games', 'board_matches + start_board',
         (select present from has_obj where name = 'board_matches')
         and exists (select 1 from src where proname = 'start_board')

  union all select 2, '0055 whot', 'hands + market tables, whot_play',
         (select present from has_obj where name = 'board_hands')
         and (select present from has_obj where name = 'board_secrets')
         and exists (select 1 from src where proname = 'whot_play')

  union all select 3, '0056 ayo frames', 'ayo_move records every seed drop',
         exists (select 1 from src where proname = 'ayo_move' and def like '%frames%')

  union all select 4, '0057 house rules', 'options column + whot_count',
         (select present from has_obj where name = 'options column')
         and exists (select 1 from src where proname = 'whot_count')

  union all select 5, '0058/0062 ludo', 'ludo_roll + colours',
         exists (select 1 from src where proname = 'ludo_roll')
         and exists (select 1 from src where proname = 'ludo_new_state' and def like '%colours%')

  union all select 6, '0059 history', 'board_history + board_record',
         exists (select 1 from src where proname = 'board_history')
         and exists (select 1 from src where proname = 'board_record')

  union all select 7, '0060 one start_board', 'exactly one start_board',
         (select count(*) from src where proname = 'start_board') = 1

  union all select 8, '0061 whot deal fix', 'start_whot uses ord, not i',
         exists (select 1 from src where proname = 'start_whot' and def like '%ord%')

  union all select 9, '0061 turn push', 'board_turn_push trigger',
         exists (select 1 from pg_trigger where tgname = 'board_turn_push')

  union all select 10, '0063 ludo entries', 'blue enters at 0',
         exists (select 1 from src where proname = 'ludo_entry'
                 and def like '%''blue''%then 0%')

  union all select 11, '0064 board chat', 'table + push trigger',
         (select present from has_obj where name = 'board_chat')
         and exists (select 1 from pg_trigger where tgname = 'board_chat_push')

  union all select 12, '0066 three tries', 'ludo_roll counts tries',
         exists (select 1 from src where proname = 'ludo_roll' and def like '%tries%')

  union all select 13, '0067 budget per type', 'limit counts l.type, not l.tier',
         exists (select 1 from src where proname = 'push_allowed'
                 and def like '%l.type = kind%')

  union all select 14, '0068 count ends', 'whot_settle_count + deck trigger',
         exists (select 1 from src where proname = 'whot_settle_count')
         and exists (select 1 from pg_trigger where tgname = 'whot_market_empty')

  union all select 15, '0069 last action card', 'whot_play sends you to market',
         exists (select 1 from src where proname = 'whot_play'
                 and def like '%went_to_market%')

  union all select 16, '0070 realtime', 'game_answers is published',
         exists (
           select 1 from pg_publication_rel pr
           join pg_publication p on p.oid = pr.prpubid
           join pg_class c on c.oid = pr.prrelid
           where p.pubname = 'supabase_realtime' and c.relname = 'game_answers'
         )
)
select
  migration,
  test,
  case when ok then '✅ applied' else '❌ MISSING — run this one' end as status
from checks
order by ord;
