-- ============================================================================
-- 0057_whot_house_rules.sql — Naija Whot, the way it is actually played
-- ============================================================================
-- Three corrections and one addition, all from the house rules as written down
-- rather than as I guessed them.
--
--   * Stacking is a CHOICE, not a rule. Some houses let you defend a 2 with a 2
--     and pass on pick 4, then pick 6; others make the next player pick at once.
--     Both are correct; which one you are playing has to be agreed before the
--     deal, so it is stored on the match.
--
--   * What happens when the market empties is also a choice. Rollover shuffles
--     the played cards back and the game goes on. Count ends it there and the
--     lowest hand wins — each card its own number, a star DOUBLE, a Whot 20.
--
--   * Nothing answers a pick except the same number. Not a Whot. (This one I
--     had right, and it is written down here so the next edit does not lose it.)
--
--   * Emptying your hand is "Check up!", which is what the screen should say.
--
-- Options live on the match because changing the rules mid-game is how
-- arguments start.

alter table public.board_matches
  add column if not exists options jsonb not null default '{}'::jsonb;

comment on column public.board_matches.options is
  'Agreed before the deal. Whot: {"stacking": bool, "market_out": "rollover"|"count"}.';

-- ---------------------------------------------------------------------------
-- counting a hand
-- ---------------------------------------------------------------------------
-- A star counts double and a Whot counts twenty, which is what makes holding
-- one at the end expensive.

create or replace function public.whot_count(cards jsonb)
returns int
language sql
immutable
as $$
  select coalesce(sum(
    case
      when c ->> 's' = 'whot' then 20
      when c ->> 's' = 'star' then (c ->> 'n')::int * 2
      else (c ->> 'n')::int
    end
  ), 0)::int
  from jsonb_array_elements(coalesce(cards, '[]'::jsonb)) c;
$$;

-- start_board gains the options, so they are fixed at the deal. A new argument
-- makes it a different function rather than a replacement, so the old
-- single-argument one is dropped rather than left behind to be called by
-- accident.
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
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if game_name not in ('ayo', 'whot') then
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

  insert into public.board_matches (couple_id, game, player_a, player_b, state, options)
  values (
    cid, game_name, auth.uid(), public.partner_id(),
    case when game_name = 'ayo' then public.ayo_new_state() else '{}'::jsonb end,
    settled
  )
  returning id into fresh;

  if game_name = 'whot' then
    perform public.start_whot(fresh);
  end if;

  return fresh;
end;
$$;

-- ---------------------------------------------------------------------------
-- playing, with the house rules applied
-- ---------------------------------------------------------------------------

create or replace function public.whot_play(
  match    uuid,
  card_at  int,
  call_shape text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m        public.board_matches;
  seat     text;
  hand     jsonb;
  card     jsonb;
  top      jsonb;
  called   text;
  pending  int;
  n        int;
  shape    text;
  top_n    int;
  match_s  text;
  again    boolean := false;
  their_id uuid;
  their_hand jsonb;
  new_pending int;
  sec      public.board_secrets;
  stacking boolean;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then raise exception 'No such game'; end if;
  if m.finished_at is not null then raise exception 'That game is over'; end if;

  seat := public.board_seat(m);
  if seat is null then raise exception 'You are not in this game'; end if;
  if seat <> m.turn then raise exception 'Not your turn'; end if;

  stacking := coalesce((m.options ->> 'stacking')::boolean, true);

  select h.cards into hand from public.board_hands h
  where h.match_id = match and h.user_id = auth.uid();

  card := hand -> card_at;
  if card is null then raise exception 'You do not have that card'; end if;

  top     := m.state -> 'top';
  called  := m.state ->> 'called';
  pending := coalesce((m.state ->> 'pending')::int, 0);
  n       := (card ->> 'n')::int;
  shape   := card ->> 's';
  top_n   := (top ->> 'n')::int;
  -- A Whot on top is whatever was called; otherwise it is its own shape.
  match_s := coalesce(called, top ->> 's');

  if pending > 0 then
    -- Nothing answers a pick but the same number — not a Whot, not a matching
    -- shape. And without stacking, nothing answers it at all.
    if not stacking then
      raise exception 'No stacking here — go to market and pick %', pending;
    end if;
    if not ((top_n = 2 and n = 2) or (top_n = 5 and n = 5)) then
      raise exception 'Only another % answers that. Otherwise pick %', top_n, pending;
    end if;
  elsif shape <> 'whot' and shape <> match_s and n <> top_n then
    raise exception 'That does not match';
  end if;

  if shape = 'whot' and nullif(trim(coalesce(call_shape, '')), '') is null then
    raise exception 'Call a shape';
  end if;

  hand := (
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    from jsonb_array_elements(hand) with ordinality t(value, idx)
    where idx <> card_at + 1
  );

  update public.board_hands set cards = hand
  where match_id = match and user_id = auth.uid();

  select * into sec from public.board_secrets where match_id = match;
  update public.board_secrets set pile = sec.pile || card where match_id = match;

  their_id := case when seat = 'a' then m.player_b else m.player_a end;

  -- Check up.
  if jsonb_array_length(hand) = 0 then
    update public.board_matches
    set state = m.state
          || jsonb_build_object('top', card, 'pending', 0)
          || jsonb_build_object('called', case when shape = 'whot' then call_shape end)
          || jsonb_build_object('counts', jsonb_build_object(
               seat, 0,
               case when seat = 'a' then 'b' else 'a' end,
               coalesce((m.state #>> array['counts', case when seat = 'a' then 'b' else 'a' end])::int, 0)
             )),
        winner = seat,
        outcome = 'Check up! 🎉',
        finished_at = now()
    where id = match;
    return;
  end if;

  new_pending := 0;
  case n
    when 1  then again := true;                       -- Hold On
    when 8  then again := true;                       -- Suspension
    when 14 then                                      -- General Market
      again := true;
      if their_id is not null and jsonb_array_length(sec.deck) > 0 then
        select h.cards into their_hand from public.board_hands h
        where h.match_id = match and h.user_id = their_id;

        their_hand := their_hand || jsonb_build_array(sec.deck -> -1);

        update public.board_secrets
        set deck = (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from jsonb_array_elements(deck) with ordinality t(value, idx)
          where idx < jsonb_array_length(deck)
        )
        where match_id = match;

        update public.board_hands set cards = their_hand
        where match_id = match and user_id = their_id;
      end if;
    when 2 then new_pending := pending + 2;
    when 5 then new_pending := pending + 3;
    else null;
  end case;

  select * into sec from public.board_secrets where match_id = match;

  update public.board_matches
  set state = jsonb_build_object(
        'top', card,
        'called', case when shape = 'whot' then call_shape end,
        'pending', new_pending,
        'counts', jsonb_build_object(
          seat, jsonb_array_length(hand),
          case when seat = 'a' then 'b' else 'a' end,
          (select jsonb_array_length(h.cards) from public.board_hands h
           where h.match_id = match and h.user_id = their_id)
        ),
        'market', jsonb_array_length(sec.deck),
        -- One card left. Worth announcing, the way you would out loud.
        'said', case when jsonb_array_length(hand) = 1 then seat end
      ),
      turn = case when again then seat
                  when seat = 'a' then 'b' else 'a' end
  where id = match;
end;
$$;

-- ---------------------------------------------------------------------------
-- market, rollover and count
-- ---------------------------------------------------------------------------

create or replace function public.whot_market(match uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m       public.board_matches;
  seat    text;
  sec     public.board_secrets;
  hand    jsonb;
  other   jsonb;
  pending int;
  take    int;
  i       int;
  top     jsonb;
  their_id uuid;
  mine_n  int;
  theirs_n int;
  rollover boolean;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then raise exception 'No such game'; end if;
  if m.finished_at is not null then raise exception 'That game is over'; end if;

  seat := public.board_seat(m);
  if seat <> m.turn then raise exception 'Not your turn'; end if;

  rollover := coalesce(m.options ->> 'market_out', 'rollover') = 'rollover';
  their_id := case when seat = 'a' then m.player_b else m.player_a end;

  select * into sec from public.board_secrets where match_id = match;
  select h.cards into hand from public.board_hands h
  where h.match_id = match and h.user_id = auth.uid();

  pending := coalesce((m.state ->> 'pending')::int, 0);
  take := greatest(pending, 1);
  top := m.state -> 'top';

  for i in 1..take loop
    if jsonb_array_length(sec.deck) = 0 then
      -- Nothing left to deal. Which of the two things happens now was agreed
      -- before the deal.
      if not rollover or jsonb_array_length(sec.pile) <= 1 then
        select h.cards into other from public.board_hands h
        where h.match_id = match and h.user_id = their_id;

        mine_n   := public.whot_count(hand);
        theirs_n := public.whot_count(other);

        update public.board_matches
        set winner = case when mine_n < theirs_n then seat
                          when theirs_n < mine_n then case when seat = 'a' then 'b' else 'a' end
                          else 'draw' end,
            outcome = case when mine_n = theirs_n
                        then 'Market finished. Level count — a draw.'
                        else format('Market finished. Lowest count wins: %s to %s.',
                                    least(mine_n, theirs_n), greatest(mine_n, theirs_n))
                      end,
            state = m.state || jsonb_build_object('market', 0),
            finished_at = now()
        where id = match;
        return;
      end if;

      -- Rollover: everything played but the card on top, shuffled back in.
      select coalesce(jsonb_agg(value), '[]'::jsonb) into sec.deck
      from (
        select value
        from jsonb_array_elements(sec.pile) with ordinality t(value, idx)
        where idx < jsonb_array_length(sec.pile)
        order by random()
      ) s;
      sec.pile := jsonb_build_array(top);
    end if;

    hand := hand || jsonb_build_array(sec.deck -> -1);
    sec.deck := (
      select coalesce(jsonb_agg(value), '[]'::jsonb)
      from jsonb_array_elements(sec.deck) with ordinality t(value, idx)
      where idx < jsonb_array_length(sec.deck)
    );
  end loop;

  update public.board_secrets set deck = sec.deck, pile = sec.pile
  where match_id = match;

  update public.board_hands set cards = hand
  where match_id = match and user_id = auth.uid();

  update public.board_matches
  set state = m.state
        || jsonb_build_object('pending', 0, 'market', jsonb_array_length(sec.deck))
        || jsonb_build_object('counts', jsonb_build_object(
             seat, jsonb_array_length(hand),
             case when seat = 'a' then 'b' else 'a' end,
             coalesce((m.state #>> array['counts', case when seat = 'a' then 'b' else 'a' end])::int, 0)
           )),
      turn = case when seat = 'a' then 'b' else 'a' end
  where id = match;
end;
$$;

-- The options back out, so the screen can show which table you agreed to.
--
-- Two more columns means a different return type, and create-or-replace cannot
-- change one — same 42P13 family as renaming an argument. The old one has to go
-- first. Dropping is safe: nothing holds a reference to it but the client.
drop function if exists public.whot_view(uuid);

create or replace function public.whot_view(match uuid)
returns table (
  my_hand   jsonb,
  top       jsonb,
  called    text,
  pending   int,
  my_count  int,
  their_count int,
  market    int,
  my_turn   boolean,
  seat      text,
  winner    text,
  outcome   text,
  stacking  boolean,
  market_out text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m public.board_matches;
  s text;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then return; end if;

  s := public.board_seat(m);

  return query
  select
    coalesce((select h.cards from public.board_hands h
              where h.match_id = match and h.user_id = auth.uid()), '[]'::jsonb),
    m.state -> 'top',
    m.state ->> 'called',
    coalesce((m.state ->> 'pending')::int, 0),
    coalesce((m.state #>> array['counts', s])::int, 0),
    coalesce((m.state #>> array['counts', case when s = 'a' then 'b' else 'a' end])::int, 0),
    coalesce((m.state ->> 'market')::int, 0),
    m.turn = s and m.finished_at is null,
    s,
    m.winner,
    m.outcome,
    coalesce((m.options ->> 'stacking')::boolean, true),
    coalesce(m.options ->> 'market_out', 'rollover');
end;
$$;

grant execute on function public.whot_count(jsonb) to authenticated;
grant execute on function public.start_board(text, jsonb) to authenticated;
grant execute on function public.whot_view(uuid) to authenticated;
grant execute on function public.whot_play(uuid, int, text) to authenticated;
grant execute on function public.whot_market(uuid) to authenticated;
