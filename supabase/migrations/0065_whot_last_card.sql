-- ============================================================================
-- 0065_whot_last_card.sql — you cannot check up on an action card
-- ============================================================================
-- Winning by laying a Pick Two is not winning. The whole point of an action
-- card is that it does something to the next player, and there is no next
-- player once your hand is empty — so the rule everywhere this game is played
-- is that your last card must be an ordinary one.
--
-- 1, 2, 5, 8, 14 and 20 are all out. If the only card you have left is one of
-- them, you go to market and keep playing, which is exactly the tension the
-- rule exists to create.

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
  match_s := coalesce(called, top ->> 's');

  -- The last card has to be an ordinary one.
  if jsonb_array_length(hand) = 1 and n in (1, 2, 5, 8, 14, 20) then
    raise exception 'You cannot check up on a %. Go to market', n;
  end if;

  if pending > 0 then
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
    from jsonb_array_elements(hand) with ordinality t(value, ord)
    where ord <> card_at + 1
  );

  update public.board_hands set cards = hand
  where match_id = match and user_id = auth.uid();

  select * into sec from public.board_secrets where match_id = match;
  update public.board_secrets set pile = sec.pile || card where match_id = match;

  their_id := case when seat = 'a' then m.player_b else m.player_a end;

  -- Check up. Only reachable on an ordinary card now, by the guard above.
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
    when 1  then again := true;
    when 8  then again := true;
    when 14 then
      again := true;
      if their_id is not null and jsonb_array_length(sec.deck) > 0 then
        select h.cards into their_hand from public.board_hands h
        where h.match_id = match and h.user_id = their_id;

        their_hand := their_hand || jsonb_build_array(sec.deck -> -1);

        update public.board_secrets
        set deck = (
          select coalesce(jsonb_agg(value), '[]'::jsonb)
          from jsonb_array_elements(deck) with ordinality t(value, ord)
          where ord < jsonb_array_length(deck)
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
        'said', case when jsonb_array_length(hand) = 1 then seat end
      ),
      turn = case when again then seat
                  when seat = 'a' then 'b' else 'a' end
  where id = match;
end;
$$;

grant execute on function public.whot_play(uuid, int, text) to authenticated;
