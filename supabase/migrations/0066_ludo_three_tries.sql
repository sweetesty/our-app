-- ============================================================================
-- 0066_ludo_three_tries.sql — three goes at a six when you are stuck in
-- ============================================================================
-- The die is not biased: floor(random() * 6) + 1 is flat, and every face comes
-- up a sixth of the time. What makes it *feel* rigged is the structure of the
-- opening. With all four tokens in the yard only a six does anything, so five
-- turns out of six you roll, nothing happens, and you hand over — and you sit
-- through your partner doing the same. Two or three minutes can go by with
-- neither of you on the board.
--
-- So: the rule most tables actually use. If you have nothing out, you get up to
-- three throws to find a six before the turn passes. It changes the chance of
-- leaving the yard on a given turn from one in six to nearly one in two, which
-- is the difference between a game starting and a game being waited out.
--
-- It only applies when you are completely stuck. With even one token on the
-- board a roll is always worth something, so there is nothing to rescue.

create or replace function public.ludo_roll(match uuid)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m        public.board_matches;
  seat     text;
  d        int;
  sixes    int;
  tries    int;
  mine     int[];
  k        int;
  can      boolean := false;
  all_home boolean := true;
  log      jsonb;
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
  tries := coalesce((m.state ->> 'tries')::int, 0);

  log := (m.state -> 'log') || jsonb_build_object('seat', seat, 'd', d);
  if jsonb_array_length(log) > 10 then
    select coalesce(jsonb_agg(value), '[]'::jsonb) into log
    from jsonb_array_elements(log) with ordinality t(value, ord)
    where ord > jsonb_array_length(log) - 10;
  end if;

  mine := array(select jsonb_array_elements_text(m.state #> array['tokens', seat])::int);

  -- Nothing out: every token is either waiting in the yard or already home.
  for k in 1..4 loop
    if mine[k] between 1 and 56 then all_home := false; end if;
    if mine[k] = 0 then
      if d = 6 then can := true; end if;
    elsif mine[k] < 57 and mine[k] + d <= 57 then
      can := true;
    end if;
  end loop;

  -- Three sixes running still loses the turn, stuck in the yard or not.
  if d = 6 and sixes >= 2 then
    update public.board_matches
    set state = m.state || jsonb_build_object(
          'dice', null, 'last', d, 'sixes', 0, 'tries', 0, 'log', log,
          'moved', null, 'ate', null, 'note', 'Three sixes — turn lost'
        ),
        turn = case when seat = 'a' then 'b' else 'a' end
    where id = match;
    return d;
  end if;

  if not can then
    -- Stuck in the yard with throws left: keep the die, say how many are left.
    if all_home and tries < 2 then
      update public.board_matches
      set state = m.state || jsonb_build_object(
            'dice', null,
            'last', d,
            'sixes', 0,
            'tries', tries + 1,
            'log', log, 'moved', null, 'ate', null,
            'note', format('Rolled %s — %s more %s at a six',
                           d,
                           2 - tries,
                           case when tries = 1 then 'try' else 'tries' end)
          )
      where id = match;
      return d;
    end if;

    update public.board_matches
    set state = m.state || jsonb_build_object(
          'dice', null,
          'last', d,
          'sixes', case when d = 6 then sixes + 1 else 0 end,
          'tries', 0,
          'log', log, 'moved', null, 'ate', null,
          'note', case when d = 6 then 'A six, but nothing it can move'
                       else format('Rolled %s — nothing to move', d) end
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
        'tries', 0,
        'log', log, 'note', null
      )
  where id = match;

  return d;
end;
$$;

grant execute on function public.ludo_roll(uuid) to authenticated;
