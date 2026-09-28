-- ============================================================================
-- 0041_card_round_ambiguity.sql — "column reference deck_id is ambiguous"
-- ============================================================================
-- `current_round()` returns a table whose columns are named after the columns
-- they come from — deck_id, card_id, body, kind. In plpgsql those output names
-- are also variables, so any unqualified mention of one inside the body is a
-- name Postgres cannot resolve: it could be the column or the OUT parameter.
--
-- Most references were already qualified. The ones that cannot be are the
-- INSERT's conflict target — `on conflict (couple_id, deck_id)` takes bare
-- column names by grammar, there is nothing to qualify them with — so the
-- function raised on the first draw of every deck.
--
-- `#variable_conflict use_column` settles it in the right direction: bare
-- names mean columns, and every variable in here is either uniquely named
-- (cid, pid, me, pick, target_deck) or reached through the record.

create or replace function public.current_round(target_deck uuid)
returns table (
  round_id          uuid,
  card_id           uuid,
  body              text,
  kind              text,
  deck_id           uuid,
  opened_at         timestamptz,
  i_answered        boolean,
  partner_answered  boolean,
  revealed          boolean,
  my_response       text,
  my_voice_path     text,
  partner_response  text,
  partner_voice_path text,
  partner_name      text,
  answered_at       timestamptz,
  partner_answered_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  cid   uuid := public.current_couple_id();
  pid   uuid := public.partner_id();
  me    uuid := auth.uid();
  open_round public.card_rounds;
  pick  uuid;
begin
  if cid is null then
    return;
  end if;

  select * into open_round
  from public.card_rounds r
  where r.couple_id = cid
    and r.deck_id = target_deck
    and r.completed_at is null
  limit 1;

  if not found then
    -- A card is spent once it has been *dealt*, not once it has been answered.
    -- Going by plays would deal the same card again to a round you both
    -- skipped.
    select c.id into pick
    from public.cards c
    where c.deck_id = target_deck
      and c.is_active
      and (c.couple_id is null or c.couple_id = cid)
      and not exists (
        select 1 from public.card_rounds r
        where r.card_id = c.id and r.couple_id = cid
      )
      and not exists (
        select 1 from public.card_plays p
        where p.card_id = c.id and p.couple_id = cid
      )
    order by random()
    limit 1;

    if pick is null then
      return;
    end if;

    insert into public.card_rounds (couple_id, deck_id, card_id, opened_by)
    values (cid, target_deck, pick, me)
    -- You both opened the deck at the same moment. Whoever lost the race takes
    -- the round that already exists rather than an error.
    on conflict (couple_id, deck_id) where completed_at is null do nothing
    returning * into open_round;

    if open_round.id is null then
      select * into open_round
      from public.card_rounds r
      where r.couple_id = cid
        and r.deck_id = target_deck
        and r.completed_at is null
      limit 1;
    end if;
  end if;

  return query
  with mine as (
    select * from public.card_plays p
    where p.round_id = open_round.id and p.played_by = me
  ),
  theirs as (
    select * from public.card_plays p
    where p.round_id = open_round.id and p.played_by = pid
  )
  select
    open_round.id,
    c.id,
    c.body,
    c.kind,
    open_round.deck_id,
    open_round.opened_at,
    exists (select 1 from mine),
    exists (select 1 from theirs),
    -- The reveal. Both answers or neither — there is no state where you read
    -- theirs without having written yours.
    (exists (select 1 from mine) and exists (select 1 from theirs)),
    (select m.response from mine m),
    (select m.voice_path from mine m),
    -- Withheld in the query, not in the UI. Peeking would mean getting past
    -- Postgres.
    case when exists (select 1 from mine)
      then (select t.response from theirs t) end,
    case when exists (select 1 from mine)
      then (select t.voice_path from theirs t) end,
    (select pr.display_name from public.profiles pr where pr.id = pid),
    (select m.played_at from mine m),
    case when exists (select 1 from mine)
      then (select t.played_at from theirs t) end
  from public.cards c
  where c.id = open_round.card_id;
end;
$$;

grant execute on function public.current_round(uuid) to authenticated;

-- Same hazard, smaller: `body` is a parameter here and a column on cards. It
-- is never used unqualified against a table that has one, but the next edit to
-- this function should not have to know that.
create or replace function public.answer_card(
  target_round uuid,
  body         text default null,
  voice        text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_variable
declare
  cid   uuid := public.current_couple_id();
  open_round public.card_rounds;
begin
  select * into open_round
  from public.card_rounds r
  where r.id = target_round and r.couple_id = cid and r.completed_at is null;

  if not found then
    raise exception 'That card is not on the table any more';
  end if;

  insert into public.card_plays (couple_id, card_id, played_by, response, voice_path, completed, round_id)
  values (cid, open_round.card_id, auth.uid(), nullif(trim(coalesce(body, '')), ''), voice, true, target_round)
  on conflict (round_id, played_by) where round_id is not null
  do update set
    response   = excluded.response,
    voice_path = excluded.voice_path,
    played_at  = now();
end;
$$;

grant execute on function public.answer_card(uuid, text, text) to authenticated;
