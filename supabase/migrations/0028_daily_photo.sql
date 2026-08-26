-- ============================================================================
-- 0028_daily_photo.sql — both post, both unlock
-- ============================================================================
-- The daily question already works this way: you cannot read their answer until
-- you have written yours. This is the same bargain in pictures — post your day,
-- see theirs.
--
-- The gate lives in RLS, not in the UI, for the same reason as the question:
-- a rule you can get round by opening the network tab is not a rule.
--
-- current_date matches daily_questions, so both rituals roll over together
-- rather than a few hours apart.

create table if not exists public.daily_photos (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  author_id     uuid not null references public.profiles (id) on delete cascade,
  storage_path  text not null,
  caption       text,
  taken_on      date not null default current_date,
  created_at    timestamptz not null default now(),
  -- One a day each. Replacing yours is an update, not a second row.
  unique (couple_id, author_id, taken_on)
);

create index if not exists daily_photos_day_idx
  on public.daily_photos (couple_id, taken_on desc);

alter table public.daily_photos enable row level security;

-- ---------------------------------------------------------------------------

/**
 * Have I posted on this day?
 *
 * SECURITY DEFINER so the reveal policy can ask about a row the caller cannot
 * see yet — querying daily_photos from inside its own policy would recurse.
 */
create or replace function public.has_posted_photo(day date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.daily_photos p
    where p.couple_id = public.current_couple_id()
      and p.author_id = auth.uid()
      and p.taken_on = day
  );
$$;

grant execute on function public.has_posted_photo(date) to authenticated;

drop policy if exists daily_photos_read on public.daily_photos;
create policy daily_photos_read on public.daily_photos
  for select to authenticated
  using (
    couple_id = public.current_couple_id()
    and (author_id = auth.uid() or public.has_posted_photo(taken_on))
  );

drop policy if exists daily_photos_write on public.daily_photos;
create policy daily_photos_write on public.daily_photos
  for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

-- Changing your mind about today's photo. Only your own.
drop policy if exists daily_photos_update on public.daily_photos;
create policy daily_photos_update on public.daily_photos
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists daily_photos_delete on public.daily_photos;
create policy daily_photos_delete on public.daily_photos
  for delete to authenticated
  using (author_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'daily_photos'
     )
  then
    alter publication supabase_realtime add table public.daily_photos;
  end if;
end $$;

-- ---------------------------------------------------------------------------

create or replace function public.post_daily_photo(
  path text,
  photo_caption text default null
)
returns public.daily_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.daily_photos;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  -- Re-posting replaces today's rather than failing on the unique constraint,
  -- so "retake" is the same action as "post".
  insert into public.daily_photos (couple_id, author_id, storage_path, caption)
  values (cid, auth.uid(), path, nullif(trim(coalesce(photo_caption, '')), ''))
  on conflict (couple_id, author_id, taken_on) do update
    set storage_path = excluded.storage_path,
        caption = excluded.caption,
        created_at = now()
  returning * into result;

  return result;
end;
$$;

/**
 * Today's pair.
 *
 * Returns their photo only once yours exists. The RLS policy would hide it
 * anyway; this reports the state so the screen can say "waiting for them"
 * rather than showing an empty frame with no explanation.
 */
create or replace function public.today_photos()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  mine public.daily_photos;
  theirs public.daily_photos;
  partner uuid := public.partner_id();
begin
  if cid is null then
    return jsonb_build_object('paired', false);
  end if;

  select * into mine from public.daily_photos
  where couple_id = cid and author_id = auth.uid() and taken_on = current_date;

  select * into theirs from public.daily_photos
  where couple_id = cid and author_id = partner and taken_on = current_date;

  return jsonb_build_object(
    'paired', true,
    'mine', to_jsonb(mine),
    'partner_posted', theirs.id is not null,
    -- The gate. Their picture is withheld here as well as in RLS, so a change
    -- to one cannot quietly open the other.
    'partner_photo', case when mine.id is not null then to_jsonb(theirs) else null end,
    'revealed', mine.id is not null and theirs.id is not null
  );
end;
$$;

grant execute on function public.post_daily_photo(text, text) to authenticated;
grant execute on function public.today_photos() to authenticated;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------

create or replace function public.on_daily_photo_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  both_in boolean;
begin
  select display_name into author_name
  from public.profiles where id = new.author_id;

  select exists (
    select 1 from public.daily_photos p
    where p.couple_id = new.couple_id
      and p.author_id <> new.author_id
      and p.taken_on = new.taken_on
  ) into both_in;

  perform public.dispatch_push(jsonb_build_object(
    -- 'reveal' when this post completes the pair, so the copy can say the
    -- picture is waiting rather than asking for one that already exists.
    'type', case when both_in then 'reveal' else 'photo' end,
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They')
  ));

  return new;
end;
$$;

drop trigger if exists daily_photos_push on public.daily_photos;
create trigger daily_photos_push
  after insert on public.daily_photos
  for each row execute function public.on_daily_photo_push();

-- ---------------------------------------------------------------------------
-- one photo, one flow
-- ---------------------------------------------------------------------------
-- A daily photo is a memory like any other. memories() is SECURITY DEFINER, so
-- RLS does not apply inside it — the reveal gate has to be repeated explicitly
-- or the gallery would show a picture the question screen is still hiding.

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

  select ms.id, 'note', ms.title, ms.description, null,
         'timeline', ms.id, ms.created_at
  from public.milestones ms
  where ms.couple_id = (select v from cid)
    and not exists (
      select 1 from public.milestone_media mm where mm.milestone_id = ms.id
    )

  union all

  select n.id, 'note', coalesce(n.title, 'A note'), n.body, n.photo_path,
         'notes', n.id, n.created_at
  from public.love_notes n
  where n.couple_id = (select v from cid)

  union all

  -- voice_path (0027) rides along as the media, so a recorded dare plays back
  -- from the gallery instead of only being described in text.
  select p.id, case when p.voice_path is not null then 'voice' else 'card' end, d.name,
         c.body || case when p.response is not null then E'\n— ' || p.response else '' end,
         p.voice_path, 'cards', p.card_id, p.played_at
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

  union all

  -- Days you both posted. Yours always; theirs only once you had posted too,
  -- which for a past day is settled and cannot change.
  select dp.id, 'photo', 'Our day', dp.caption, dp.storage_path,
         'daily', dp.id, dp.created_at
  from public.daily_photos dp
  where dp.couple_id = (select v from cid)
    and (dp.author_id = auth.uid() or public.has_posted_photo(dp.taken_on))

  order by created_at desc
  limit least(greatest(limit_count, 1), 500);
$$;

grant execute on function public.memories(text[], integer) to authenticated;
