-- ============================================================================
-- 0038_card_rounds.sql — the deck becomes a game for two
-- ============================================================================
-- It was never a two-player game. `draw_card` dealt privately and then hid the
-- card from the couple the moment anyone played it, so whoever opened the deck
-- first burned it for both of you — the other one got "you've played every card
-- in here" on a deck they had never seen. And the answers went into
-- `card_plays.response` and were never read back by any screen, so there was
-- nothing to show each other even when you both did answer.
--
-- A round replaces the private draw. One card per deck is on the table for the
-- couple, you both answer that same card, and neither answer appears until
-- both are in — the same reveal the daily question uses, enforced here rather
-- than in the UI. Then the round closes and the next card comes out.

-- ---------------------------------------------------------------------------
-- the round
-- ---------------------------------------------------------------------------

create table if not exists public.card_rounds (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  deck_id       uuid not null references public.card_decks (id) on delete cascade,
  card_id       uuid not null references public.cards (id) on delete cascade,
  opened_by     uuid references public.profiles (id) on delete set null,
  opened_at     timestamptz not null default now(),
  completed_at  timestamptz
);

-- One card on the table per deck. This is what makes it the same card for both
-- of you rather than two private draws that happen to be in the same deck.
create unique index if not exists card_rounds_open_idx
  on public.card_rounds (couple_id, deck_id)
  where completed_at is null;

create index if not exists card_rounds_couple_idx
  on public.card_rounds (couple_id, opened_at desc);

-- A play now belongs to a round. Nullable because every play written before
-- this migration was a solo draw with no round to belong to.
alter table public.card_plays
  add column if not exists round_id uuid references public.card_rounds (id) on delete cascade;

-- Your answer, once, per round. Answering again edits what you said instead of
-- stacking a second answer under the same card.
create unique index if not exists card_plays_round_person_idx
  on public.card_plays (round_id, played_by)
  where round_id is not null;

alter table public.card_rounds enable row level security;

drop policy if exists card_rounds_all on public.card_rounds;
create policy card_rounds_all on public.card_rounds
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- what the screen reads
-- ---------------------------------------------------------------------------

-- Opens a round if the deck has no card on the table, and returns it with the
-- reveal already applied. Volatile, not stable — asking what the card is is
-- what deals it.
--
-- Returns no rows when the deck is spent, which is the screen's "you've played
-- every card in here".
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

-- ---------------------------------------------------------------------------
-- answering
-- ---------------------------------------------------------------------------

-- Your half of the round. Writing again replaces what you said — you have not
-- seen theirs yet, so there is nothing to react to and nothing to game.
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
    response  = excluded.response,
    voice_path = excluded.voice_path,
    played_at = now();
end;
$$;

-- Clear the table and deal the next one. Either of you can do it; there is no
-- turn order in a two-person game played on the same sofa.
create or replace function public.next_card(target_deck uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
begin
  update public.card_rounds r
  set completed_at = now()
  where r.couple_id = cid
    and r.deck_id = target_deck
    and r.completed_at is null;
end;
$$;

grant execute on function public.current_round(uuid) to authenticated;
grant execute on function public.answer_card(uuid, text, text) to authenticated;
grant execute on function public.next_card(uuid) to authenticated;
