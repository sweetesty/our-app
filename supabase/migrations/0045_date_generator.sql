-- ============================================================================
-- 0045_date_generator.sql — 🎲 PICK OUR DATE
-- ============================================================================
-- The problem this solves is not "we have no ideas". It's the twenty minutes
-- of "I don't mind, what do you want to do" that happens on a Friday with four
-- hours free and no money, which ends in neither of you doing anything.
--
-- So the filters are the real ones: what it costs, whether you're going out,
-- how long you've actually got, and what mood you're in. An idea that doesn't
-- fit all four is not an idea, it's a reminder that you can't afford it.
--
-- `indoor` and `vibe` are nullable on purpose: an idea that works either way
-- should turn up under both filters rather than be filed under one.

create table if not exists public.date_ideas (
  id          uuid primary key default gen_random_uuid(),
  -- Null is built-in; set means the two of you wrote it.
  couple_id   uuid references public.couples (id) on delete cascade,
  title       text not null,
  emoji       text not null default '🎲',
  budget      text not null default 'cheap'
              check (budget in ('free', 'cheap', 'mid', 'splash')),
  -- true indoor, false outdoor, null either.
  indoor      boolean,
  -- Roughly how long it needs, in minutes.
  minutes     int not null default 120,
  -- romantic / fun / chill, or null for one that's whatever you make it.
  vibe        text check (vibe in ('romantic', 'fun', 'chill')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists date_ideas_filter_idx
  on public.date_ideas (budget, minutes, vibe);

-- What you were given and what you did with it. Without this the button is a
-- slot machine; with it, "we said we'd do this one" is answerable.
create table if not exists public.date_picks (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  idea_id     uuid not null references public.date_ideas (id) on delete cascade,
  picked_by   uuid references public.profiles (id) on delete set null,
  -- Set when you actually did it. Only then is it worth remembering.
  done_at     timestamptz,
  picked_at   timestamptz not null default now()
);

create index if not exists date_picks_couple_idx
  on public.date_picks (couple_id, picked_at desc);

alter table public.date_ideas enable row level security;
alter table public.date_picks enable row level security;

drop policy if exists date_ideas_read on public.date_ideas;
create policy date_ideas_read on public.date_ideas
  for select to authenticated
  using (couple_id is null or couple_id = public.current_couple_id());

drop policy if exists date_ideas_write on public.date_ideas;
create policy date_ideas_write on public.date_ideas
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists date_picks_all on public.date_picks;
create policy date_picks_all on public.date_picks
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- the button
-- ---------------------------------------------------------------------------

-- Deals one idea matching the filters, and records that it was dealt.
--
-- Recently-picked ideas are pushed to the back rather than excluded: on a tight
-- filter there may only be three matches, and "no ideas" is a worse answer than
-- one you saw a fortnight ago.
create or replace function public.pick_date(
  max_budget  text default 'splash',
  want_indoor boolean default null,
  max_minutes int default 600,
  want_vibe   text default null
)
returns table (
  id       uuid,
  title    text,
  emoji    text,
  budget   text,
  indoor   boolean,
  minutes  int,
  vibe     text,
  pick_id  uuid
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid   uuid := public.current_couple_id();
  rank_ int;
  found_id uuid;
  new_pick uuid;
begin
  if cid is null then
    return;
  end if;

  -- 'cheap' means "this or cheaper", the way a budget filter is always meant.
  rank_ := case max_budget
             when 'free' then 0 when 'cheap' then 1
             when 'mid'  then 2 else 3 end;

  select d.id into found_id
  from public.date_ideas d
  where (d.couple_id is null or d.couple_id = cid)
    and case d.budget when 'free' then 0 when 'cheap' then 1
                      when 'mid' then 2 else 3 end <= rank_
    and d.minutes <= max_minutes
    -- A null on the idea means "either", so it matches whatever you asked for.
    and (want_indoor is null or d.indoor is null or d.indoor = want_indoor)
    and (want_vibe is null or d.vibe is null or d.vibe = want_vibe)
  order by
    coalesce((
      select max(p.picked_at) from public.date_picks p
      where p.idea_id = d.id and p.couple_id = cid
    ), 'epoch'::timestamptz) asc,
    random()
  limit 1;

  if found_id is null then
    return;
  end if;

  insert into public.date_picks (couple_id, idea_id, picked_by)
  values (cid, found_id, auth.uid())
  returning date_picks.id into new_pick;

  return query
  select d.id, d.title, d.emoji, d.budget, d.indoor, d.minutes, d.vibe, new_pick
  from public.date_ideas d where d.id = found_id;
end;
$$;

-- "We actually did it." Writes the date onto the timeline, the same way a
-- ticked bucket-list item does — a date you went on is a thing that happened.
create or replace function public.date_done(pick uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  pick_row public.date_picks;
  idea public.date_ideas;
begin
  select * into pick_row from public.date_picks
  where id = pick and couple_id = public.current_couple_id();

  if not found or pick_row.done_at is not null then
    return;
  end if;

  select * into idea from public.date_ideas where id = pick_row.idea_id;

  insert into public.milestones (couple_id, created_by, title, description, happened_on, icon)
  values (
    pick_row.couple_id, auth.uid(), idea.title, 'Date night.', current_date,
    coalesce(nullif(idea.emoji, ''), '🎲')
  );

  update public.date_picks set done_at = now() where id = pick;
end;
$$;

grant execute on function public.pick_date(text, boolean, int, text) to authenticated;
grant execute on function public.date_done(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- the ideas
-- ---------------------------------------------------------------------------

insert into public.date_ideas (couple_id, title, emoji, budget, indoor, minutes, vibe)
values
  -- free, in, short ------------------------------------------------------
  (null, 'Cook each other''s favourite meal, then a film', '🍝', 'cheap', true, 180, 'chill'),
  (null, 'Play every song that meant something to us, in order', '🎧', 'free', true, 90, 'romantic'),
  (null, 'Build a blanket fort. Yes, actually', '🛋️', 'free', true, 120, 'fun'),
  (null, 'Cook one thing neither of us has made before', '🥘', 'cheap', true, 150, 'fun'),
  (null, 'Read to each other for an hour', '📖', 'free', true, 60, 'chill'),
  (null, 'Go through old photos and tell the stories properly', '📸', 'free', true, 90, 'romantic'),
  (null, 'Give each other a proper massage. No phones', '🕯️', 'free', true, 60, 'romantic'),
  (null, 'Draw each other badly. Winner picks dinner', '✏️', 'free', true, 45, 'fun'),
  (null, 'A film neither of us would pick alone', '🎬', 'free', true, 150, 'chill'),
  (null, 'Learn one dance off the internet, badly', '💃', 'free', true, 45, 'fun'),
  (null, 'Write each other a letter, seal it for a year', '💌', 'free', true, 60, 'romantic'),
  (null, 'Breakfast for dinner, in bed', '🍳', 'cheap', true, 90, 'chill'),
  (null, 'Video call and cook the same thing apart', '📱', 'cheap', true, 120, 'chill'),
  (null, 'Rank every meal we''ve ever had together', '🏆', 'free', true, 45, 'fun'),
  (null, 'Do nothing, together, with the phones in another room', '🌙', 'free', true, 60, 'chill'),

  -- out ------------------------------------------------------------------
  (null, 'Walk somewhere new with no destination', '🚶', 'free', false, 90, 'chill'),
  (null, 'Watch the sun go down somewhere high up', '🌅', 'free', false, 60, 'romantic'),
  (null, 'The place we keep saying we''ll try', '🍽️', 'mid', false, 150, 'romantic'),
  (null, 'Get on a bus going somewhere we''ve never been', '🚌', 'cheap', false, 180, 'fun'),
  (null, 'Late-night drive with the music too loud', '🚗', 'cheap', false, 120, 'fun'),
  (null, 'Market, buy whatever looks good, cook it', '🧺', 'mid', false, 240, 'fun'),
  (null, 'A walk at an hour we''re never normally awake', '🌄', 'free', false, 90, 'romantic'),
  (null, 'Sit in a café and people-watch, no agenda', '☕', 'cheap', false, 90, 'chill'),
  (null, 'Find the highest place nearby and go up it', '⛰️', 'free', false, 180, 'fun'),
  (null, 'Picnic. Even if the weather is wrong', '🧺', 'cheap', false, 120, 'romantic'),
  (null, 'Go to the cinema without checking what''s on', '🎟️', 'mid', false, 180, 'fun'),
  (null, 'Walk to the water, wherever the nearest water is', '🌊', 'free', false, 120, 'chill'),
  (null, 'One night away, somewhere an hour from here', '🧳', 'splash', false, 600, 'romantic'),
  (null, 'The nice restaurant. The actual nice one', '🥂', 'splash', false, 210, 'romantic'),
  (null, 'Book the thing we always say we''ll book', '✈️', 'splash', false, 600, 'fun'),

  -- either ---------------------------------------------------------------
  (null, 'Twenty questions, no lying, no deflecting', '🎯', 'free', null, 45, 'romantic'),
  (null, 'Plan the imaginary house, room by room', '🏡', 'free', null, 60, 'chill'),
  (null, 'Each pick three songs for the other to sit through', '🎵', 'free', null, 30, 'fun'),
  (null, 'Do the thing at the top of the bucket list', '✨', 'mid', null, 240, null),
  (null, 'Take a photo every hour, compare at the end', '📷', 'free', null, 480, 'fun'),
  (null, 'Swap phones for an hour. Brave option', '😈', 'free', null, 60, 'fun'),
  (null, 'Answer the deep deck until one of us cries', '🫶', 'free', null, 90, 'romantic')
on conflict do nothing;
