-- ============================================================================
-- 0056_ayo_frames.sql — so you can watch the seeds go round
-- ============================================================================
-- `ayo_move` returned where the seeds ended up and nothing about how they got
-- there, so the board could only ever snap from one position to the next. With
-- relay sowing that is especially bad: a good move can send seeds round the
-- board twice, and all you saw was a different arrangement appearing.
--
-- The client cannot reconstruct the journey either. The sown houses alone are
-- ambiguous — a relay pickup looks exactly like ordinary continued sowing from
-- the outside — so the only honest fix is for the engine to record each step as
-- it takes it.
--
-- `frames` is the whole board after every single seed drop, plus a frame each
-- time a relay empties a house. Twelve small integers per frame; even a long
-- relay is a few kilobytes, and it buys an animation that is exactly what
-- happened rather than a plausible guess.

create or replace function public.ayo_move(match uuid, house int)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m        public.board_matches;
  seat     text;
  pits     int[];
  store_a  int;
  store_b  int;
  hand     int;
  at       int;
  origin   int;
  opposite int;
  took     int[] := '{}';
  frames   jsonb := '[]'::jsonb;
  laps     int := 0;
  mine_lo  int;
  mine_hi  int;
  next_lo  int;
  next_hi  int;
  left_on_board int;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();

  if not found then raise exception 'No such game'; end if;
  if m.finished_at is not null then raise exception 'That game is over'; end if;

  seat := public.board_seat(m);
  if seat is null then raise exception 'You are not in this game'; end if;
  if seat <> m.turn then raise exception 'Not your turn'; end if;

  mine_lo := case when seat = 'a' then 0 else 6 end;
  mine_hi := mine_lo + 5;

  if house < mine_lo or house > mine_hi then
    raise exception 'That house is not yours';
  end if;

  pits := array(select jsonb_array_elements_text(m.state -> 'pits')::int);
  store_a := (m.state #>> '{store,a}')::int;
  store_b := (m.state #>> '{store,b}')::int;

  -- Postgres arrays are 1-based; the board is 0-based everywhere else, so the
  -- +1 lives here and nowhere else.
  if pits[house + 1] = 0 then
    raise exception 'That house is empty';
  end if;

  origin := house;
  hand := pits[origin + 1];
  pits[origin + 1] := 0;
  at := origin;

  -- The lift: the house you chose, emptied into your hand.
  frames := frames || jsonb_build_object('pits', to_jsonb(pits), 'at', origin, 'kind', 'lift');

  loop
    laps := laps + 1;
    exit when laps > 2000;

    while hand > 0 loop
      at := (at + 1) % 12;
      -- Skip the house you emptied, but only on the way round to it again.
      if at = origin then
        at := (at + 1) % 12;
      end if;
      pits[at + 1] := pits[at + 1] + 1;
      hand := hand - 1;

      -- One frame per seed. This is the whole point of the migration.
      if jsonb_array_length(frames) < 200 then
        frames := frames || jsonb_build_object('pits', to_jsonb(pits), 'at', at, 'kind', 'drop');
      end if;
    end loop;

    -- Landed in a house that already had seeds: pick the lot up, carry on.
    if pits[at + 1] > 1 then
      hand := pits[at + 1];
      pits[at + 1] := 0;
      origin := at;
      if jsonb_array_length(frames) < 200 then
        frames := frames || jsonb_build_object('pits', to_jsonb(pits), 'at', at, 'kind', 'relay');
      end if;
      continue;
    end if;

    exit;
  end loop;

  -- Capture: last seed into an empty house on your own side, with seeds facing
  -- it. Both the facing seeds and your own last one go to your store.
  if at >= mine_lo and at <= mine_hi then
    opposite := 11 - at;
    if pits[opposite + 1] > 0 then
      took := array[at, opposite];
      if seat = 'a' then
        store_a := store_a + pits[opposite + 1] + 1;
      else
        store_b := store_b + pits[opposite + 1] + 1;
      end if;
      pits[opposite + 1] := 0;
      pits[at + 1] := 0;
      frames := frames || jsonb_build_object('pits', to_jsonb(pits), 'at', at, 'kind', 'take');
    end if;
  end if;

  next_lo := case when seat = 'a' then 6 else 0 end;
  next_hi := next_lo + 5;

  left_on_board := 0;
  for at in next_lo..next_hi loop
    left_on_board := left_on_board + pits[at + 1];
  end loop;

  if left_on_board = 0 then
    for at in 0..11 loop
      if seat = 'a' then
        store_a := store_a + pits[at + 1];
      else
        store_b := store_b + pits[at + 1];
      end if;
      pits[at + 1] := 0;
    end loop;
    frames := frames || jsonb_build_object('pits', to_jsonb(pits), 'at', -1, 'kind', 'sweep');

    update public.board_matches
    set state = jsonb_build_object(
          'pits', to_jsonb(pits),
          'store', jsonb_build_object('a', store_a, 'b', store_b),
          'took', to_jsonb(took),
          'frames', frames
        ),
        winner = case when store_a > store_b then 'a'
                      when store_b > store_a then 'b'
                      else 'draw' end,
        outcome = case
          when store_a = store_b then 'A draw — 24 seeds each.'
          else 'Nothing left to play. The rest went to whoever could still move.'
        end,
        finished_at = now()
    where id = match;
    return;
  end if;

  update public.board_matches
  set state = jsonb_build_object(
        'pits', to_jsonb(pits),
        'store', jsonb_build_object('a', store_a, 'b', store_b),
        'took', to_jsonb(took),
        'frames', frames
      ),
      turn = case when seat = 'a' then 'b' else 'a' end
  where id = match;

  if store_a > 24 or store_b > 24 then
    update public.board_matches
    set winner = case when store_a > 24 then 'a' else 'b' end,
        outcome = 'More than half the seeds. It cannot be caught.',
        finished_at = now()
    where id = match;
  end if;
end;
$$;

grant execute on function public.ayo_move(uuid, int) to authenticated;
