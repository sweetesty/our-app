-- ============================================================================
-- 0063_ludo_entries.sql — each colour enters beside its own corner
-- ============================================================================
-- 0062 assigned entry squares red 0, green 13, yellow 26, blue 39. Those
-- numbers are internally consistent but they do not match the board the client
-- draws, where the quadrants are blue top-left, yellow top-right, green
-- bottom-right and red bottom-left.
--
-- Walking the ring against that layout: square 0 sits on the left arm's top
-- row, which touches top-left; 13 touches top-right; 26 bottom-right; 39
-- bottom-left. So the entries belong to blue, yellow, green and red in that
-- order — which is what the client had before I "fixed" it to agree with this
-- function. I corrected the wrong side.
--
-- Either side could have moved; the board is the side with the geometry on it,
-- so the function moves.

create or replace function public.ludo_entry(colour text)
returns int
language sql
immutable
as $$
  select case colour
           -- Matches COLOURS in web/src/components/boards/Ludo.tsx. If these
           -- two ever disagree again, tokens are drawn a quarter of a board
           -- away from where the server thinks they are, and captures land on
           -- squares that look empty.
           when 'blue'   then 0
           when 'yellow' then 13
           when 'green'  then 26
           when 'red'    then 39
           else 0
         end;
$$;

-- The opposite corner, in terms of the actual layout: blue top-left faces
-- green bottom-right, yellow top-right faces red bottom-left.
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

  c_a := coalesce(opts ->> 'colour', 'red');
  if c_a not in ('red', 'green', 'yellow', 'blue') then c_a := 'red'; end if;
  c_b := case c_a
           when 'blue'   then 'green'
           when 'green'  then 'blue'
           when 'yellow' then 'red'
           else 'yellow'
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

grant execute on function public.ludo_entry(text) to authenticated;
grant execute on function public.start_board(text, jsonb) to authenticated;
