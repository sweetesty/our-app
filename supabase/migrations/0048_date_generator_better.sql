-- ============================================================================
-- 0048_date_generator_better.sql — making the dice worth pressing twice
-- ============================================================================
-- Three things were missing from 0045.
--
-- You couldn't say "not that one". A generator you can't reject is a generator
-- you stop trusting on the second press, so pick_date now takes the ids you've
-- already turned down this sitting and deals around them.
--
-- It only ever knew ideas somebody else wrote. The best date suggestion the app
-- could possibly make is a thing the two of you already said you wanted to do,
-- which is sitting in the bucket list — so those are now candidates too,
-- marked as such, and ticking one off from here ticks it off there.
--
-- And a date you liked died on the screen. `plan_date` puts it in the calendar
-- with the reminder the rest of the app already knows how to send.

-- ---------------------------------------------------------------------------
-- rejecting one
-- ---------------------------------------------------------------------------

drop function if exists public.pick_date(text, boolean, int, text);
-- Both spellings of the six-argument version: 0049 renamed this parameter, and
-- Postgres will not rename one in place, so re-running this file after that one
-- fails with 42P13 unless the old function is gone first.
drop function if exists public.pick_date(text, boolean, int, text, uuid[], boolean);

create or replace function public.pick_date(
  max_budget  text default 'splash',
  want_indoor boolean default null,
  max_minutes int default 600,
  want_vibe   text default null,
  -- Ideas already turned down this sitting. Not persisted: "not tonight" is
  -- about tonight, and the same idea should be back next Friday.
  skip_ids    uuid[] default '{}',
  -- Whether the bucket list is in the draw. On by default — it's the best
  -- source of ideas in the app — but it's also the one you may want off when
  -- what you actually want is a suggestion you haven't thought of.
  use_bucket  boolean default true
)
returns table (
  id        uuid,
  title     text,
  emoji     text,
  budget    text,
  indoor    boolean,
  minutes   int,
  vibe      text,
  pick_id   uuid,
  -- Set when this came off the bucket list, so the screen can say so and
  -- offer to tick it.
  bucket_id uuid
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid      uuid := public.current_couple_id();
  rank_    int;
  found_id uuid;
  b_id     uuid;
  new_pick uuid;
begin
  if cid is null then
    return;
  end if;

  -- 'cheap' means "this or cheaper", the way a budget filter is always meant.
  rank_ := case max_budget
             when 'free' then 0 when 'cheap' then 1
             when 'mid'  then 2 else 3 end;

  -- The bucket list gets first refusal, but only sometimes: always preferring
  -- it would make the button a bucket-list reader, and the point of pressing
  -- dice is occasionally being told something you'd never have picked.
  if use_bucket and random() < 0.4 then
    select b.id into b_id
    from public.bucket_items b
    where b.couple_id = cid
      and b.completed_at is null
      and b.category in ('places', 'experiences', 'food', 'always')
      and not (b.id = any(skip_ids))
    order by random()
    limit 1;
  end if;

  if b_id is not null then
    return query
    select
      b.id,
      b.title,
      '✨'::text,
      max_budget,
      want_indoor,
      max_minutes,
      want_vibe,
      null::uuid,
      b.id
    from public.bucket_items b where b.id = b_id;
    return;
  end if;

  select d.id into found_id
  from public.date_ideas d
  where (d.couple_id is null or d.couple_id = cid)
    and not (d.id = any(skip_ids))
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
  select d.id, d.title, d.emoji, d.budget, d.indoor, d.minutes, d.vibe,
         new_pick, null::uuid
  from public.date_ideas d where d.id = found_id;
end;
$$;

grant execute on function public.pick_date(text, boolean, int, text, uuid[], boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- putting it in the diary
-- ---------------------------------------------------------------------------

-- A date you liked and then forgot about is the same as no date. This puts it
-- on the calendar both of you already look at, and the hourly job that
-- announces birthdays announces this too.
create or replace function public.plan_date(
  idea_title text,
  idea_emoji text default '🎲',
  on_date    date default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid  uuid := public.current_couple_id();
  made uuid;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  insert into public.important_dates
    (couple_id, title, kind, date_on, recurs_annually, icon, note,
     remind_days_before, created_by)
  values (
    cid,
    idea_title,
    'occasion',
    coalesce(on_date, current_date),
    false,
    coalesce(nullif(idea_emoji, ''), '🎲'),
    'Date night.',
    -- The day before. Long enough to buy something, short enough to still be
    -- true when it arrives.
    1,
    auth.uid()
  )
  returning id into made;

  return made;
end;
$$;

grant execute on function public.plan_date(text, text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- more of them
-- ---------------------------------------------------------------------------
-- Thirty-seven was enough to notice repeats within a month. These push it past
-- a hundred, weighted towards the free and the short — which is what a real
-- Friday usually is.

insert into public.date_ideas (couple_id, title, emoji, budget, indoor, minutes, vibe) values
  (null, 'Make a playlist for each other, listen to both', '🎶', 'free', true, 60, 'romantic'),
  (null, 'Bake something neither of us can bake', '🧁', 'cheap', true, 150, 'fun'),
  (null, 'Pick a country and cook its food badly', '🌍', 'cheap', true, 180, 'fun'),
  (null, 'Watch the film that made you cry as a kid', '😢', 'free', true, 150, 'chill'),
  (null, 'Teach each other something in ten minutes', '🎓', 'free', true, 30, 'fun'),
  (null, 'Write our own vows. No wedding required', '💍', 'free', true, 60, 'romantic'),
  (null, 'Interview each other like a podcast', '🎙️', 'free', true, 60, 'fun'),
  (null, 'Go through the vault and read one old letter', '🔒', 'free', true, 30, 'romantic'),
  (null, 'Blind taste test whatever is in the kitchen', '🥄', 'free', true, 45, 'fun'),
  (null, 'Rearrange one room together', '🛋️', 'free', true, 120, 'chill'),
  (null, 'Do a jigsaw and don''t talk about work', '🧩', 'cheap', true, 180, 'chill'),
  (null, 'Everyone''s asleep — cook something at midnight', '🌃', 'cheap', true, 90, 'fun'),
  (null, 'Watch the worst-rated film we can find', '🍅', 'free', true, 150, 'fun'),
  (null, 'Each write five questions, answer all ten', '📝', 'free', true, 60, 'romantic'),
  (null, 'Plan the fantasy trip we''ll never take', '🗺️', 'free', true, 60, 'chill'),
  (null, 'Give each other a haircut. Trust exercise', '✂️', 'free', true, 60, 'fun'),
  (null, 'One-ingredient challenge: whatever''s in the fridge', '🥕', 'free', true, 90, 'fun'),
  (null, 'Candles, no overhead lights, no screens', '🕯️', 'free', true, 90, 'romantic'),
  (null, 'Video of us answering the same ten questions', '🎥', 'free', true, 45, 'romantic'),
  (null, 'Sort the photos. Actually sort them', '🗂️', 'free', true, 120, 'chill'),
  (null, 'Learn the words to one whole song together', '🎤', 'free', true, 45, 'fun'),
  (null, 'Breakfast somewhere before work', '🥐', 'cheap', false, 60, 'romantic'),
  (null, 'Walk a route we''ve only ever driven', '🚶', 'free', false, 90, 'chill'),
  (null, 'Find the oldest building near us and look at it', '🏛️', 'free', false, 90, 'chill'),
  (null, 'Charity shops, £10 each, best find wins', '🛍️', 'cheap', false, 120, 'fun'),
  (null, 'Get lost on purpose, navigate home', '🧭', 'free', false, 120, 'fun'),
  (null, 'Library, pick a book for each other', '📚', 'free', false, 90, 'chill'),
  (null, 'Eat at the place with the worst sign', '🍟', 'cheap', false, 90, 'fun'),
  (null, 'Park bench, two coffees, no phones', '☕', 'cheap', false, 60, 'chill'),
  (null, 'Night bus to the end of the line and back', '🚌', 'cheap', false, 180, 'fun'),
  (null, 'Go and look at houses we can''t afford', '🏠', 'free', false, 120, 'fun'),
  (null, 'Stargazing, as far from lights as we can get', '🌌', 'free', false, 120, 'romantic'),
  (null, 'Photograph each other properly for an hour', '📷', 'free', false, 60, 'romantic'),
  (null, 'Swim. Somewhere. Even if it''s cold', '🏊', 'cheap', false, 120, 'fun'),
  (null, 'The market, then the good bakery', '🥖', 'cheap', false, 120, 'chill'),
  (null, 'Sunday roast somewhere we''ve never been', '🍖', 'mid', false, 180, 'chill'),
  (null, 'Live music. Anything. Don''t check who', '🎸', 'mid', false, 210, 'fun'),
  (null, 'A gallery, an hour, one favourite each', '🖼️', 'cheap', false, 120, 'chill'),
  (null, 'Mini golf and take it far too seriously', '⛳', 'mid', false, 120, 'fun'),
  (null, 'Drive until the radio station changes', '📻', 'cheap', false, 240, 'fun'),
  (null, 'Book the spa thing we keep not booking', '🧖', 'splash', false, 300, 'chill'),
  (null, 'Tasting menu. The full ridiculous one', '🍽️', 'splash', false, 240, 'romantic'),
  (null, 'Train somewhere for the day, no plan', '🚂', 'splash', false, 600, 'fun'),
  (null, 'Hotel in our own city for one night', '🛎️', 'splash', false, 600, 'romantic'),
  (null, 'Concert tickets for something we''d both love', '🎫', 'splash', false, 300, 'fun'),
  (null, 'Pick a memory and recreate it exactly', '🔁', 'cheap', null, 180, 'romantic'),
  (null, 'Each plan the other''s perfect hour', '⏳', 'free', null, 120, 'romantic'),
  (null, 'Do the thing the other one always suggests', '🤝', 'cheap', null, 150, 'chill'),
  (null, 'No-phone evening. Actual airplane mode', '📵', 'free', null, 180, 'chill'),
  (null, 'Answer the handbook questions neither has done', '📖', 'free', null, 45, 'romantic'),
  (null, 'Play every game in the app until one of us gives up', '🎮', 'free', null, 90, 'fun'),
  (null, 'Write a letter each for the vault, a year out', '💌', 'free', null, 45, 'romantic'),
  (null, 'Cook the first meal we ever ate together', '🍝', 'cheap', null, 150, 'romantic'),
  (null, 'Whoever''s had the worse week picks everything', '🫶', 'cheap', null, 180, 'chill')
on conflict do nothing;
