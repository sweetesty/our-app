-- ============================================================================
-- 0017_moments.sql — Locket-style photos, and reactions for everything
-- ============================================================================
-- A moment is a photo sent straight to your person. It is NOT a separate photo
-- store: memories() reads it alongside everything else, so one photo flows
-- moment -> feed -> memory -> album without ever being copied.
--
-- Reactions are deliberately generic. Building them only for photos would mean
-- rebuilding them for notes, cards and messages later; one table with a target
-- kind covers all of it.

create table if not exists public.moments (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  storage_path text not null,
  media_type   text not null default 'photo' check (media_type in ('photo', 'video')),
  caption      text,
  -- Optional disappearing moments. Null means it stays forever, which is the
  -- default: this is a scrapbook first and a snapchat second.
  expires_at   timestamptz,
  seen_at      timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists moments_couple_idx
  on public.moments (couple_id, created_at desc);

alter table public.moments enable row level security;

drop policy if exists moments_read on public.moments;
create policy moments_read on public.moments
  for select to authenticated
  using (
    couple_id = public.current_couple_id()
    -- An expired moment stops being readable at the database, not just hidden
    -- in the UI. "Disappearing" should mean it.
    and (expires_at is null or expires_at > now())
  );

drop policy if exists moments_write on public.moments;
create policy moments_write on public.moments
  for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

drop policy if exists moments_update on public.moments;
create policy moments_update on public.moments
  for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists moments_delete on public.moments;
create policy moments_delete on public.moments
  for delete to authenticated
  using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- reactions — one table, any target
-- ---------------------------------------------------------------------------

create table if not exists public.reactions (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  target_kind text not null check (target_kind in (
                'moment', 'note', 'card_play', 'milestone', 'answer'
              )),
  target_id   uuid not null,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  -- Same person, same thing, same emoji, once.
  unique (user_id, target_kind, target_id, emoji)
);

create index if not exists reactions_target_idx
  on public.reactions (target_kind, target_id);

alter table public.reactions enable row level security;

drop policy if exists reactions_read on public.reactions;
create policy reactions_read on public.reactions
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists reactions_write on public.reactions;
create policy reactions_write on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.current_couple_id());

drop policy if exists reactions_delete on public.reactions;
create policy reactions_delete on public.reactions
  for delete to authenticated
  using (user_id = auth.uid());

/** Tap to add, tap again to remove. */
create or replace function public.toggle_reaction(
  kind text,
  target uuid,
  emoji_char text
)
returns boolean          -- true if now reacted, false if removed
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  existing uuid;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  select id into existing
  from public.reactions r
  where r.user_id = auth.uid()
    and r.target_kind = kind
    and r.target_id = target
    and r.emoji = emoji_char;

  if existing is not null then
    delete from public.reactions where id = existing;
    return false;
  end if;

  insert into public.reactions (couple_id, user_id, target_kind, target_id, emoji)
  values (cid, auth.uid(), kind, target, emoji_char);
  return true;
end;
$$;

grant execute on function public.toggle_reaction(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------

create or replace function public.on_moment_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  select display_name into author_name
  from public.profiles where id = new.author_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'moment',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    'message', new.caption
  ));

  return new;
end;
$$;

drop trigger if exists moments_push on public.moments;
create trigger moments_push
  after insert on public.moments
  for each row execute function public.on_moment_push();

create or replace function public.on_reaction_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  reactor_name text;
begin
  select display_name into reactor_name
  from public.profiles where id = new.user_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'reaction',
    'couple_id', new.couple_id,
    'sender_id', new.user_id,
    'sender_name', coalesce(reactor_name, 'They'),
    'kind', new.emoji
  ));

  return new;
end;
$$;

drop trigger if exists reactions_push on public.reactions;
create trigger reactions_push
  after insert on public.reactions
  for each row execute function public.on_reaction_push();

-- ---------------------------------------------------------------------------
-- one photo, one flow: moments become memories automatically
-- ---------------------------------------------------------------------------

create or replace function public.memories(
  kinds text[] default null,
  limit_count integer default 200
)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
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
  with cid as (select public.current_couple_id() as v)

  select mo.id, mo.media_type, 'A moment', mo.caption, mo.storage_path,
         'moments', mo.id, mo.created_at
  from public.moments mo
  where mo.couple_id = (select v from cid)
    and (mo.expires_at is null or mo.expires_at > now())

  union all

  select m.id, m.media_type, ms.title, m.caption, m.storage_path,
         'timeline', ms.id, m.created_at
  from public.milestone_media m
  join public.milestones ms on ms.id = m.milestone_id
  where m.couple_id = (select v from cid)

  union all

  select n.id, 'note', coalesce(n.title, 'A note'), n.body, n.photo_path,
         'notes', n.id, n.created_at
  from public.love_notes n
  where n.couple_id = (select v from cid) and n.photo_path is not null

  union all

  select p.id, 'card', d.name,
         c.body || case when p.response is not null then E'\n— ' || p.response else '' end,
         null, 'cards', p.card_id, p.played_at
  from public.card_plays p
  join public.cards c on c.id = p.card_id
  join public.card_decks d on d.id = c.deck_id
  where p.couple_id = (select v from cid) and p.response is not null

  union all

  select vc.item_id, coalesce(vc.media_type, 'photo'), v.label, null, vc.media_path,
         'vault', v.id, v.created_at
  from public.vault_contents vc
  join public.vault_items v on v.id = vc.item_id
  where v.couple_id = (select c2.v from cid c2)
    and vc.media_path is not null
    and v.unlocked_at is not null

  order by created_at desc
  limit least(greatest(limit_count, 1), 500);
$$;

-- Latest moment + reaction counts, for the home screen.
create or replace function public.latest_moment()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select case when m.id is null then null else jsonb_build_object(
    'id', m.id,
    'storage_path', m.storage_path,
    'media_type', m.media_type,
    'caption', m.caption,
    'author_id', m.author_id,
    'author_name', p.display_name,
    'mine', m.author_id = auth.uid(),
    'created_at', m.created_at,
    'reactions', coalesce((
      select jsonb_agg(jsonb_build_object('emoji', r.emoji, 'mine', r.user_id = auth.uid()))
      from public.reactions r
      where r.target_kind = 'moment' and r.target_id = m.id
    ), '[]'::jsonb)
  ) end
  from public.moments m
  left join public.profiles p on p.id = m.author_id
  where m.couple_id = public.current_couple_id()
    and (m.expires_at is null or m.expires_at > now())
  order by m.created_at desc
  limit 1;
$$;

grant execute on function public.latest_moment() to authenticated;
grant execute on function public.memories(text[], integer) to authenticated;
