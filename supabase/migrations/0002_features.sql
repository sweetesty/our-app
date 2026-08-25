-- ============================================================================
-- 0002_features.sql — the seven features
-- ============================================================================
-- Every table carries couple_id, even where it is technically derivable via a
-- join. It makes each RLS policy a single indexed comparison instead of a
-- correlated subquery, and it makes accidental cross-couple leakage impossible
-- rather than merely unlikely.

-- ============================================================================
-- 1. DAILY QUESTION — "Today, Us"
-- ============================================================================

create table if not exists public.question_bank (
  id         uuid primary key default gen_random_uuid(),
  body       text not null,
  category   text not null default 'general',   -- general | playful | deep | spicy
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.question_bank is
  'Shared pool of prompts, readable by everyone. Contains nothing private.';

create table if not exists public.daily_questions (
  id            uuid primary key default gen_random_uuid(),
  couple_id     uuid not null references public.couples (id) on delete cascade,
  question_id   uuid references public.question_bank (id) on delete set null,
  custom_body   text,                            -- set when one of you writes your own
  asked_on      date not null default current_date,
  created_at    timestamptz not null default now(),
  unique (couple_id, asked_on),
  constraint daily_question_has_a_body
    check (question_id is not null or nullif(trim(custom_body), '') is not null)
);

create index if not exists daily_questions_couple_date_idx
  on public.daily_questions (couple_id, asked_on desc);

create table if not exists public.daily_answers (
  id                  uuid primary key default gen_random_uuid(),
  daily_question_id   uuid not null references public.daily_questions (id) on delete cascade,
  couple_id           uuid not null references public.couples (id) on delete cascade,
  author_id           uuid not null references public.profiles (id) on delete cascade,
  body                text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (daily_question_id, author_id)
);

create index if not exists daily_answers_question_idx
  on public.daily_answers (daily_question_id);

drop trigger if exists daily_answers_touch on public.daily_answers;
create trigger daily_answers_touch
  before update on public.daily_answers
  for each row execute function public.touch_updated_at();

-- The reveal rule lives here, not in the UI. You may read your partner's answer
-- only once you have written your own. SECURITY DEFINER because a policy on
-- daily_answers cannot subquery daily_answers without recursing.
create or replace function public.has_answered(dq_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.daily_answers a
    where a.daily_question_id = dq_id and a.author_id = auth.uid()
  );
$$;

-- ============================================================================
-- 2. CARD GAME — custom decks
-- ============================================================================

create table if not exists public.card_decks (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid references public.couples (id) on delete cascade,  -- null = built-in
  slug        text not null,
  name        text not null,
  emoji       text not null default '🃏',
  description text,
  accent      text not null default '#B98AC9',  -- drives the card gradient in both apps
  sort_order  int  not null default 100,
  created_at  timestamptz not null default now()
);

-- Built-ins are unique by slug globally; a couple's own decks are unique per couple.
create unique index if not exists card_decks_builtin_slug_idx
  on public.card_decks (slug) where couple_id is null;
create unique index if not exists card_decks_couple_slug_idx
  on public.card_decks (couple_id, slug) where couple_id is not null;

create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  deck_id     uuid not null references public.card_decks (id) on delete cascade,
  couple_id   uuid references public.couples (id) on delete cascade,  -- null = built-in
  body        text not null,
  kind        text not null default 'question' check (kind in ('question', 'dare')),
  created_by  uuid references public.profiles (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists cards_deck_idx on public.cards (deck_id) where is_active;

create table if not exists public.card_plays (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  card_id     uuid not null references public.cards (id) on delete cascade,
  played_by   uuid not null references public.profiles (id) on delete cascade,
  response    text,
  completed   boolean not null default false,
  played_at   timestamptz not null default now()
);

create index if not exists card_plays_couple_idx
  on public.card_plays (couple_id, played_at desc);

-- Deal a card the two of you have not seen recently, from one deck.
create or replace function public.draw_card(target_deck uuid)
returns public.cards
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.cards c
  where c.deck_id = target_deck
    and c.is_active
    and (c.couple_id is null or c.couple_id = public.current_couple_id())
    and not exists (
      select 1 from public.card_plays p
      where p.card_id = c.id
        and p.couple_id = public.current_couple_id()
    )
  order by random()
  limit 1;
$$;

-- ============================================================================
-- 3. PINNED LOVE NOTES
-- ============================================================================

create table if not exists public.love_notes (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  title       text,
  body        text not null,
  mood        text not null default 'sweet'
              check (mood in ('sweet', 'sorry', 'proud', 'hard_day', 'anniversary', 'random')),
  is_pinned   boolean not null default false,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists love_notes_couple_idx
  on public.love_notes (couple_id, is_pinned desc, created_at desc);

drop trigger if exists love_notes_touch on public.love_notes;
create trigger love_notes_touch
  before update on public.love_notes
  for each row execute function public.touch_updated_at();

-- ============================================================================
-- 4. TIMELINE
-- ============================================================================

create table if not exists public.milestones (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  title        text not null,
  description  text,
  happened_on  date not null,
  icon         text not null default '💫',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists milestones_couple_date_idx
  on public.milestones (couple_id, happened_on);

drop trigger if exists milestones_touch on public.milestones;
create trigger milestones_touch
  before update on public.milestones
  for each row execute function public.touch_updated_at();

create table if not exists public.milestone_media (
  id            uuid primary key default gen_random_uuid(),
  milestone_id  uuid not null references public.milestones (id) on delete cascade,
  couple_id     uuid not null references public.couples (id) on delete cascade,
  storage_path  text not null,                 -- couple-media/<couple_id>/...
  media_type    text not null check (media_type in ('photo', 'voice', 'video')),
  caption       text,
  created_at    timestamptz not null default now()
);

create index if not exists milestone_media_milestone_idx
  on public.milestone_media (milestone_id);

-- ============================================================================
-- 5. SECRET VAULT
-- ============================================================================
-- Split across two tables on purpose. `vault_items` holds only the teaser —
-- the label, who it is for, when it opens. `vault_contents` holds the letter,
-- and its RLS refuses to return a row until the item is genuinely unlocked.
-- Peeking would mean bypassing Postgres, not bypassing the UI.

create table if not exists public.vault_items (
  id                uuid primary key default gen_random_uuid(),
  couple_id         uuid not null references public.couples (id) on delete cascade,
  author_id         uuid not null references public.profiles (id) on delete cascade,
  recipient_id      uuid not null references public.profiles (id) on delete cascade,
  label             text not null,             -- "Open on your birthday"
  unlock_type       text not null default 'date' check (unlock_type in ('date', 'condition')),
  unlock_at         timestamptz,               -- for unlock_type = 'date'
  unlock_condition  text,                      -- for unlock_type = 'condition'
  unlocked_at       timestamptz,               -- set when the recipient opens it
  created_at        timestamptz not null default now(),
  constraint vault_unlock_rule check (
    (unlock_type = 'date'      and unlock_at is not null) or
    (unlock_type = 'condition' and nullif(trim(unlock_condition), '') is not null)
  )
);

create index if not exists vault_items_couple_idx
  on public.vault_items (couple_id, created_at desc);

create table if not exists public.vault_contents (
  item_id      uuid primary key references public.vault_items (id) on delete cascade,
  body         text,
  media_path   text,
  media_type   text check (media_type in ('photo', 'voice', 'video')),
  created_at   timestamptz not null default now()
);

create or replace function public.vault_is_unlocked(item uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    v.unlocked_at is not null
      or (v.unlock_type = 'date' and v.unlock_at <= now()),
    false
  )
  from public.vault_items v
  where v.id = item;
$$;

-- The recipient opening a condition-locked item ("open when you miss me").
create or replace function public.unlock_vault_item(item uuid)
returns public.vault_items
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.vault_items;
begin
  select * into target from public.vault_items v where v.id = item;

  if target.id is null or target.couple_id is distinct from public.current_couple_id() then
    raise exception 'No such item.';
  end if;

  if target.recipient_id <> auth.uid() then
    raise exception 'This one is not yours to open.';
  end if;

  if target.unlock_type = 'date' and target.unlock_at > now() then
    raise exception 'Not yet. This opens later.';
  end if;

  update public.vault_items
     set unlocked_at = coalesce(unlocked_at, now())
   where id = item
   returning * into target;

  return target;
end;
$$;

-- ============================================================================
-- 6. NUDGES — the "I miss you" button and its friends
-- ============================================================================

create table if not exists public.nudges (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  sender_id   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null check (kind in (
                'miss_you', 'thinking_of_you', 'need_you',
                'kiss', 'annoying', 'proud'
              )),
  message     text,
  seen_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists nudges_couple_idx
  on public.nudges (couple_id, created_at desc);

-- Realtime delivery. Both clients subscribe to `nudges` (the banner) and to
-- `daily_answers` (so the seal breaks live the moment the second answer lands).
-- Wrapped because adding a table that is already a member raises, which would
-- make re-running this migration fail.
do $$
declare
  t text;
begin
  foreach t in array array['nudges', 'daily_answers'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
exception
  when undefined_object then
    -- No supabase_realtime publication (e.g. plain Postgres). Realtime is a
    -- nicety here; every screen still works on pull-to-refresh.
    raise notice 'supabase_realtime publication not found, skipping realtime setup';
end
$$;

-- ============================================================================
-- 7. STREAKS + ACHIEVEMENTS
-- ============================================================================

create table if not exists public.streaks (
  couple_id       uuid primary key references public.couples (id) on delete cascade,
  current_streak  int not null default 0,
  longest_streak  int not null default 0,
  last_answered_on date,
  updated_at      timestamptz not null default now()
);

-- A day counts once BOTH of you have answered. A streak you can extend alone
-- is not a couple streak.
create or replace function public.bump_streak()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  q_date date;
  answer_count int;
  s public.streaks;
  next_current int;
begin
  select asked_on into q_date
  from public.daily_questions where id = new.daily_question_id;

  select count(*) into answer_count
  from public.daily_answers where daily_question_id = new.daily_question_id;

  if answer_count < 2 then
    return new;
  end if;

  insert into public.streaks (couple_id) values (new.couple_id)
  on conflict (couple_id) do nothing;

  select * into s from public.streaks where couple_id = new.couple_id;

  if s.last_answered_on = q_date then
    return new;                                   -- already counted today
  elsif s.last_answered_on = q_date - 1 then
    next_current := s.current_streak + 1;         -- consecutive day
  else
    next_current := 1;                            -- fresh start
  end if;

  update public.streaks
     set current_streak   = next_current,
         longest_streak   = greatest(longest_streak, next_current),
         last_answered_on = q_date,
         updated_at       = now()
   where couple_id = new.couple_id;

  return new;
end;
$$;

drop trigger if exists daily_answers_bump_streak on public.daily_answers;
create trigger daily_answers_bump_streak
  after insert on public.daily_answers
  for each row execute function public.bump_streak();

create table if not exists public.achievement_defs (
  slug        text primary key,
  name        text not null,
  emoji       text not null,
  description text not null,
  metric      text not null,        -- matches a column name in couple_stats
  target      int  not null,
  sort_order  int  not null default 100
);

create table if not exists public.achievements (
  couple_id   uuid not null references public.couples (id) on delete cascade,
  slug        text not null references public.achievement_defs (slug) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (couple_id, slug)
);

-- One row per couple, holding every number the achievements screen needs.
create or replace view public.couple_stats
with (security_invoker = true) as
select
  c.id as couple_id,
  (select count(*) from public.daily_answers a where a.couple_id = c.id)  as answers_given,
  (select count(*) from public.love_notes n where n.couple_id = c.id)     as notes_written,
  (select count(*) from public.card_plays p where p.couple_id = c.id)     as cards_played,
  (select count(*) from public.milestones m where m.couple_id = c.id)     as memories_added,
  (select count(*) from public.vault_items v where v.couple_id = c.id)    as vault_items,
  (select count(*) from public.nudges g where g.couple_id = c.id)         as nudges_sent,
  (select count(*) from public.card_plays p
     join public.cards cd on cd.id = p.card_id
     join public.card_decks d on d.id = cd.deck_id
    where p.couple_id = c.id and d.slug = 'spicy')                        as spicy_played,
  coalesce((select s.current_streak from public.streaks s where s.couple_id = c.id), 0) as current_streak,
  coalesce((select s.longest_streak from public.streaks s where s.couple_id = c.id), 0) as longest_streak
from public.couples c;

-- Called after any action that could move a counter. Idempotent.
create or replace function public.sync_achievements()
returns setof public.achievements
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  stats public.couple_stats;
  def public.achievement_defs;
  value int;
begin
  if cid is null then
    return;
  end if;

  select * into stats from public.couple_stats where couple_id = cid;

  for def in select * from public.achievement_defs loop
    execute format('select ($1).%I::int', def.metric) into value using stats;

    if value >= def.target then
      insert into public.achievements (couple_id, slug)
      values (cid, def.slug)
      on conflict do nothing;
    end if;
  end loop;

  return query select * from public.achievements a where a.couple_id = cid;
end;
$$;
