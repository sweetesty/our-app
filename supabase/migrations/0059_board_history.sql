-- ============================================================================
-- 0059_board_history.sql — the record, and who is on a run
-- ============================================================================
-- No stakes and no pot. The only thing worth keeping is who won, and the only
-- thing worth saying about it is "that's four in a row" — which is the part
-- that makes the next game mean something.
--
-- Nothing new is stored. Every finished match already sits in board_matches
-- with a winner and a finish time, so the record is a read over rows that are
-- already there. A separate results table would be a second copy of the truth
-- and would eventually disagree with the first.
--
-- The streak is current-only and deliberately short-lived: it counts back from
-- the most recent game and stops at the first one that broke it. A lifetime
-- ranking between two people who love each other is a worse idea than it
-- sounds.

create or replace function public.board_history(
  for_game text default null,
  limit_count int default 20
)
returns table (
  id          uuid,
  game        text,
  won_by_me   boolean,
  drawn       boolean,
  outcome     text,
  finished_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    m.id,
    m.game,
    m.winner = public.board_seat(m),
    m.winner = 'draw',
    m.outcome,
    m.finished_at
  from public.board_matches m
  where m.couple_id = public.current_couple_id()
    and m.finished_at is not null
    and (for_game is null or m.game = for_game)
  order by m.finished_at desc
  limit least(greatest(limit_count, 1), 100);
$$;

-- Played, won, lost, drawn — per game and overall — plus whoever is currently
-- on a run.
create or replace function public.board_record(for_game text default null)
returns table (
  game       text,
  played     int,
  i_won      int,
  they_won   int,
  drawn      int,
  -- How many in a row the current streak is, and whose it is. Zero when the
  -- last result was a draw, because a draw ends a run without starting one.
  streak     int,
  streak_mine boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g record;
  r record;
  run int;
  mine boolean;
begin
  for g in
    select m.game as name
    from public.board_matches m
    where m.couple_id = public.current_couple_id()
      and m.finished_at is not null
      and (for_game is null or m.game = for_game)
    group by m.game
  loop
    run := 0;
    mine := null;

    -- Walk back from the most recent and stop the moment it changes hands.
    for r in
      select m.winner = public.board_seat(m) as won, m.winner as w
      from public.board_matches m
      where m.couple_id = public.current_couple_id()
        and m.game = g.name
        and m.finished_at is not null
      order by m.finished_at desc
    loop
      exit when r.w = 'draw';
      if mine is null then
        mine := r.won;
        run := 1;
      elsif r.won = mine then
        run := run + 1;
      else
        exit;
      end if;
    end loop;

    return query
    select
      g.name,
      count(*)::int,
      count(*) filter (where m.winner = public.board_seat(m))::int,
      count(*) filter (where m.winner <> 'draw'
                         and m.winner <> public.board_seat(m))::int,
      count(*) filter (where m.winner = 'draw')::int,
      run,
      mine
    from public.board_matches m
    where m.couple_id = public.current_couple_id()
      and m.game = g.name
      and m.finished_at is not null;
  end loop;
end;
$$;

grant execute on function public.board_history(text, int) to authenticated;
grant execute on function public.board_record(text) to authenticated;

-- Finished boards are worth keeping — they are the record — but not forever.
-- A year of them is more than anybody looks back through.
create or replace function public.prune_boards()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.board_matches
  where finished_at is not null and finished_at < now() - interval '1 year';
$$;
