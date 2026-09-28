-- ============================================================================
-- 0049_fixes.sql — three things wrong with 0046–0048
-- ============================================================================
-- Found by re-reading rather than by running, so none of these have bitten
-- yet. All three are the same class of mistake: a name that means one thing to
-- plpgsql and another to SQL.

-- ---------------------------------------------------------------------------
-- 1. "column reference idx is ambiguous"
-- ---------------------------------------------------------------------------
-- `current_game_round` returns a table with a column called `idx`, which makes
-- `idx` a variable inside the body. The fallback that finds the last round —
-- `order by idx desc` — is unqualified, so Postgres cannot tell whether it
-- means the column or the OUT parameter, and every finished game would have
-- raised on the final read. Qualified, plus `use_column` so the next edit to
-- this function doesn't have to remember.

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
#variable_conflict use_column
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
    select r.*, p.body as prompt_body, p.option_a as opt_a, p.option_b as opt_b
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
      r.id as round_id,
      case
        when g.mode in ('match', 'guess') then (
          select count(*) = 2 and count(distinct lower(trim(a.value))) = 1
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
    r.prompt_body,
    r.opt_a,
    r.opt_b,
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
       from marks m where m.round_id = r.id),
    (select m.hit from marks m where m.round_id = r.id),
    cur is null,
    (select count(*)::int from marks m where m.hit),
    (select count(*)::int from marks m where m.hit is not null and m.answers >= 2)
  from rounds r
  where r.id = coalesce(cur, (select rr.id from rounds rr order by rr.idx desc limit 1));
end;
$$;

grant execute on function public.current_game_round(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. a parameter called `exclude`
-- ---------------------------------------------------------------------------
-- EXCLUDE is SQL keyword — window frames and exclusion constraints both use
-- it. It happened to parse as a parameter name, but it is a trap sitting in a
-- function that will be edited again. Renamed to `skip_ids`, which also reads
-- better at the call site.

drop function if exists public.pick_date(text, boolean, int, text, uuid[], boolean);

create or replace function public.pick_date(
  max_budget  text default 'splash',
  want_indoor boolean default null,
  max_minutes int default 600,
  want_vibe   text default null,
  -- Ideas already turned down this sitting. Not persisted: "not tonight" is
  -- about tonight, and the same idea should be back next Friday.
  skip_ids    uuid[] default '{}',
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
  bucket_id uuid
)
language plpgsql
volatile
security definer
set search_path = public
as $$
#variable_conflict use_column
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
    select b.id, b.title, '✨'::text, max_budget, want_indoor, max_minutes,
           want_vibe, null::uuid, b.id
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
-- 3. 0047 duplicates itself
-- ---------------------------------------------------------------------------
-- `game_prompts` has no unique constraint on its words, so the `on conflict do
-- nothing` at the end of 0047 protects nothing and running that file twice
-- deals every prompt twice. Nothing is broken today, but the next edit to the
-- prompt list would have doubled the deck. This clears any duplicates and adds
-- the constraint that makes the guard real.

delete from public.game_prompts a
using public.game_prompts b
where a.ctid > b.ctid
  and a.game_slug = b.game_slug
  and a.body = b.body
  and a.couple_id is not distinct from b.couple_id;

create unique index if not exists game_prompts_builtin_unique
  on public.game_prompts (game_slug, body) where couple_id is null;

-- Same hazard, same fix, for the ideas the date generator deals from.
delete from public.date_ideas a
using public.date_ideas b
where a.ctid > b.ctid
  and a.title = b.title
  and a.couple_id is not distinct from b.couple_id;

create unique index if not exists date_ideas_builtin_unique
  on public.date_ideas (title) where couple_id is null;
