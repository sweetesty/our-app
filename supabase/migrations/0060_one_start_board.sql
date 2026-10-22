-- ============================================================================
-- 0060_one_start_board.sql — only one start_board
-- ============================================================================
-- 0054 created start_board(text). 0057 added an options argument, which in
-- Postgres makes a NEW function rather than replacing the old one — so both
-- existed, and a call with a single argument matched both. Postgres will not
-- guess: "could not choose the best candidate function".
--
-- The drop was added to 0057 and 0058 after the fact, which does not help a
-- database where they had already run. This file is the fix for the state
-- rather than for the script, and it is safe to run whatever order things
-- happened in.

-- The column this function writes to arrives in 0057. Repeated here because
-- this file is the one people re-run when something is wrong, and a fix that
-- only works if you already applied the thing you skipped is not a fix.
alter table public.board_matches
  add column if not exists options jsonb not null default '{}'::jsonb;

drop function if exists public.start_board(text);

-- Belt and braces: if the two-argument version somehow never landed, this
-- leaves the database with exactly the one that is supposed to be there.
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

  -- Defaults are the commonest table: stacking on, rollover when the market
  -- dries up.
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

grant execute on function public.start_board(text, jsonb) to authenticated;
