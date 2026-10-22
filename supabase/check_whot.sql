-- ============================================================================
-- check_whot.sql — what state is the Whot game actually in?
-- ============================================================================
-- Not a migration. "I tapped a card and nothing happened" has several very
-- different causes that look identical from a phone: the game is already over,
-- the rules were never stored, the market is empty, or it is simply not your
-- turn. This tells them apart.
--
-- One query, one shape of row. The first version unioned a three-column select
-- onto a two-column one, which is why it would not run.

with latest as (
  select m.*
  from public.board_matches m
  where m.couple_id = public.current_couple_id()
    and m.game = 'whot'
  order by m.started_at desc
  limit 1
),
facts(ord, item, value) as (
  select 1, 'Match', l.id::text from latest l

  union all
  select 2, 'Finished?',
         case when l.finished_at is null
           then 'no — still playable'
           else 'YES at ' || to_char(l.finished_at, 'DD Mon HH24:MI')
                || ' · ' || coalesce(l.outcome, '')
         end
  from latest l

  union all
  select 3, 'Rules stored',
         case when l.options = '{}'::jsonb or l.options is null
           then 'NONE — dealt before 0057, so Count/stacking do nothing'
           else l.options::text
         end
  from latest l

  union all
  select 4, 'Market left',
         coalesce((
           select jsonb_array_length(s.deck)::text
           from public.board_secrets s where s.match_id = l.id
         ), 'no secrets row — the deal never happened')
  from latest l

  union all
  select 5, 'Pile size',
         coalesce((
           select jsonb_array_length(s.pile)::text
           from public.board_secrets s where s.match_id = l.id
         ), '—')
  from latest l

  union all
  select 6, 'Whose turn',
         l.turn || case when l.turn = public.board_seat(l)
                     then ' (you)' else ' (them)' end
  from latest l

  union all
  select 7, 'Cards owed', coalesce(l.state ->> 'pending', '0') from latest l

  union all
  select 8, 'My hand',
         coalesce((
           select jsonb_array_length(h.cards)::text
           from public.board_hands h
           where h.match_id = l.id and h.user_id = auth.uid()
         ), 'no hand row')
  from latest l

  union all
  select 9, 'Top card',
         coalesce((l.state #>> '{top,s}') || ' ' || (l.state #>> '{top,n}'), '—')
  from latest l

  union all
  select 10, 'Shape called', coalesce(l.state ->> 'called', 'none') from latest l
)
select item, value from facts order by ord;
