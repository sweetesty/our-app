-- ============================================================================
-- 0052_on_this_day.sql — the archive reads itself back
-- ============================================================================
-- Everything in this app is written once and never seen again. Notes, moments,
-- milestones, card answers, letters, compliments — all timestamped, all sat
-- there. The app is write-only, and a write-only archive is a drawer.
--
-- This is the read. One function that asks "what happened on this date in a
-- previous year, and what did we say a year ago" across everything at once.
--
-- Two rules it obeys.
--
-- The reveal gates are repeated, exactly as they are in search. A daily answer
-- resurfaced a year later is still your partner's answer, and if you never
-- wrote yours that day you still do not get to read it. The vault likewise.
--
-- And nothing from the last fortnight counts. "On this day" showing you
-- something from last Tuesday is not a memory, it is the feed you already
-- scrolled.

create or replace function public.on_this_day(
  -- Overridable so the screen can look at a specific date, and so this is
  -- testable without waiting a year.
  target date default null
)
returns table (
  id          uuid,
  kind        text,
  title       text,
  body        text,
  media_path  text,
  source      text,
  happened_on date,
  years_ago   int
)
language sql
stable
security definer
set search_path = public
as $$
  with cid as (select public.current_couple_id() as v),
       day as (select coalesce(target, current_date) as v),
       -- Same day and month, any earlier year.
       lim as (select (select v from day) - 14 as cutoff)

  select n.id, 'note', coalesce(n.title, 'A note'), n.body, n.photo_path, 'notes',
         n.created_at::date,
         (extract(year from (select v from day)) - extract(year from n.created_at))::int
  from public.love_notes n
  where n.couple_id = (select v from cid)
    and extract(month from n.created_at) = extract(month from (select v from day))
    and extract(day   from n.created_at) = extract(day   from (select v from day))
    and n.created_at::date <= (select cutoff from lim)

  union all

  select ms.id, 'milestone', ms.title, ms.description, null, 'timeline',
         ms.happened_on,
         (extract(year from (select v from day)) - extract(year from ms.happened_on))::int
  from public.milestones ms
  where ms.couple_id = (select v from cid)
    and extract(month from ms.happened_on) = extract(month from (select v from day))
    and extract(day   from ms.happened_on) = extract(day   from (select v from day))
    and ms.happened_on <= (select cutoff from lim)

  union all

  -- Media on a milestone is usually the better thing to show than its words.
  select mm.id, 'milestone_photo', ms.title, ms.description, mm.storage_path, 'timeline',
         ms.happened_on,
         (extract(year from (select v from day)) - extract(year from ms.happened_on))::int
  from public.milestone_media mm
  join public.milestones ms on ms.id = mm.milestone_id
  where ms.couple_id = (select v from cid)
    and mm.media_type = 'photo'
    and extract(month from ms.happened_on) = extract(month from (select v from day))
    and extract(day   from ms.happened_on) = extract(day   from (select v from day))
    and ms.happened_on <= (select cutoff from lim)

  union all

  -- Moments expire, but an expired one still happened; it is only the image
  -- that goes. Resurfacing the caption without the photo is worse than
  -- nothing, so expired ones are left out.
  select mo.id, 'moment', 'A moment', mo.caption, mo.storage_path, 'moments',
         mo.created_at::date,
         (extract(year from (select v from day)) - extract(year from mo.created_at))::int
  from public.moments mo
  where mo.couple_id = (select v from cid)
    and (mo.expires_at is null or mo.expires_at > now())
    and extract(month from mo.created_at) = extract(month from (select v from day))
    and extract(day   from mo.created_at) = extract(day   from (select v from day))
    and mo.created_at::date <= (select cutoff from lim)

  union all

  select dp.id, 'photo', 'Our day', dp.caption, dp.storage_path, 'daily',
         dp.taken_on,
         (extract(year from (select v from day)) - extract(year from dp.taken_on))::int
  from public.daily_photos dp
  where dp.couple_id = (select v from cid)
    and extract(month from dp.taken_on) = extract(month from (select v from day))
    and extract(day   from dp.taken_on) = extract(day   from (select v from day))
    and dp.taken_on <= (select cutoff from lim)
    and (dp.author_id = auth.uid() or public.has_posted_photo(dp.taken_on))

  union all

  -- The reveal gate, repeated. A year does not open a door you never opened.
  select a.id, 'answer',
         -- A day's question is either one from the bank or one of you wrote it.
         coalesce(qb.body, dq.custom_body, 'A question'),
         a.body, null, 'today',
         a.created_at::date,
         (extract(year from (select v from day)) - extract(year from a.created_at))::int
  from public.daily_answers a
  join public.daily_questions dq on dq.id = a.daily_question_id
  left join public.question_bank qb on qb.id = dq.question_id
  where a.couple_id = (select v from cid)
    and extract(month from a.created_at) = extract(month from (select v from day))
    and extract(day   from a.created_at) = extract(day   from (select v from day))
    and a.created_at::date <= (select cutoff from lim)
    and (a.author_id = auth.uid() or public.has_answered(a.daily_question_id))

  union all

  select p.id, 'card', c.body, p.response, p.voice_path, 'cards',
         p.played_at::date,
         (extract(year from (select v from day)) - extract(year from p.played_at))::int
  from public.card_plays p
  join public.cards c on c.id = p.card_id
  where p.couple_id = (select v from cid)
    and p.response is not null
    and extract(month from p.played_at) = extract(month from (select v from day))
    and extract(day   from p.played_at) = extract(day   from (select v from day))
    and p.played_at::date <= (select cutoff from lim)
    and (
      p.played_by = auth.uid()
      or p.round_id is null
      or (select count(*) from public.card_plays q2 where q2.round_id = p.round_id) >= 2
    )

  union all

  select cp.id, 'compliment', 'A compliment', cp.body, null, 'compliments',
         cp.created_at::date,
         (extract(year from (select v from day)) - extract(year from cp.created_at))::int
  from public.compliments cp
  where cp.couple_id = (select v from cid)
    and extract(month from cp.created_at) = extract(month from (select v from day))
    and extract(day   from cp.created_at) = extract(day   from (select v from day))
    and cp.created_at::date <= (select cutoff from lim)

  union all

  -- Opened letters only. A sealed one resurfacing would give away both that it
  -- exists and roughly what it is.
  select vi.id, 'vault', vi.label, vc.body, vc.media_path, 'vault',
         vi.unlocked_at::date,
         (extract(year from (select v from day)) - extract(year from vi.unlocked_at))::int
  from public.vault_items vi
  join public.vault_contents vc on vc.item_id = vi.id
  where vi.couple_id = (select v from cid)
    and vi.unlocked_at is not null
    and extract(month from vi.unlocked_at) = extract(month from (select v from day))
    and extract(day   from vi.unlocked_at) = extract(day   from (select v from day))
    and vi.unlocked_at::date <= (select cutoff from lim)

  order by years_ago, happened_on desc;
$$;

grant execute on function public.on_this_day(date) to authenticated;

-- ---------------------------------------------------------------------------
-- the same question, last time
-- ---------------------------------------------------------------------------
-- Different from the above and better: today's question has almost certainly
-- been asked before, and what the two of you said last time is the single most
-- interesting thing the archive can hand back. It only became possible to show
-- both halves once rounds made answers readable.

create or replace function public.answered_before()
returns table (
  question   text,
  asked_on   date,
  mine       text,
  theirs     text,
  years_ago  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with cid as (select public.current_couple_id() as v),
       today_q as (
         select dq.question_id
         from public.daily_questions dq
         where dq.couple_id = (select v from cid)
           and dq.asked_on = current_date
           and dq.question_id is not null
         limit 1
       ),
       -- Every previous outing of the same question, most recent first.
       past as (
         select dq.id, dq.asked_on, coalesce(qb.body, dq.custom_body) as body
         from public.daily_questions dq
         left join public.question_bank qb on qb.id = dq.question_id
         where dq.couple_id = (select v from cid)
           -- Only bank questions repeat; a custom one was written for that day.
           and dq.question_id is not null
           and dq.question_id = (select question_id from today_q)
           and dq.asked_on < current_date
         order by dq.asked_on desc
         limit 1
       )
  select
    p.body,
    p.asked_on,
    (select a.body from public.daily_answers a
      where a.daily_question_id = p.id and a.author_id = auth.uid()),
    -- Their half only if you answered that day too. The gate does not expire.
    (select a.body from public.daily_answers a
      where a.daily_question_id = p.id
        and a.author_id <> auth.uid()
        and public.has_answered(p.id)),
    round(((current_date - p.asked_on) / 365.0)::numeric, 1)
  from past p
  where exists (
    select 1 from public.daily_answers a
    where a.daily_question_id = p.id and a.author_id = auth.uid()
  );
$$;

grant execute on function public.answered_before() to authenticated;
