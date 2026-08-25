-- ============================================================================
-- 0012_moods.sql — a daily check-in on how each of you is doing
-- ============================================================================
-- Unlike the daily question, this is NOT gated. The whole point is that your
-- partner knows how you are as soon as you say it — making them answer first
-- would turn a small act of telling someone into a transaction.
--
-- One row per person per day, overwritable: moods change, and being locked
-- into "fine" at 9am when the day falls apart by 3pm would make it useless.

create table if not exists public.moods (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  mood        text not null check (mood in (
                'great', 'good', 'loved', 'calm', 'meh',
                'tired', 'anxious', 'low', 'frustrated', 'unwell', 'missing'
              )),
  note        text,
  logged_on   date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (couple_id, author_id, logged_on)
);

create index if not exists moods_couple_day_idx
  on public.moods (couple_id, logged_on desc);

drop trigger if exists moods_touch on public.moods;
create trigger moods_touch
  before update on public.moods
  for each row execute function public.touch_updated_at();

alter table public.moods enable row level security;

drop policy if exists moods_read on public.moods;
create policy moods_read on public.moods
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists moods_write on public.moods;
create policy moods_write on public.moods
  for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

drop policy if exists moods_edit on public.moods;
create policy moods_edit on public.moods
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- logging
-- ---------------------------------------------------------------------------

create or replace function public.log_mood(mood_key text, mood_note text default null)
returns public.moods
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.moods;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  insert into public.moods (couple_id, author_id, mood, note)
  values (cid, auth.uid(), mood_key, nullif(trim(mood_note), ''))
  on conflict (couple_id, author_id, logged_on) do update
    set mood = excluded.mood,
        note = excluded.note,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- Both people's moods for the last N days, for the little strip in the UI.
create or replace function public.mood_history(days integer default 7)
returns table (
  logged_on date,
  author_id uuid,
  mood text,
  note text
)
language sql
stable
security definer
set search_path = public
as $$
  select m.logged_on, m.author_id, m.mood, m.note
  from public.moods m
  where m.couple_id = public.current_couple_id()
    and m.logged_on > current_date - least(greatest(days, 1), 60)
  order by m.logged_on desc;
$$;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------
-- Fires on first log of the day and on a change, because "actually, it got
-- worse" is exactly the update worth knowing about. It does not fire when only
-- the note changes and the mood is the same, to avoid pinging on a typo fix.

create or replace function public.on_mood_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  if tg_op = 'UPDATE' and old.mood is not distinct from new.mood then
    return new;
  end if;

  select display_name into author_name
  from public.profiles where id = new.author_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'mood',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    'kind', new.mood,
    'message', new.note
  ));

  return new;
end;
$$;

drop trigger if exists moods_push on public.moods;
create trigger moods_push
  after insert or update on public.moods
  for each row execute function public.on_mood_push();

grant execute on function public.log_mood(text, text) to authenticated;
grant execute on function public.mood_history(integer) to authenticated;
