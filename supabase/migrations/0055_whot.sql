-- ============================================================================
-- 0055_whot.sql — Whot, with hands that are actually hidden
-- ============================================================================
-- Ayo has no secrets: every seed is on the table and both players can see the
-- whole board, so `board_matches.state` being readable by the couple is fine.
-- Whot is the opposite. If the state holding your hand is readable by the
-- person you are playing against, the game is over before it starts — and it
-- would not even take devtools, just the network tab.
--
-- So the secrets move out of `state` and into tables where RLS does the hiding,
-- which is how the rest of this app keeps things from people:
--
--   * board_hands   — one row per player per match, readable only by that
--                     player. Your cards are yours.
--   * board_secrets — the market, face down. NO select policy at all, so it is
--                     readable by nobody; only the SECURITY DEFINER functions
--                     below can see what the next card is.
--
-- `state` keeps only what is genuinely public: the top of the pile, the called
-- shape, how many cards each of you is holding, how big the market is. All
-- things you can see across a table.
--
-- The deck is the Nigerian 54: circles and triangles 1–14 without 6 or 9,
-- crosses and squares the short set, stars 1–8 without 6, and five Whots.

create table if not exists public.board_hands (
  match_id  uuid not null references public.board_matches (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  cards     jsonb not null default '[]'::jsonb,
  primary key (match_id, user_id)
);

create table if not exists public.board_secrets (
  match_id  uuid primary key references public.board_matches (id) on delete cascade,
  -- Face down, in order. The top of the market is the last element.
  deck      jsonb not null default '[]'::jsonb,
  -- Everything already played, so the market can be rebuilt when it runs out.
  pile      jsonb not null default '[]'::jsonb
);

alter table public.board_hands   enable row level security;
alter table public.board_secrets enable row level security;

-- Yours and only yours. There is deliberately no policy letting you read your
-- partner's row — that is the entire feature.
drop policy if exists board_hands_own on public.board_hands;
create policy board_hands_own on public.board_hands
  for select to authenticated
  using (user_id = auth.uid());

-- board_secrets gets RLS and then no policy whatsoever. Enabled with nothing
-- granted means nobody can select it; the functions below are SECURITY DEFINER
-- and bypass it. A market you can read is not a market.

-- ---------------------------------------------------------------------------
-- the deck
-- ---------------------------------------------------------------------------

create or replace function public.whot_deck()
returns jsonb
language sql
immutable
as $$
  select jsonb_agg(c order by c)
  from (
    select jsonb_build_object('s', s.shape, 'n', n.v) as c
    from (values ('circle'), ('triangle')) as s(shape),
         (values (1),(2),(3),(4),(5),(7),(8),(10),(11),(12),(13),(14)) as n(v)
    union all
    select jsonb_build_object('s', s.shape, 'n', n.v)
    from (values ('cross'), ('square')) as s(shape),
         (values (1),(2),(3),(5),(7),(10),(11),(13),(14)) as n(v)
    union all
    select jsonb_build_object('s', 'star', 'n', n.v)
    from (values (1),(2),(3),(4),(5),(7),(8)) as n(v)
    union all
    select jsonb_build_object('s', 'whot', 'n', 20)
    from generate_series(1, 5)
  ) all_cards;
$$;

-- ---------------------------------------------------------------------------
-- starting one
-- ---------------------------------------------------------------------------
-- start_board() grew a second game, so it dispatches now. Ayo's opening
-- position is a constant; Whot's involves a shuffle, two hands and a starting
-- card that must not itself be a special, so it gets its own function.

create or replace function public.start_whot(match uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m     public.board_matches;
  shuf  jsonb;
  hand_a jsonb;
  hand_b jsonb;
  start_card jsonb;
  rest  jsonb;
  i     int;
begin
  select * into m from public.board_matches where id = match;

  -- Shuffled once, here, where neither client can see the order.
  select jsonb_agg(c) into shuf
  from (
    select value as c
    from jsonb_array_elements(public.whot_deck())
    order by random()
  ) s;

  hand_a := (select jsonb_agg(value) from jsonb_array_elements(shuf) with ordinality t(value, i) where i <= 5);
  hand_b := (select jsonb_agg(value) from jsonb_array_elements(shuf) with ordinality t(value, i) where i > 5 and i <= 10);

  -- The first card up. A special as the opening card would mean the game
  -- begins with somebody already being punished, so keep turning until it is
  -- an ordinary one.
  i := 11;
  loop
    start_card := shuf -> (i - 1);
    exit when (start_card ->> 'n')::int not in (1, 2, 5, 8, 14, 20);
    i := i + 1;
    exit when i > 40;
  end loop;

  rest := (
    select coalesce(jsonb_agg(value), '[]'::jsonb)
    from jsonb_array_elements(shuf) with ordinality t(value, idx)
    where idx > 10 and idx <> i
  );

  insert into public.board_hands (match_id, user_id, cards)
  values (match, m.player_a, coalesce(hand_a, '[]'::jsonb))
  on conflict (match_id, user_id) do update set cards = excluded.cards;

  if m.player_b is not null then
    insert into public.board_hands (match_id, user_id, cards)
    values (match, m.player_b, coalesce(hand_b, '[]'::jsonb))
    on conflict (match_id, user_id) do update set cards = excluded.cards;
  end if;

  insert into public.board_secrets (match_id, deck, pile)
  values (match, rest, jsonb_build_array(start_card))
  on conflict (match_id) do update set deck = excluded.deck, pile = excluded.pile;

  update public.board_matches
  set state = jsonb_build_object(
        'top', start_card,
        -- Set only by a Whot 20; until then the shape to match is the top's.
        'called', null,
        -- Cards the player to move must pick up unless they can stack.
        'pending', 0,
        'counts', jsonb_build_object('a', 5, 'b', 5),
        'market', jsonb_array_length(rest),
        'said', null
      )
  where id = match;
end;
$$;

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

  insert into public.board_matches (couple_id, game, player_a, player_b, state)
  values (
    cid, game_name, auth.uid(), public.partner_id(),
    case when game_name = 'ayo' then public.ayo_new_state() else '{}'::jsonb end
  )
  returning id into fresh;

  if game_name = 'whot' then
    perform public.start_whot(fresh);
  end if;

  return fresh;
end;
$$;

-- ---------------------------------------------------------------------------
-- what you are allowed to see
-- ---------------------------------------------------------------------------

-- Your hand, the public state, and nothing else. The opponent's cards never
-- leave the database — not hidden by the client, not sent and ignored.
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
  outcome   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  m    public.board_matches;
  s    text;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then
    return;
  end if;

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
    m.outcome;
end;
$$;

-- ---------------------------------------------------------------------------
-- playing
-- ---------------------------------------------------------------------------
-- The rules, for two players:
--
--   1  Hold On         — you play again.
--   8  Suspension      — they miss a turn, so you play again.
--   2  Pick Two        — they pick two, unless they lay a 2 on it and pass it
--                        back doubled.
--   5  Pick Three      — the same, with threes.
--   14 General Market  — they pick one, and you play again.
--   20 Whot            — play it on anything and call the shape you want.
--
-- Anything else must match the shape or the number of the card on top — or the
-- shape called, when the top card is a Whot.

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
  top_s    text;
  match_s  text;
  again    boolean := false;
  their_id uuid;
  their_hand jsonb;
  new_pending int;
  sec      public.board_secrets;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then raise exception 'No such game'; end if;
  if m.finished_at is not null then raise exception 'That game is over'; end if;

  seat := public.board_seat(m);
  if seat is null then raise exception 'You are not in this game'; end if;
  if seat <> m.turn then raise exception 'Not your turn'; end if;

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
  top_s   := top ->> 's';
  -- A Whot on top is whatever was called; otherwise it is its own shape.
  match_s := coalesce(called, top_s);

  -- Owing cards: you may only answer with the same punishment, or go to market.
  if pending > 0 then
    if not ((top_n = 2 and n = 2) or (top_n = 5 and n = 5)) then
      raise exception 'You owe % cards — play a matching % or go to market', pending, top_n;
    end if;
  elsif shape <> 'whot' and shape <> match_s and n <> top_n then
    raise exception 'That does not match';
  end if;

  if shape = 'whot' and nullif(trim(coalesce(call_shape, '')), '') is null then
    raise exception 'Call a shape';
  end if;

  -- Out of the hand, onto the pile.
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

  -- Out of cards: that is the game.
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
        outcome = 'Played their last card.',
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
      if their_id is not null then
        select h.cards into their_hand from public.board_hands h
        where h.match_id = match and h.user_id = their_id;

        if jsonb_array_length(sec.deck) > 0 then
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
        'said', case when jsonb_array_length(hand) = 1 then seat end
      ),
      turn = case when again then seat
                  when seat = 'a' then 'b' else 'a' end
  where id = match;
end;
$$;

-- Going to market: either picking up what you owe, or one card because you
-- cannot go. Both end your turn, which is what makes owing cards hurt.
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
  pending int;
  take    int;
  i       int;
  top     jsonb;
begin
  select * into m from public.board_matches
  where id = match and couple_id = public.current_couple_id();
  if not found then raise exception 'No such game'; end if;
  if m.finished_at is not null then raise exception 'That game is over'; end if;

  seat := public.board_seat(m);
  if seat <> m.turn then raise exception 'Not your turn'; end if;

  select * into sec from public.board_secrets where match_id = match;
  select h.cards into hand from public.board_hands h
  where h.match_id = match and h.user_id = auth.uid();

  pending := coalesce((m.state ->> 'pending')::int, 0);
  take := greatest(pending, 1);
  top := m.state -> 'top';

  for i in 1..take loop
    -- Market empty: everything played but the card on top goes back in,
    -- shuffled. Otherwise a long game simply stops.
    if jsonb_array_length(sec.deck) = 0 then
      select coalesce(jsonb_agg(value), '[]'::jsonb) into sec.deck
      from (
        select value
        from jsonb_array_elements(sec.pile) with ordinality t(value, idx)
        where idx < jsonb_array_length(sec.pile)
        order by random()
      ) s;
      sec.pile := jsonb_build_array(top);
      exit when jsonb_array_length(sec.deck) = 0;
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

grant execute on function public.whot_deck() to authenticated;
grant execute on function public.whot_view(uuid) to authenticated;
grant execute on function public.whot_play(uuid, int, text) to authenticated;
grant execute on function public.whot_market(uuid) to authenticated;
grant execute on function public.start_whot(uuid) to authenticated;
