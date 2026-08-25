-- ============================================================================
-- 0020_album_order.sql — let albums be arranged, renamed and removed
-- ============================================================================
-- Albums came out in creation order with a generic folder icon and no way to
-- rename or delete one. The albums you reach for most should sit first.

alter table public.albums
  add column if not exists sort_order integer not null default 100;

-- Seed the existing ones in their current order so nothing jumps around the
-- first time this runs.
with ordered as (
  select id, row_number() over (partition by couple_id order by created_at) * 10 as rank
  from public.albums
)
update public.albums a
set sort_order = ordered.rank
from ordered
where ordered.id = a.id
  and a.sort_order = 100;

create index if not exists albums_order_idx
  on public.albums (couple_id, sort_order);

-- ---------------------------------------------------------------------------
-- reordering
-- ---------------------------------------------------------------------------
-- Takes the full ordered list of ids and rewrites the ranks. Sending the whole
-- order in one call keeps it atomic — a drag that moves one album shifts every
-- album after it, and doing that as separate updates would leave gaps or
-- duplicates if one failed.

create or replace function public.reorder_albums(album_ids uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  update public.albums a
  set sort_order = pos.rank * 10,
      -- keep the row in this couple; the array is client-supplied
      id = a.id
  from (
    select unnest(album_ids) as id,
           generate_subscripts(album_ids, 1) as rank
  ) pos
  where pos.id = a.id
    and a.couple_id = cid;
end;
$$;

create or replace function public.update_album(
  album uuid,
  new_name text default null,
  new_icon text default null
)
returns public.albums
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.albums;
begin
  update public.albums a
  set name = coalesce(nullif(trim(new_name), ''), a.name),
      icon = coalesce(nullif(trim(new_icon), ''), a.icon)
  where a.id = album
    and a.couple_id = public.current_couple_id()
  returning * into result;

  if result.id is null then
    raise exception 'No such album.';
  end if;

  return result;
end;
$$;

grant execute on function public.reorder_albums(uuid[]) to authenticated;
grant execute on function public.update_album(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- ordering the photos inside an album
-- ---------------------------------------------------------------------------
-- The gallery is newest-first, which is right for "everything" but wrong for an
-- album: a trip reads in the order it happened, and the picture you want first
-- is rarely the last one you uploaded.

alter table public.album_items
  add column if not exists sort_order integer not null default 100;

with ordered as (
  select album_id, memory_id,
         row_number() over (partition by album_id order by added_at) * 10 as rank
  from public.album_items
)
update public.album_items ai
set sort_order = ordered.rank
from ordered
where ordered.album_id = ai.album_id
  and ordered.memory_id = ai.memory_id
  and ai.sort_order = 100;

create index if not exists album_items_order_idx
  on public.album_items (album_id, sort_order);

create or replace function public.reorder_album_items(
  album uuid,
  memory_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Ownership is checked once here rather than trusting the id list.
  if not exists (
    select 1 from public.albums a
    where a.id = album and a.couple_id = public.current_couple_id()
  ) then
    raise exception 'No such album.';
  end if;

  update public.album_items ai
  set sort_order = pos.rank * 10
  from (
    select unnest(memory_ids) as memory_id,
           generate_subscripts(memory_ids, 1) as rank
  ) pos
  where pos.memory_id = ai.memory_id
    and ai.album_id = album;
end;
$$;

grant execute on function public.reorder_album_items(uuid, uuid[]) to authenticated;
