-- ============================================================================
-- 0058_ludo.sql — Ludo
-- ============================================================================
-- The board is 52 squares round the outside and a six-square run home for each
-- player. A token's whole life is one number: how far it has come.
--
--   0        in the yard, waiting for a six
--   1–51     out on the ring
--   52–57    up the home column
--   57       home
--
-- The square it is actually standing on is (start + progress − 1) mod 52, so
-- two players can share one ring and still each have their own road. That one
-- encoding removes most of the geometry; the alternative is storing coordinates
-- and recomputing who is where on every move.
--
-- Rolling and moving are two calls, not one, because that is how the game feels:
-- you roll, you see it, you decide which token wears it. Both are here rather
-- than in the browser — a dice roll computed on the client is not a dice roll.
--
-- Two seats, as everywhere else in this app. Seat A is red and starts at 0,
-- seat B is blue and starts at 26 — opposite corners, which is the fairest
-- two-handed setup.

-- Safe squares: the four starting squares and the four stars. A token on one
-- cannot be sent home.
create or replace function public.ludo_safe(square int)
returns boolean
language sql
immutable
as $$
  select square in (0, 8, 13, 21, 26, 34, 39, 47);
$$;

create or replace function public.ludo_start(seat text)
returns int
language sql
immutable
as $$
  select case when seat = 'a' then 0 else 26 end;
$$;

/** The ring square a token stands on, or null if it is in the yard or home. */
create or replace function public.ludo_square(seat text, progress int)
returns int
language sql
immutable
as $$
  select case
    when progress between 1 and 51
      then (public.ludo_start(seat) + progress - 1) % 52
  end;
$$;

create or replace function public.ludo_new_state()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'tokens', jsonb_build_object(
      'a', jsonb_build_array(0, 0, 0, 0),
      'b', jsonb_build_array(0, 0, 0, 0)
    ),
    -- Null means the player to move has not rolled yet.
    'dice', null,
    'sixes', 0,
    -- The last few rolls, for the strip along the top of the board.
    'log', jsonb_build_array(),
    'moved', null,
    'ate', null
  );
$$;

-- ---------------------------------------------------------------------------
-- rolling
-- ---------------------------------------------------------------------------

create or replace function public.ludo_roll(match uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m     public.board_matches;
  seat  text;
  d     int;
  sixes int;
  mine  int[];
  i     int;
  can   boolean := false;
  sq    int;
  log   jsonb;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then raise exception 'No such game'; end if;
  if m.finished_at is not null then raise exception 'That game is over'; end if;

  seat := public.board_seat(m);
  if seat is null then raise exception 'You are not in this game'; end if;
  if seat <> m.turn then raise exception 'Not your turn'; end if;
  if m.state ->> 'dice' is not null then raise exception 'You have already rolled'; end if;

  d := floor(random() * 6)::int + 1;
  sixes := coalesce((m.state ->> 'sixes')::int, 0);

  log := (m.state -> 'log') || jsonb_build_object('seat', seat, 'd', d);
  -- Keep the strip short; it is a glance, not a transcript.
  if jsonb_array_length(log) > 8 then
    log := (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from jsonb_array_elements(log) with ordinality t(value, idx)
      where idx > jsonb_array_length(log) - 8
    );
  end if;

  -- Three sixes running and you lose the turn. Without this a lucky streak can
  -- go on indefinitely and the other person just watches.
  if d = 6 and sixes >= 2 then
    update public.board_matches
    set state = m.state || jsonb_build_object(
          'dice', null, 'sixes', 0, 'log', log,
          'moved', null, 'ate', null, 'note', 'Three sixes — turn lost'
        ),
        turn = case when seat = 'a' then 'b' else 'a' end
    where id = match;
    return d;
  end if;

  -- Is there anything at all this roll can do? If not, the turn passes rather
  -- than leaving them staring at a board with no legal move.
  mine := array(select jsonb_array_elements_text(m.state #> array['tokens', seat])::int);
  for i in 1..4 loop
    if mine[i] = 0 then
      if d = 6 then can := true; end if;
    elsif mine[i] < 57 then
      if mine[i] + d <= 57 then can := true; end if;
    end if;
  end loop;

  if not can then
    update public.board_matches
    set state = m.state || jsonb_build_object(
          'dice', null,
          'sixes', case when d = 6 then sixes + 1 else 0 end,
          'log', log, 'moved', null, 'ate', null,
          'note', 'Nothing to move'
        ),
        turn = case when seat = 'a' then 'b' else 'a' end
    where id = match;
    return d;
  end if;

  update public.board_matches
  set state = m.state || jsonb_build_object(
        'dice', d,
        'sixes', case when d = 6 then sixes + 1 else 0 end,
        'log', log, 'note', null
      )
  where id = match;

  return d;
end;
$$;

-- ---------------------------------------------------------------------------
-- moving
-- ---------------------------------------------------------------------------

create or replace function public.ludo_move(match uuid, token int)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m        public.board_matches;
  seat     text;
  other    text;
  d        int;
  mine     int[];
  theirs   int[];
  from_p   int;
  to_p     int;
  landed   int;
  i        int;
  ate      int := null;
  again    boolean := false;
  home_n   int := 0;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then raise exception 'No such game'; end if;
  if m.finished_at is not null then raise exception 'That game is over'; end if;

  seat := public.board_seat(m);
  if seat <> m.turn then raise exception 'Not your turn'; end if;

  d := (m.state ->> 'dice')::int;
  if d is null then raise exception 'Roll first'; end if;
  if token < 0 or token > 3 then raise exception 'No such token'; end if;

  other  := case when seat = 'a' then 'b' else 'a' end;
  mine   := array(select jsonb_array_elements_text(m.state #> array['tokens', seat])::int);
  theirs := array(select jsonb_array_elements_text(m.state #> array['tokens', other])::int);

  from_p := mine[token + 1];

  if from_p = 0 then
    -- Out of the yard, and only on a six.
    if d <> 6 then raise exception 'You need a six to come out'; end if;
    to_p := 1;
  elsif from_p >= 57 then
    raise exception 'That one is already home';
  else
    to_p := from_p + d;
    -- The home square has to be hit exactly; overshooting is not a move.
    if to_p > 57 then raise exception 'That needs an exact roll'; end if;
  end if;

  mine[token + 1] := to_p;
  landed := public.ludo_square(seat, to_p);

  -- Capture: land on a ring square holding one of theirs, and it goes back to
  -- the yard — unless the square is a safe one.
  if landed is not null and not public.ludo_safe(landed) then
    for i in 1..4 loop
      if theirs[i] between 1 and 51
         and public.ludo_square(other, theirs[i]) = landed then
        theirs[i] := 0;
        ate := landed;
        again := true;
      end if;
    end loop;
  end if;

  -- A six, a capture, or getting one home all earn another roll.
  if d = 6 or to_p = 57 then
    again := true;
  end if;

  for i in 1..4 loop
    if mine[i] = 57 then home_n := home_n + 1; end if;
  end loop;

  if home_n = 4 then
    update public.board_matches
    set state = m.state || jsonb_build_object(
          'tokens', jsonb_build_object(seat, to_jsonb(mine), other, to_jsonb(theirs)),
          'dice', null, 'sixes', 0, 'moved', token, 'ate', ate, 'note', null
        ),
        winner = seat,
        outcome = 'All four home.',
        finished_at = now()
    where id = match;
    return;
  end if;

  update public.board_matches
  set state = m.state || jsonb_build_object(
        'tokens', jsonb_build_object(seat, to_jsonb(mine), other, to_jsonb(theirs)),
        'dice', null,
        'sixes', case when again and d = 6 then coalesce((m.state ->> 'sixes')::int, 0) else 0 end,
        'moved', token,
        'ate', ate,
        'note', case when ate is not null then 'Sent one home' end
      ),
      turn = case when again then seat else other end
  where id = match;
end;
$$;

-- start_board learns the third game.
drop function if exists public.start_board(text);
create or replace function public.start_board(
  game_name text,
  opts jsonb default '{}'::jsonb
)
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
  settled  jsonb;
  seed     jsonb;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if game_name not in ('ayo', 'whot', 'ludo') then
    raise exception '% is not built yet', game_name;
  end if;

  select id into existing from public.board_matches
  where couple_id = cid and game = game_name and finished_at is null;

  if existing is not null then
    return existing;
  end if;

  settled := case when game_name = 'whot'
    then jsonb_build_object(
           'stacking', coalesce((opts ->> 'stacking')::boolean, true),
           'market_out', coalesce(opts ->> 'market_out', 'rollover')
         )
    else '{}'::jsonb end;

  seed := case game_name
            when 'ayo'  then public.ayo_new_state()
            when 'ludo' then public.ludo_new_state()
            else '{}'::jsonb
          end;

  insert into public.board_matches (couple_id, game, player_a, player_b, state, options)
  values (cid, game_name, auth.uid(), public.partner_id(), seed, settled)
  returning id into fresh;

  if game_name = 'whot' then
    perform public.start_whot(fresh);
  end if;

  return fresh;
end;
$$;

alter table public.board_matches drop constraint if exists board_matches_game_check;
alter table public.board_matches add constraint board_matches_game_check
  check (game in ('ayo', 'whot', 'ludo'));

grant execute on function public.ludo_roll(uuid) to authenticated;
grant execute on function public.ludo_move(uuid, int) to authenticated;
grant execute on function public.ludo_safe(int) to authenticated;
grant execute on function public.ludo_square(text, int) to authenticated;
grant execute on function public.ludo_new_state() to authenticated;
grant execute on function public.start_board(text, jsonb) to authenticated;
