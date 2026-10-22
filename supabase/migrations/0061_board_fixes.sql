-- ============================================================================
-- 0061_board_fixes.sql — "column reference i is ambiguous", and your turn
-- ============================================================================
-- Two things.
--
-- start_whot declared a loop variable `i` and then wrote `with ordinality
-- t(value, i)` in the same function. Both are called i, both are in scope, and
-- Postgres will not guess — so dealing failed before a single card came out.
-- Same family as the deck_id and idx bugs: a name that means one thing to
-- plpgsql and another to SQL. The ordinality columns are `ord` now, which is
-- not a name any variable in this schema uses.
--
-- And a turn-based game nobody is told about is a turn-based game that stops
-- after two moves. When the turn changes hands, the person it lands on gets a
-- push — once, on the change, not on every write to the row.

create or replace function public.start_whot(match uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  m          public.board_matches;
  shuf       jsonb;
  hand_a     jsonb;
  hand_b     jsonb;
  start_card jsonb;
  rest       jsonb;
  pick_at    int;
begin
  select * into m from public.board_matches where id = match;

  -- Shuffled once, here, where neither client can see the order.
  select jsonb_agg(c) into shuf
  from (
    select value as c
    from jsonb_array_elements(public.whot_deck())
    order by random()
  ) s;

  select jsonb_agg(value) into hand_a
  from jsonb_array_elements(shuf) with ordinality t(value, ord)
  where ord <= 5;

  select jsonb_agg(value) into hand_b
  from jsonb_array_elements(shuf) with ordinality t(value, ord)
  where ord > 5 and ord <= 10;

  -- The first card up. A special as the opening card would mean the game
  -- begins with somebody already being punished, so keep turning until it is
  -- an ordinary one.
  pick_at := 11;
  loop
    start_card := shuf -> (pick_at - 1);
    exit when start_card is null
           or (start_card ->> 'n')::int not in (1, 2, 5, 8, 14, 20);
    pick_at := pick_at + 1;
    exit when pick_at > 40;
  end loop;

  select coalesce(jsonb_agg(value), '[]'::jsonb) into rest
  from jsonb_array_elements(shuf) with ordinality t(value, ord)
  where ord > 10 and ord <> pick_at;

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
        'called', null,
        'pending', 0,
        'counts', jsonb_build_object('a', 5, 'b', 5),
        'market', jsonb_array_length(rest),
        'said', null
      )
  where id = match;
end;
$$;

grant execute on function public.start_whot(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- telling them it is their go
-- ---------------------------------------------------------------------------

create or replace function public.on_board_turn_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  waiting uuid;
  mover   text;
  label   text;
begin
  -- Only when the turn actually changes hands, or when a game ends. Every
  -- other write to this row is a board position, and a buzz per seed sown
  -- would be unbearable.
  if new.finished_at is null and old.turn = new.turn then
    return new;
  end if;

  label := case new.game
             when 'ayo' then 'Ayo'
             when 'whot' then 'Whot'
             when 'ludo' then 'Ludo'
             else new.game
           end;

  if new.finished_at is not null and old.finished_at is null then
    -- Tell the loser. The winner was looking at the screen when it happened.
    waiting := case when new.winner = 'a' then new.player_b else new.player_a end;
    if waiting is null then return new; end if;

    select display_name into mover from public.profiles
    where id = case when new.winner = 'a' then new.player_a else new.player_b end;

    perform public.dispatch_push(jsonb_build_object(
      'type', 'turn',
      'couple_id', new.couple_id,
      'sender_id', case when new.winner = 'a' then new.player_a else new.player_b end,
      'sender_name', coalesce(mover, 'They'),
      'kind', new.game,
      'label', label,
      'message', case when new.winner = 'draw' then 'A draw.' else 'They won that one.' end
    ));
    return new;
  end if;

  waiting := case when new.turn = 'a' then new.player_a else new.player_b end;
  if waiting is null then return new; end if;

  select display_name into mover from public.profiles
  where id = case when new.turn = 'a' then new.player_b else new.player_a end;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'turn',
    'couple_id', new.couple_id,
    'sender_id', case when new.turn = 'a' then new.player_b else new.player_a end,
    'sender_name', coalesce(mover, 'They'),
    'kind', new.game,
    'label', label,
    'message', 'Your go.'
  ));

  return new;
end;
$$;

drop trigger if exists board_turn_push on public.board_matches;
create trigger board_turn_push
  after update on public.board_matches
  for each row execute function public.on_board_turn_push();

-- Budgeted like everything else. Normal tier: worth knowing today, and capped
-- so a fast back-and-forth does not turn into twenty notifications.
insert into public.push_tiers (type, tier, per_hour)
values ('turn', 'normal', 6)
on conflict (type) do update set tier = excluded.tier, per_hour = excluded.per_hour;
