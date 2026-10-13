-- ============================================================================
-- 0054_board_games.sql — real board games, and the table they all sit on
-- ============================================================================
-- The eleven games in 0046 are prompts and answers: no state, no rules, no turn
-- order. Ayo, Whot and Ludo are a different animal — legal moves, capture,
-- hidden hands, a winner.
--
-- One decision shapes all of it: THE RULES RUN IN POSTGRES. Not in the browser.
-- A board game whose legal-move check lives in the client is a board game where
-- anyone with devtools wins every time, and "my partner cheats at Ludo" should
-- stay a joke rather than becoming true. The client draws the board and sends
-- "I want to play pit 3"; everything else happens here.
--
-- `state` is jsonb because the three games have nothing in common structurally
-- — pits and seeds, a hand of cards, four tokens on a track. What they do share
-- is a match, two players, whose turn it is, and a winner, and that is exactly
-- what this table holds.

create table if not exists public.board_matches (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  game        text not null check (game in ('ayo', 'whot', 'ludo')),
  -- The two seats. Fixed at creation so "your side of the board" never moves.
  player_a    uuid not null references public.profiles (id) on delete cascade,
  player_b    uuid references public.profiles (id) on delete set null,
  -- 'a' or 'b'. Not a user id, because the board is written in terms of seats.
  turn        text not null default 'a' check (turn in ('a', 'b')),
  state       jsonb not null,
  winner      text check (winner in ('a', 'b', 'draw')),
  -- Why it ended, in words the screen can show without inventing any.
  outcome     text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists board_matches_couple_idx
  on public.board_matches (couple_id, game, finished_at nulls first);

-- One game of each on the go at a time. Two open Ludo boards means one of them
-- is a ghost, and a ghost board is a notification about a move nobody made.
create unique index if not exists board_matches_open_idx
  on public.board_matches (couple_id, game) where finished_at is null;

alter table public.board_matches enable row level security;

-- Readable by the couple. Writable only through the RPCs below — this is the
-- one table in the app where a direct update would be cheating, so there is no
-- insert or update policy at all.
drop policy if exists board_matches_read on public.board_matches;
create policy board_matches_read on public.board_matches
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists board_matches_delete on public.board_matches;
create policy board_matches_delete on public.board_matches
  for delete to authenticated
  using (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- which seat am I
-- ---------------------------------------------------------------------------

create or replace function public.board_seat(m public.board_matches)
returns text
language sql
stable
as $$
  select case when m.player_a = auth.uid() then 'a'
              when m.player_b = auth.uid() then 'b' end;
$$;

-- ---------------------------------------------------------------------------
-- Ayo
-- ---------------------------------------------------------------------------
-- Twelve houses in a ring, six a side, four seeds in each. Sowing runs
-- anticlockwise: houses 0–5 belong to seat A, 6–11 to seat B, and the house
-- opposite i is 11 − i.
--
-- The rules implemented, stated plainly because every family plays a variant
-- and this is the one the screen is honest about:
--
--   * You may only start from a house on your own side that has seeds in it.
--   * Seeds are sown one per house, anticlockwise, skipping the house you
--     emptied if you come all the way round to it.
--   * RELAY SOWING: if the last seed lands in a house that already had seeds,
--     you pick up everything in that house and carry on sowing.
--   * The lap ends when the last seed lands in an empty house.
--   * CAPTURE: if that empty house is on your own side and the house opposite
--     has seeds, you take those seeds and your last one.
--   * The game ends when the player to move has nothing on their side. The
--     other player takes every seed still on the board. Most seeds wins.

create or replace function public.ayo_new_state()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'pits',  jsonb_build_array(4,4,4,4,4,4,4,4,4,4,4,4),
    'store', jsonb_build_object('a', 0, 'b', 0),
    -- The houses the last move touched, so the board can animate the sowing
    -- rather than teleporting. Purely cosmetic, and the client may ignore it.
    'path',  jsonb_build_array(),
    'took',  jsonb_build_array()
  );
$$;

-- Start one, or rejoin the one already on the table.
create or replace function public.start_board(game_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid      uuid := public.current_couple_id();
  existing uuid;
  fresh    uuid;
  seed     jsonb;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  select id into existing from public.board_matches
  where couple_id = cid and game = game_name and finished_at is null;

  if existing is not null then
    return existing;
  end if;

  seed := case game_name
            when 'ayo' then public.ayo_new_state()
            else '{}'::jsonb
          end;

  if seed = '{}'::jsonb then
    raise exception '% is not built yet', game_name;
  end if;

  insert into public.board_matches (couple_id, game, player_a, player_b, state)
  values (cid, game_name, auth.uid(), public.partner_id(), seed)
  returning id into fresh;

  return fresh;
end;
$$;

-- A move. Validates, applies, decides whether that ended it.
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
  path     int[] := '{}';
  took     int[] := '{}';
  laps     int := 0;
  mine_lo  int;
  mine_hi  int;
  next_lo  int;
  next_hi  int;
  left_on_board int;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();

  if not found then
    raise exception 'No such game';
  end if;
  if m.finished_at is not null then
    raise exception 'That game is over';
  end if;

  seat := public.board_seat(m);
  if seat is null then
    raise exception 'You are not in this game';
  end if;
  if seat <> m.turn then
    raise exception 'Not your turn';
  end if;

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

  loop
    laps := laps + 1;
    -- Relay sowing can in principle run a long time; it cannot run forever
    -- with 48 seeds, but a malformed state should not be able to hang a
    -- connection either.
    exit when laps > 2000;

    while hand > 0 loop
      at := (at + 1) % 12;
      -- Skip the house you emptied, but only when coming back round to it.
      if at = origin then
        at := (at + 1) % 12;
      end if;
      pits[at + 1] := pits[at + 1] + 1;
      hand := hand - 1;
      path := path || at;
    end loop;

    -- Landed in a house that already had seeds: pick the lot up and carry on.
    if pits[at + 1] > 1 then
      hand := pits[at + 1];
      pits[at + 1] := 0;
      origin := at;
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
    end if;
  end if;

  -- Whose turn next, and can they actually move?
  next_lo := case when seat = 'a' then 6 else 0 end;
  next_hi := next_lo + 5;

  left_on_board := 0;
  for at in next_lo..next_hi loop
    left_on_board := left_on_board + pits[at + 1];
  end loop;

  if left_on_board = 0 then
    -- They have nothing to play. Everything still on the board goes to the
    -- player who does — the standard way Ayo ends rather than stalls.
    for at in 0..11 loop
      if seat = 'a' then
        store_a := store_a + pits[at + 1];
      else
        store_b := store_b + pits[at + 1];
      end if;
      pits[at + 1] := 0;
    end loop;

    update public.board_matches
    set state = jsonb_build_object(
          'pits', to_jsonb(pits),
          'store', jsonb_build_object('a', store_a, 'b', store_b),
          'path', to_jsonb(path),
          'took', to_jsonb(took)
        ),
        winner = case when store_a > store_b then 'a'
                      when store_b > store_a then 'b'
                      else 'draw' end,
        outcome = case
          when store_a = store_b then 'A draw — 24 seeds each.'
          else 'No seeds left to play. The rest went to whoever could still move.'
        end,
        finished_at = now()
    where id = match;
    return;
  end if;

  update public.board_matches
  set state = jsonb_build_object(
        'pits', to_jsonb(pits),
        'store', jsonb_build_object('a', store_a, 'b', store_b),
        'path', to_jsonb(path),
        'took', to_jsonb(took)
      ),
      turn = case when seat = 'a' then 'b' else 'a' end
  where id = match;

  -- Someone holding more than half the seeds cannot be caught.
  if store_a > 24 or store_b > 24 then
    update public.board_matches
    set winner = case when store_a > 24 then 'a' else 'b' end,
        outcome = 'More than half the seeds. It cannot be caught.',
        finished_at = now()
    where id = match;
  end if;
end;
$$;

-- Giving up, and clearing the board afterwards.
create or replace function public.resign_board(match uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m    public.board_matches;
  seat text;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found or m.finished_at is not null then
    return;
  end if;

  seat := public.board_seat(m);

  update public.board_matches
  set winner = case when seat = 'a' then 'b' else 'a' end,
      outcome = 'Resigned.',
      finished_at = now()
  where id = match;
end;
$$;

grant execute on function public.start_board(text) to authenticated;
grant execute on function public.ayo_move(uuid, int) to authenticated;
grant execute on function public.resign_board(uuid) to authenticated;
grant execute on function public.ayo_new_state() to authenticated;
grant execute on function public.board_seat(public.board_matches) to authenticated;

-- Realtime, so a move appears on the other board rather than on the next
-- refresh. A turn-based game where you have to reload to see their move is a
-- turn-based game nobody finishes.
do $$
begin
  alter publication supabase_realtime add table public.board_matches;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;
