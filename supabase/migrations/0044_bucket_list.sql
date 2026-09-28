-- ============================================================================
-- 0044_bucket_list.sql — the list of things you haven't done yet
-- ============================================================================
-- Six categories, because "bucket list" as one pile mixes "Japan" with "try the
-- place on the corner" and the corner one never gets done — it looks trivial
-- next to Japan, so it's never the thing you pick.
--
-- The part that matters is what happens when you tick one off. A completed
-- bucket-list item is, by definition, a thing you did together and wanted to do
-- for a long time, which is the exact definition of a milestone. So completing
-- one writes itself onto the timeline rather than merely going grey. The
-- trigger below is that, and it keeps the milestone's id so un-completing it
-- can take the memory back out again.

create table if not exists public.bucket_items (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  category      text not null check (category in (
                  'places',      -- 🌍 Places
                  'experiences', -- 🎢 Experiences
                  'food',        -- 🍽️ Food
                  'goals',       -- 🎯 Goals
                  'save_for',    -- 💰 Things to save for
                  'always'       -- 🥹 Things we've always wanted to do
                )),
  title         text not null check (length(trim(title)) > 0),
  note          text,
  created_by    uuid references public.profiles (id) on delete set null,
  completed_at  timestamptz,
  completed_by  uuid references public.profiles (id) on delete set null,
  -- The timeline entry this became. Kept so undoing a tick can remove it.
  milestone_id  uuid references public.milestones (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists bucket_items_couple_idx
  on public.bucket_items (couple_id, category, completed_at nulls first, created_at);

alter table public.bucket_items enable row level security;

-- Joint by nature. Either of you may add, tick, or take something off.
drop policy if exists bucket_items_all on public.bucket_items;
create policy bucket_items_all on public.bucket_items
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- ticking one off
-- ---------------------------------------------------------------------------

create or replace function public.complete_bucket_item(item uuid, done boolean default true)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  item_row public.bucket_items;
  made uuid;
begin
  select * into item_row from public.bucket_items
  where id = item and couple_id = public.current_couple_id();

  if not found then
    raise exception 'No such item';
  end if;

  if not done then
    -- Untick. Take the memory back out too — leaving it would claim you did
    -- something you have just said you did not.
    if item_row.milestone_id is not null then
      delete from public.milestones where id = item_row.milestone_id;
    end if;

    update public.bucket_items
    set completed_at = null, completed_by = null, milestone_id = null
    where id = item;
    return;
  end if;

  if item_row.completed_at is not null then
    return;   -- already done; ticking twice should not write a second memory
  end if;

  insert into public.milestones (couple_id, created_by, title, description, happened_on, icon)
  values (
    item_row.couple_id,
    auth.uid(),
    item_row.title,
    coalesce(
      nullif(trim(coalesce(item_row.note, '')), ''),
      'Off the bucket list.'
    ),
    current_date,
    -- Marks it on the timeline as one you'd been waiting to do, rather than
    -- something that merely happened.
    '✨'
  )
  returning id into made;

  update public.bucket_items
  set completed_at = now(), completed_by = auth.uid(), milestone_id = made
  where id = item;
end;
$$;

grant execute on function public.complete_bucket_item(uuid, boolean) to authenticated;

-- "4 of 23 done" per category, which is what the screen's headings show.
create or replace function public.bucket_summary()
returns table (category text, total int, done int)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.category,
    count(*)::int,
    count(*) filter (where b.completed_at is not null)::int
  from public.bucket_items b
  where b.couple_id = public.current_couple_id()
  group by b.category;
$$;

grant execute on function public.bucket_summary() to authenticated;

-- Worth telling them. Adding one is an invitation; ticking one is news.
create or replace function public.on_bucket_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  -- Only the moment it goes from not-done to done.
  if new.completed_at is null or old.completed_at is not null then
    return new;
  end if;

  select display_name into who from public.profiles where id = new.completed_by;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'bucket',
    'couple_id', new.couple_id,
    'sender_id', new.completed_by,
    'sender_name', coalesce(who, 'They'),
    'label', new.title,
    'message', 'It''s on the timeline now.'
  ));

  return new;
end;
$$;

drop trigger if exists bucket_items_push on public.bucket_items;
create trigger bucket_items_push
  after update on public.bucket_items
  for each row execute function public.on_bucket_push();

-- ---------------------------------------------------------------------------
-- a few to start with
-- ---------------------------------------------------------------------------
-- Not a full list — an empty screen with six headings and nothing under them
-- is harder to start than one with a couple of examples in it. Only inserted
-- for couples who have none at all, so this never lands on top of a real list.

create or replace function public.seed_bucket_list()
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  added int;
begin
  if cid is null then
    return 0;
  end if;

  if exists (select 1 from public.bucket_items where couple_id = cid) then
    return 0;
  end if;

  insert into public.bucket_items (couple_id, category, title, created_by)
  select cid, v.category, v.title, auth.uid()
  from (values
    ('places',      'Somewhere neither of us has been'),
    ('places',      'A weekend away with no plan'),
    ('experiences', 'Watch a sunrise, properly awake'),
    ('experiences', 'Learn something we''re both bad at'),
    ('food',        'Cook each other''s favourite meal'),
    ('food',        'The place we keep saying we''ll try'),
    ('goals',       'A month with no week of silence'),
    ('save_for',    'The trip'),
    ('always',      'The thing I''ve wanted to do since before we met')
  ) as v(category, title);

  get diagnostics added = row_count;
  return added;
end;
$$;

grant execute on function public.seed_bucket_list() to authenticated;
