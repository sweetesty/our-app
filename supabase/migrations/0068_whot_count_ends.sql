-- ============================================================================
-- 0068_whot_count_ends.sql — Count ends when the market runs out
-- ============================================================================
-- The rule as written down: "Market runs out: the game ends there. Lowest
-- count in hand wins." I only ever checked that when somebody *tried to draw*
-- — so if the market emptied and both players could still play from their
-- hands, nothing ended it and Count behaved identically to Rollover. Which is
-- exactly what it looked like from the outside.
--
-- The market emptying is the event. It is checked after every play and after
-- every draw, wherever the deck might have reached zero.

create or replace function public.whot_settle_count(match uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m        public.board_matches;
  sec      public.board_secrets;
  a_cards  jsonb;
  b_cards  jsonb;
  a_n      int;
  b_n      int;
begin
  select * into m from public.board_matches where id = match;
  if not found or m.finished_at is not null then
    return false;
  end if;

  -- Only in Count. Rollover shuffles the pile back and plays on, which is the
  -- whole difference between the two.
  if coalesce(m.options ->> 'market_out', 'rollover') <> 'count' then
    return false;
  end if;

  select * into sec from public.board_secrets where match_id = match;
  if jsonb_array_length(coalesce(sec.deck, '[]'::jsonb)) > 0 then
    return false;
  end if;

  select h.cards into a_cards from public.board_hands h
  where h.match_id = match and h.user_id = m.player_a;
  select h.cards into b_cards from public.board_hands h
  where h.match_id = match and h.user_id = m.player_b;

  -- Each card its own number, a star double, a Whot 20.
  a_n := public.whot_count(a_cards);
  b_n := public.whot_count(b_cards);

  update public.board_matches
  set winner = case when a_n < b_n then 'a'
                    when b_n < a_n then 'b'
                    else 'draw' end,
      -- Says whose pile was whose. Two bare numbers left you working out
      -- which one was yours at the moment you most wanted to know.
      outcome = case when a_n = b_n
                  then format('Market finished. Level on %s each — a draw.', a_n)
                  else format('Market finished. %s wins on count, %s to %s.',
                              case when a_n < b_n then 'A' else 'B' end,
                              least(a_n, b_n), greatest(a_n, b_n))
                end,
      state = m.state || jsonb_build_object('market', 0),
      finished_at = now()
  where id = match;

  return true;
end;
$$;

-- Hooked onto both doors the market can empty through. A trigger rather than a
-- call at each site, so a future rule that touches the deck cannot forget it.
create or replace function public.on_whot_market_empty()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if jsonb_array_length(coalesce(new.deck, '[]'::jsonb)) = 0
     and jsonb_array_length(coalesce(old.deck, '[]'::jsonb)) > 0 then
    perform public.whot_settle_count(new.match_id);
  end if;
  return new;
end;
$$;

drop trigger if exists whot_market_empty on public.board_secrets;
create trigger whot_market_empty
  after update on public.board_secrets
  for each row execute function public.on_whot_market_empty();

grant execute on function public.whot_settle_count(uuid) to authenticated;

-- Any Count game already sitting there with an empty market is settled now,
-- rather than waiting for somebody to notice it will never end.
do $$
declare
  m record;
begin
  for m in
    select bm.id
    from public.board_matches bm
    join public.board_secrets bs on bs.match_id = bm.id
    where bm.game = 'whot'
      and bm.finished_at is null
      and coalesce(bm.options ->> 'market_out', 'rollover') = 'count'
      and jsonb_array_length(coalesce(bs.deck, '[]'::jsonb)) = 0
  loop
    perform public.whot_settle_count(m.id);
  end loop;
end
$$;
