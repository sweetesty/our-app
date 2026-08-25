-- ============================================================================
-- 0016_memories.sql — everything you've shared, in one place
-- ============================================================================
-- Photos, videos, voice notes, love notes and played cards already exist across
-- four tables. Rather than copying them into a fifth, this reads them into one
-- shape on demand — so nothing can drift out of sync, and deleting a timeline
-- moment removes its photos from the gallery for free.

create or replace function public.memories(
  kinds text[] default null,          -- null = everything
  limit_count integer default 200
)
returns table (
  id uuid,
  kind text,                          -- photo | video | voice | note | card
  title text,
  body text,
  media_path text,
  source text,                        -- which feature it came from
  source_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with cid as (select public.current_couple_id() as v)

  -- Timeline attachments
  select
    m.id,
    m.media_type as kind,
    ms.title,
    m.caption as body,
    m.storage_path as media_path,
    'timeline' as source,
    ms.id as source_id,
    m.created_at
  from public.milestone_media m
  join public.milestones ms on ms.id = m.milestone_id
  where m.couple_id = (select v from cid)

  union all

  -- Love notes that carry a photo
  select
    n.id,
    'note' as kind,
    coalesce(n.title, 'A note'),
    n.body,
    n.photo_path,
    'notes' as source,
    n.id as source_id,
    n.created_at
  from public.love_notes n
  where n.couple_id = (select v from cid)
    and n.photo_path is not null

  union all

  -- Cards you actually answered. A skipped card is not a memory.
  select
    p.id,
    'card' as kind,
    d.name as title,
    c.body || case when p.response is not null then E'\n— ' || p.response else '' end,
    null as media_path,
    'cards' as source,
    p.card_id as source_id,
    p.played_at as created_at
  from public.card_plays p
  join public.cards c on c.id = p.card_id
  join public.card_decks d on d.id = c.deck_id
  where p.couple_id = (select v from cid)
    and p.response is not null

  union all

  -- Vault attachments, but only from letters that have actually been opened.
  -- A sealed letter must not leak its contents through the gallery.
  select
    vc.item_id as id,
    coalesce(vc.media_type, 'photo') as kind,
    v.label as title,
    null as body,
    vc.media_path,
    'vault' as source,
    v.id as source_id,
    v.created_at
  from public.vault_contents vc
  join public.vault_items v on v.id = vc.item_id
  where v.couple_id = (select v_inner.v from cid v_inner)
    and vc.media_path is not null
    and v.unlocked_at is not null

  order by created_at desc
  limit least(greatest(limit_count, 1), 500);
$$;

grant execute on function public.memories(text[], integer) to authenticated;

-- ---------------------------------------------------------------------------
-- albums
-- ---------------------------------------------------------------------------

create table if not exists public.albums (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  name        text not null,
  icon        text not null default '📁',
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists albums_couple_idx on public.albums (couple_id, created_at);

-- Items reference four different source tables, so there is no single foreign
-- key to hang this on. The couple scope plus a unique pair is enough: a
-- dangling row simply stops appearing once memories() no longer returns it.
create table if not exists public.album_items (
  album_id    uuid not null references public.albums (id) on delete cascade,
  memory_id   uuid not null,
  memory_kind text not null,
  added_at    timestamptz not null default now(),
  primary key (album_id, memory_id)
);

alter table public.albums enable row level security;
alter table public.album_items enable row level security;

drop policy if exists albums_all on public.albums;
create policy albums_all on public.albums
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists album_items_all on public.album_items;
create policy album_items_all on public.album_items
  for all to authenticated
  using (exists (
    select 1 from public.albums a
    where a.id = album_items.album_id
      and a.couple_id = public.current_couple_id()
  ))
  with check (exists (
    select 1 from public.albums a
    where a.id = album_items.album_id
      and a.couple_id = public.current_couple_id()
  ));

-- A starting set, so the feature is not an empty screen on first open.
insert into public.albums (couple_id, name, icon)
select c.id, v.name, v.icon
from public.couples c
cross join (values
  ('Our trips', '✈️'),
  ('Random moments', '✨'),
  ('Dates', '🥂'),
  ('Birthdays', '🎂'),
  ('Us being silly', '😂'),
  ('Favourites', '⭐')
) as v(name, icon)
where not exists (
  select 1 from public.albums a where a.couple_id = c.id and a.name = v.name
);
