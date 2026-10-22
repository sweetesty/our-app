-- ============================================================================
-- 0062_ludo_colours.sql — pick your colour, and show the die you rolled
-- ============================================================================
-- Two things were wrong, and one of them was only wrong-looking.
--
-- Seats were nailed to red and blue. A Ludo board has four corners and the
-- colour you play is part of playing — so the colour is a choice now, stored on
-- the match, and either of you can take any of the four. The board still draws
-- all four quadrants, because that is what a Ludo board looks like; the two
-- nobody picked are simply empty.
--
-- And the roll vanished. When a roll could not be used — four tokens in the
-- yard and anything but a six — the engine cleared `dice` and passed the turn,
-- so the screen showed a dash and it looked as though nothing had happened.
-- `last` keeps the number that was actually thrown, whatever became of it.

-- Where each colour joins the ring, going clockwise.
create or replace function public.ludo_entry(colour text)
returns int
language sql
immutable
as $$
  select case colour
           when 'red' then 0
           when 'green' then 13
           when 'yellow' then 26
           when 'blue' then 39
           else 0
         end;
$$;

-- Replaces the seat-based version. The seat no longer decides the road; the
-- colour does.
create or replace function public.ludo_square_of(colour text, progress int)
returns int
language sql
immutable
as $$
  select case
    when progress between 1 and 51
      then (public.ludo_entry(colour) + progress - 1) % 52
  end;
$$;

create or replace function public.ludo_new_state(
  colour_a text default 'red',
  colour_b text default 'blue'
)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'colours', jsonb_build_object('a', colour_a, 'b', colour_b),
    'tokens', jsonb_build_object(
      'a', jsonb_build_array(0, 0, 0, 0),
      'b', jsonb_build_array(0, 0, 0, 0)
    ),
    'dice', null,
    -- The number actually thrown, kept even when the turn passed because of it.
    'last', null,
    'sixes', 0,
    'log', jsonb_build_array(),
    'moved', null,
    'ate', null
  );
$$;

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
  c_a      text;
  c_b      text;
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

  -- Whoever starts the game picks first; the other gets the opposite corner
  -- unless they asked for something specific, because opposite corners is the
  -- fairest two-handed board.
  c_a := coalesce(opts ->> 'colour', 'red');
  if c_a not in ('red', 'green', 'yellow', 'blue') then c_a := 'red'; end if;
  c_b := case c_a
           when 'red' then 'yellow'
           when 'yellow' then 'red'
           when 'green' then 'blue'
           else 'green'
         end;

  seed := case game_name
            when 'ayo'  then public.ayo_new_state()
            when 'ludo' then public.ludo_new_state(c_a, c_b)
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

-- ---------------------------------------------------------------------------
-- rolling, with the number kept
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
  k     int;
  can   boolean := false;
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
  if jsonb_array_length(log) > 10 then
    select coalesce(jsonb_agg(value), '[]'::jsonb) into log
    from jsonb_array_elements(log) with ordinality t(value, ord)
    where ord > jsonb_array_length(log) - 10;
  end if;

  -- Three sixes running and the turn is lost. Without it a hot streak never
  -- ends and the other person just watches.
  if d = 6 and sixes >= 2 then
    update public.board_matches
    set state = m.state || jsonb_build_object(
          'dice', null, 'last', d, 'sixes', 0, 'log', log,
          'moved', null, 'ate', null, 'note', 'Three sixes — turn lost'
        ),
        turn = case when seat = 'a' then 'b' else 'a' end
    where id = match;
    return d;
  end if;

  mine := array(select jsonb_array_elements_text(m.state #> array['tokens', seat])::int);
  for k in 1..4 loop
    if mine[k] = 0 then
      if d = 6 then can := true; end if;
    elsif mine[k] < 57 and mine[k] + d <= 57 then
      can := true;
    end if;
  end loop;

  if not can then
    update public.board_matches
    set state = m.state || jsonb_build_object(
          'dice', null,
          'last', d,
          'sixes', case when d = 6 then sixes + 1 else 0 end,
          'log', log, 'moved', null, 'ate', null,
          'note', case when d = 6 then 'A six, but nothing it can move'
                       else format('Rolled %s — you need a six to come out', d) end
        ),
        turn = case when seat = 'a' then 'b' else 'a' end
    where id = match;
    return d;
  end if;

  update public.board_matches
  set state = m.state || jsonb_build_object(
        'dice', d,
        'last', d,
        'sixes', case when d = 6 then sixes + 1 else 0 end,
        'log', log, 'note', null
      )
  where id = match;

  return d;
end;
$$;

-- ---------------------------------------------------------------------------
-- moving, by colour
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
  my_col   text;
  their_col text;
  d        int;
  mine     int[];
  theirs   int[];
  from_p   int;
  to_p     int;
  landed   int;
  k        int;
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

  other     := case when seat = 'a' then 'b' else 'a' end;
  my_col    := coalesce(m.state #>> array['colours', seat], 'red');
  their_col := coalesce(m.state #>> array['colours', other], 'blue');

  mine   := array(select jsonb_array_elements_text(m.state #> array['tokens', seat])::int);
  theirs := array(select jsonb_array_elements_text(m.state #> array['tokens', other])::int);

  from_p := mine[token + 1];

  if from_p = 0 then
    if d <> 6 then raise exception 'You need a six to come out'; end if;
    to_p := 1;
  elsif from_p >= 57 then
    raise exception 'That one is already home';
  else
    to_p := from_p + d;
    if to_p > 57 then raise exception 'That needs an exact roll'; end if;
  end if;

  mine[token + 1] := to_p;
  landed := public.ludo_square_of(my_col, to_p);

  if landed is not null and not public.ludo_safe(landed) then
    for k in 1..4 loop
      if theirs[k] between 1 and 51
         and public.ludo_square_of(their_col, theirs[k]) = landed then
        theirs[k] := 0;
        ate := landed;
        again := true;
      end if;
    end loop;
  end if;

  if d = 6 or to_p = 57 then
    again := true;
  end if;

  for k in 1..4 loop
    if mine[k] = 57 then home_n := home_n + 1; end if;
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

grant execute on function public.ludo_entry(text) to authenticated;
grant execute on function public.ludo_square_of(text, int) to authenticated;
grant execute on function public.ludo_new_state(text, text) to authenticated;
grant execute on function public.ludo_roll(uuid) to authenticated;
grant execute on function public.ludo_move(uuid, int) to authenticated;
grant execute on function public.start_board(text, jsonb) to authenticated;
