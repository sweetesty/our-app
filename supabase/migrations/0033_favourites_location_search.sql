-- ============================================================================
-- 0033_favourites_location_search.sql — starring, places, and finding things
-- ============================================================================
-- Three small gaps:
--   * Notes could be favourited; nothing else could.
--   * Milestones had photos and words but no place.
--   * Search worked inside Notes and nowhere else.

-- ---------------------------------------------------------------------------
-- 1. favourite memories
-- ---------------------------------------------------------------------------
-- Keyed the same way album_items are, because memories() spans seven tables
-- and there is no single foreign key to point at.
--
-- Shared rather than per-person: "our favourites" is the collection people
-- actually want, and two private lists in a two-person app is just clutter.

create table if not exists public.favourite_memories (
  couple_id    uuid not null references public.couples (id) on delete cascade,
  memory_id    uuid not null,
  memory_kind  text not null,
  starred_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (couple_id, memory_id)
);

alter table public.favourite_memories enable row level security;

drop policy if exists favourite_memories_all on public.favourite_memories;
create policy favourite_memories_all on public.favourite_memories
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create or replace function public.toggle_favourite_memory(
  memory uuid,
  kind text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  existed boolean;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  delete from public.favourite_memories
  where couple_id = cid and memory_id = memory;

  get diagnostics existed = row_count;
  if existed then
    return false;
  end if;

  insert into public.favourite_memories (couple_id, memory_id, memory_kind, starred_by)
  values (cid, memory, kind, auth.uid());

  return true;
end;
$$;

grant execute on function public.toggle_favourite_memory(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. where it happened
-- ---------------------------------------------------------------------------
-- Free text, not coordinates. A map needs a geocoding API key and sends every
-- place the two of you have been to a third party, which is exactly what this
-- app exists not to do. "That rooftop in Lekki" is the useful part anyway.

alter table public.milestones
  add column if not exists location text;

-- ---------------------------------------------------------------------------
-- 3. search across everything
-- ---------------------------------------------------------------------------

/**
 * One query over the whole app.
 *
 * SECURITY DEFINER, so RLS does not apply inside and every gate has to be
 * repeated by hand: an unrevealed answer, an unopened letter, a sealed
 * surprise's label, an expired moment and an unreciprocated daily photo must
 * all stay out. Getting this wrong would turn the search box into the way
 * round every rule in the app.
 */
create or replace function public.search_everything(
  q text,
  limit_count integer default 60
)
returns table (
  id uuid,
  kind text,
  title text,
  snippet text,
  media_path text,
  source text,
  source_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with cid as (select public.current_couple_id() as v),
       needle as (select '%' || trim(q) || '%' as v)

  select n.id, 'note', coalesce(n.title, 'A note'), n.body, n.photo_path,
         'notes', n.id, n.created_at
  from public.love_notes n
  where n.couple_id = (select v from cid)
    and (n.body ilike (select v from needle) or n.title ilike (select v from needle))

  union all

  select m.id, 'message', 'Chat', m.body, m.media_path, 'chat', m.id, m.created_at
  from public.messages m
  where m.couple_id = (select v from cid)
    and m.body ilike (select v from needle)

  union all

  select ms.id, 'milestone', ms.title,
         concat_ws(' · ', ms.description, ms.location),
         null, 'timeline', ms.id, ms.created_at
  from public.milestones ms
  where ms.couple_id = (select v from cid)
    and (ms.title ilike (select v from needle)
      or ms.description ilike (select v from needle)
      or ms.location ilike (select v from needle))

  union all

  -- Expired moments are gone, not merely hidden.
  select mo.id, 'moment', 'A moment', mo.caption, mo.storage_path,
         'moments', mo.id, mo.created_at
  from public.moments mo
  where mo.couple_id = (select v from cid)
    and (mo.expires_at is null or mo.expires_at > now())
    and mo.caption ilike (select v from needle)

  union all

  select p.id, 'card', d.name, concat_ws(E'\n— ', c.body, p.response),
         p.voice_path, 'cards', p.card_id, p.played_at
  from public.card_plays p
  join public.cards c on c.id = p.card_id
  join public.card_decks d on d.id = c.deck_id
  where p.couple_id = (select v from cid)
    and (c.body ilike (select v from needle) or p.response ilike (select v from needle))

  union all

  -- The reveal gate, repeated. Your own answer always; theirs only once you
  -- have written yours.
  select a.id, 'answer', 'An answer', a.body, null, 'today', a.id, a.created_at
  from public.daily_answers a
  where a.couple_id = (select v from cid)
    and a.body ilike (select v from needle)
    and (a.author_id = auth.uid() or public.has_answered(a.daily_question_id))

  union all

  -- Opened letters only, and never a sealed surprise's label.
  select v.id, 'vault', v.label, null, null, 'vault', v.id, v.created_at
  from public.vault_items v
  where v.couple_id = (select c2.v from cid c2)
    and v.label ilike (select n.v from needle n)
    and (v.author_id = auth.uid() or (v.unlocked_at is not null))

  union all

  select cp.id, 'compliment', 'A compliment', cp.body, null,
         'compliments', cp.id, cp.created_at
  from public.compliments cp
  where cp.couple_id = (select v from cid)
    and cp.body ilike (select v from needle)

  union all

  select dp.id, 'photo', 'Our day', dp.caption, dp.storage_path,
         'daily', dp.id, dp.created_at
  from public.daily_photos dp
  where dp.couple_id = (select v from cid)
    and dp.caption ilike (select v from needle)
    and (dp.author_id = auth.uid() or public.has_posted_photo(dp.taken_on))

  order by created_at desc
  limit least(greatest(limit_count, 1), 200);
$$;

grant execute on function public.search_everything(text, integer) to authenticated;
