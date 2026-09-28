-- ============================================================================
-- 0050_fights.sql — counting the dates on the arguments too
-- ============================================================================
-- A deliberately unglamorous feature, and the tone is the whole design.
--
-- There is no "who started it" and no "whose fault", because a shared table
-- with a blame column is a weapon and would get used as one. What is recorded
-- is when it started, when you made up, what it was about, and what helped —
-- which are the four things you actually want in front of you the next time it
-- happens.
--
-- Nothing here writes to the timeline. Memories are for things you want to
-- look back on; an argument log is a tool, and it belongs in its own panel
-- where you go looking for it on purpose.
--
-- The numbers it produces are the ones that are genuinely reassuring: how long
-- since the last one, how quickly you tend to come back, and how many good
-- nights you had in the same stretch. "Six dates and one argument this month"
-- is a truer picture of a month than either number on its own, which is why
-- this counts both.

create table if not exists public.fights (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  -- Whoever opened the entry. A byline, not an accusation — either of you can
  -- log one and either of you can close it.
  logged_by    uuid references public.profiles (id) on delete set null,
  started_on   date not null default current_date,
  -- Null means it is still going. That state is visible to both of you, which
  -- is the point: an unresolved row on the screen is harder to leave than an
  -- unresolved feeling.
  resolved_on  date,
  what_about   text,
  -- Filled in at the end rather than the start, because it's only answerable
  -- then, and answering it is most of the value of keeping this at all.
  what_helped  text,
  created_at   timestamptz not null default now()
);

create index if not exists fights_couple_idx
  on public.fights (couple_id, started_on desc);

-- One open argument at a time. Two rows both saying "still going" means one of
-- them is stale, and a stale one poisons every number below it.
create unique index if not exists fights_open_idx
  on public.fights (couple_id) where resolved_on is null;

alter table public.fights enable row level security;

-- Joint. Either of you may log, close, or delete one — a record only one of you
-- can edit is a record the other one cannot trust.
drop policy if exists fights_all on public.fights;
create policy fights_all on public.fights
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- the numbers
-- ---------------------------------------------------------------------------

create or replace function public.fight_stats()
returns table (
  total            int,
  -- The open one, if there is one, and how long it has been going.
  open_id          uuid,
  open_since       date,
  open_days        int,
  -- Days since the most recent one *ended*. Null if you have never logged one.
  days_since       int,
  -- The best stretch you have had. Worth knowing on a bad day.
  longest_peace    int,
  -- How long they usually last, in days. 0 means same-day, which is the
  -- number most couples are quietly proud of.
  avg_days         numeric,
  fastest_makeup   int,
  fights_month     int,
  fights_year      int,
  -- Dates you actually went on in the same windows. The comparison is the
  -- feature: one of these numbers alone says nothing about a month.
  dates_month      int,
  dates_year       int
)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select * from public.fights where couple_id = public.current_couple_id()
  ),
  closed as (
    select * from mine where resolved_on is not null
  ),
  -- The gap between each argument ending and the next one starting. The first
  -- one has nothing before it, so it has no gap.
  gaps as (
    select (f.started_on - lag(f.resolved_on) over (order by f.started_on))::int as days
    from closed f
  ),
  dates as (
    select p.done_at
    from public.date_picks p
    where p.couple_id = public.current_couple_id() and p.done_at is not null
  )
  select
    (select count(*)::int from mine),
    (select id from mine where resolved_on is null),
    (select started_on from mine where resolved_on is null),
    (select (current_date - started_on)::int from mine where resolved_on is null),
    -- Only meaningful when nothing is currently open; the screen shows the
    -- open one instead in that case.
    (select (current_date - max(resolved_on))::int from closed),
    (select max(days) from gaps),
    (select round(avg((resolved_on - started_on))::numeric, 1) from closed),
    (select min((resolved_on - started_on))::int from closed),
    (select count(*)::int from mine
      where started_on >= date_trunc('month', current_date)::date),
    (select count(*)::int from mine
      where started_on >= date_trunc('year', current_date)::date),
    (select count(*)::int from dates
      where done_at >= date_trunc('month', current_date)),
    (select count(*)::int from dates
      where done_at >= date_trunc('year', current_date));
$$;

grant execute on function public.fight_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- logging one
-- ---------------------------------------------------------------------------

-- Opening one while another is open closes the old one first, dated today.
-- The alternative is the unique index raising at exactly the moment somebody
-- is least able to deal with an error message.
create or replace function public.log_fight(
  about      text default null,
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

  update public.fights
  set resolved_on = current_date
  where couple_id = cid and resolved_on is null;

  insert into public.fights (couple_id, logged_by, started_on, what_about)
  values (
    cid, auth.uid(),
    coalesce(on_date, current_date),
    nullif(trim(coalesce(about, '')), '')
  )
  returning id into made;

  return made;
end;
$$;

-- Making up. `helped` is the field worth filling in, so the screen asks for it
-- here rather than burying it in an edit form nobody opens.
create or replace function public.resolve_fight(
  fight   uuid,
  helped  text default null,
  on_date date default null
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  f   public.fights;
begin
  select * into f from public.fights where id = fight and couple_id = cid;
  if not found then
    raise exception 'No such entry';
  end if;

  update public.fights
  set resolved_on = greatest(coalesce(on_date, current_date), f.started_on),
      what_helped = coalesce(nullif(trim(coalesce(helped, '')), ''), what_helped)
  where id = fight;
end;
$$;

grant execute on function public.log_fight(text, date) to authenticated;
grant execute on function public.resolve_fight(uuid, text, date) to authenticated;

-- Deliberately no push trigger. "They logged an argument" arriving on a locked
-- phone mid-argument would make everything worse, and "you made up" is
-- something you already know.
