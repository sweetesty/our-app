-- ============================================================================
-- 0046_games.sql — the games, under Cards
-- ============================================================================
-- Twelve games, but not twelve implementations. Underneath, nearly all of them
-- are one of three things:
--
--   'match' — you're both given the same two options and you each pick one.
--             The point is whether you picked the same. Would You Rather,
--             This or That, Couple Hot Takes.
--
--   'guess' — one of you answers honestly about yourself, the other guesses
--             what they said, and then both are shown. Who Knows Who Better,
--             Guess My Answer, Finish My Sentence, How Well Do You Remember,
--             Couple Trivia.
--
--   'draw'  — there is nothing to score. A prompt comes out, you do it, you
--             move on. Truth or Dare, 20 Questions.
--
-- A round is one prompt within one session. Scoring is derived, never stored:
-- a 'match' round scores when the two picks are equal, a 'guess' round when
-- the guess equals the truth. Storing a score would let it drift from the
-- answers that produced it.
--
-- Deliberately playful rather than competitive: there is no running total
-- across sessions and no leaderboard. You get "8 out of 10" at the end of a
-- game and then it's gone.

-- ---------------------------------------------------------------------------
-- the games themselves
-- ---------------------------------------------------------------------------

create table if not exists public.games (
  slug        text primary key,
  name        text not null,
  emoji       text not null,
  tagline     text not null,
  mode        text not null check (mode in ('match', 'guess', 'draw')),
  -- How many prompts a session deals before it's over.
  rounds      int not null default 10,
  sort_order  int not null default 100,
  is_active   boolean not null default true
);

create table if not exists public.game_prompts (
  id          uuid primary key default gen_random_uuid(),
  -- Null is built-in; set means the two of you wrote it.
  couple_id   uuid references public.couples (id) on delete cascade,
  game_slug   text not null references public.games (slug) on delete cascade,
  body        text not null,
  -- 'match' games need exactly two; the others leave it null.
  option_a    text,
  option_b    text,
  created_by  uuid references public.profiles (id) on delete set null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists game_prompts_game_idx
  on public.game_prompts (game_slug) where is_active;

-- ---------------------------------------------------------------------------
-- a sitting
-- ---------------------------------------------------------------------------

create table if not exists public.game_sessions (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  game_slug   text not null references public.games (slug) on delete cascade,
  started_by  uuid references public.profiles (id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

-- One unfinished sitting per game per couple, so you both land in the same one.
create unique index if not exists game_sessions_open_idx
  on public.game_sessions (couple_id, game_slug) where finished_at is null;

create table if not exists public.game_rounds (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.game_sessions (id) on delete cascade,
  prompt_id   uuid not null references public.game_prompts (id) on delete cascade,
  idx         int not null,
  -- 'guess' rounds only: whose answer is the truth this round. It alternates,
  -- so you each get asked about yourself half the time.
  subject_id  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create unique index if not exists game_rounds_idx
  on public.game_rounds (session_id, idx);

create table if not exists public.game_answers (
  round_id  uuid not null references public.game_rounds (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  value     text not null,
  answered_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

alter table public.games         enable row level security;
alter table public.game_prompts  enable row level security;
alter table public.game_sessions enable row level security;
alter table public.game_rounds   enable row level security;
alter table public.game_answers  enable row level security;

drop policy if exists games_read on public.games;
create policy games_read on public.games for select to authenticated using (true);

drop policy if exists game_prompts_read on public.game_prompts;
create policy game_prompts_read on public.game_prompts
  for select to authenticated
  using (couple_id is null or couple_id = public.current_couple_id());

drop policy if exists game_prompts_write on public.game_prompts;
create policy game_prompts_write on public.game_prompts
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists game_sessions_all on public.game_sessions;
create policy game_sessions_all on public.game_sessions
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists game_rounds_all on public.game_rounds;
create policy game_rounds_all on public.game_rounds
  for all to authenticated
  using (exists (
    select 1 from public.game_sessions s
    where s.id = session_id and s.couple_id = public.current_couple_id()
  ));

-- Answers are readable by the couple; the *withholding* happens in
-- current_game_round(), which is the only thing the screen reads.
drop policy if exists game_answers_all on public.game_answers;
create policy game_answers_all on public.game_answers
  for all to authenticated
  using (exists (
    select 1 from public.game_rounds r
    join public.game_sessions s on s.id = r.session_id
    where r.id = round_id and s.couple_id = public.current_couple_id()
  ))
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- playing
-- ---------------------------------------------------------------------------

-- Start a game, or rejoin the one already open. Deals the whole set of rounds
-- up front so you're both looking at the same prompts in the same order.
create or replace function public.start_game(game text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid      uuid := public.current_couple_id();
  existing uuid;
  fresh    uuid;
  g        public.games;
  me       uuid := auth.uid();
  them     uuid := public.partner_id();
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  select id into existing from public.game_sessions
  where couple_id = cid and game_slug = game and finished_at is null;

  if existing is not null then
    return existing;
  end if;

  select * into g from public.games where slug = game;
  if not found then
    raise exception 'No such game';
  end if;

  insert into public.game_sessions (couple_id, game_slug, started_by)
  values (cid, game, me)
  returning id into fresh;

  insert into public.game_rounds (session_id, prompt_id, idx, subject_id)
  select
    fresh,
    p.id,
    row_number() over ()::int,
    -- Alternating subject, so neither of you spends the whole game guessing.
    case when g.mode = 'guess'
      then case when row_number() over () % 2 = 1 then me else coalesce(them, me) end
    end
  from (
    select p.id
    from public.game_prompts p
    where p.game_slug = game
      and p.is_active
      and (p.couple_id is null or p.couple_id = cid)
    order by random()
    limit g.rounds
  ) p;

  return fresh;
end;
$$;

-- The round you're on, with the reveal applied.
--
-- Same rule as the daily question and the card deck: you cannot see what they
-- said until you have said yours. Enforced here, in the query, rather than in
-- the screen — otherwise "who knows who better" is decided by who is willing
-- to look.
create or replace function public.current_game_round(session uuid)
returns table (
  round_id     uuid,
  idx          int,
  total        int,
  mode         text,
  body         text,
  option_a     text,
  option_b     text,
  subject_id   uuid,
  subject_name text,
  i_am_subject boolean,
  my_answer    text,
  their_answer text,
  revealed     boolean,
  correct      boolean,
  finished     boolean,
  score        int,
  scored       int
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  me  uuid := auth.uid();
  sess public.game_sessions;
  g    public.games;
  cur  uuid;
begin
  select * into sess from public.game_sessions
  where id = session and couple_id = cid;
  if not found then
    return;
  end if;

  select * into g from public.games where slug = sess.game_slug;

  -- The first round where somebody still owes an answer. A 'draw' game needs
  -- only one of you to move it on; the others need both.
  select r.id into cur
  from public.game_rounds r
  where r.session_id = session
    and (
      case when g.mode = 'draw'
        then not exists (select 1 from public.game_answers a where a.round_id = r.id)
        else (select count(*) from public.game_answers a where a.round_id = r.id) < 2
      end
    )
  order by r.idx
  limit 1;

  return query
  with rounds as (
    select r.*, p.body, p.option_a, p.option_b
    from public.game_rounds r
    join public.game_prompts p on p.id = r.prompt_id
    where r.session_id = session
  ),
  -- Scoring, derived rather than stored. A 'match' round is won when you both
  -- picked the same; a 'guess' round when the guess matches the subject's own
  -- answer. Compared case-insensitively and trimmed, because "Pizza" and
  -- "pizza " are the same answer and nobody should lose a point to whitespace.
  marks as (
    select
      r.id,
      case
        when g.mode = 'match' then (
          select count(distinct lower(trim(a.value))) = 1
             and count(*) = 2
          from public.game_answers a where a.round_id = r.id
        )
        when g.mode = 'guess' then (
          select count(*) = 2
             and count(distinct lower(trim(a.value))) = 1
          from public.game_answers a where a.round_id = r.id
        )
        else null
      end as hit,
      (select count(*) from public.game_answers a where a.round_id = r.id) as answers
    from rounds r
  )
  select
    r.id,
    r.idx,
    (select count(*)::int from rounds),
    g.mode,
    r.body,
    r.option_a,
    r.option_b,
    r.subject_id,
    (select pr.display_name from public.profiles pr where pr.id = r.subject_id),
    r.subject_id = me,
    (select a.value from public.game_answers a where a.round_id = r.id and a.user_id = me),
    -- Withheld until yours is in. This is the whole game.
    case when exists (
      select 1 from public.game_answers a where a.round_id = r.id and a.user_id = me
    ) then (
      select a.value from public.game_answers a
      where a.round_id = r.id and a.user_id <> me limit 1
    ) end,
    (select m.answers >= case when g.mode = 'draw' then 1 else 2 end
       from marks m where m.id = r.id),
    (select m.hit from marks m where m.id = r.id),
    cur is null,
    -- Running score: rounds won so far, and how many have been scored at all.
    (select count(*)::int from marks m where m.hit),
    (select count(*)::int from marks m where m.hit is not null and m.answers >= 2)
  from rounds r
  where r.id = coalesce(cur, (select id from rounds order by idx desc limit 1));
end;
$$;

-- Your answer for this round. Writing again replaces it — you have not seen
-- theirs, so there is nothing to game.
create or replace function public.answer_game(round uuid, value text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_variable
begin
  if nullif(trim(coalesce(value, '')), '') is null then
    raise exception 'Say something';
  end if;

  if not exists (
    select 1 from public.game_rounds r
    join public.game_sessions s on s.id = r.session_id
    where r.id = round and s.couple_id = public.current_couple_id()
      and s.finished_at is null
  ) then
    raise exception 'That round is over';
  end if;

  insert into public.game_answers (round_id, user_id, value)
  values (round, auth.uid(), trim(value))
  on conflict (round_id, user_id) do update
    set value = excluded.value, answered_at = now();
end;
$$;

-- Close it. Either of you can, at any point — "we'll finish it later" is not
-- a thing anybody does with a party game.
create or replace function public.end_game(session uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.game_sessions
  set finished_at = now()
  where id = session and couple_id = public.current_couple_id()
    and finished_at is null;
$$;

grant execute on function public.start_game(text) to authenticated;
grant execute on function public.current_game_round(uuid) to authenticated;
grant execute on function public.answer_game(uuid, text) to authenticated;
grant execute on function public.end_game(uuid) to authenticated;
