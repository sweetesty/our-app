-- ============================================================================
-- 0006_rpc.sql — the calls both apps make
-- ============================================================================
-- Keeping today's-question selection server-side means the web app and the
-- Flutter app cannot drift into picking different questions for the same day,
-- and neither client needs to know the "don't repeat a question" rule.

-- Shape returned to the clients for the Today screen. Deliberately does NOT
-- include your partner's answer text unless the reveal has happened — that is
-- still enforced by RLS on daily_answers, this just saves a round trip.
create or replace function public.today_question()
returns table (
  daily_question_id uuid,
  body              text,
  category          text,
  asked_on          date,
  is_custom         boolean,
  my_answer         text,
  my_answered_at    timestamptz,
  partner_answered  boolean,
  revealed          boolean
)
language plpgsql
security definer
set search_path = public
as $$
-- This function has an OUT parameter called asked_on AND touches a column of
-- the same name in the ON CONFLICT clause below. PL/pgSQL treats the inference
-- list as an expression, sees both, and errors with "column reference is
-- ambiguous". Telling it to prefer the column resolves it; no bare identifier
-- in this function needs to resolve to a variable (cid and pick are not column
-- names anywhere it reads).
#variable_conflict use_column
declare
  cid uuid := public.current_couple_id();
  dq  public.daily_questions;
  pick uuid;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  select * into dq
  from public.daily_questions q
  where q.couple_id = cid and q.asked_on = current_date;

  -- No question for today yet: pick one this couple has not been asked before,
  -- falling back to any active question once the bank has been exhausted.
  if dq.id is null then
    select b.id into pick
    from public.question_bank b
    where b.is_active
      and not exists (
        select 1 from public.daily_questions q
        where q.couple_id = cid and q.question_id = b.id
      )
    order by random()
    limit 1;

    if pick is null then
      select b.id into pick
      from public.question_bank b
      where b.is_active
      order by random()
      limit 1;
    end if;

    insert into public.daily_questions (couple_id, question_id, asked_on)
    values (cid, pick, current_date)
    on conflict (couple_id, asked_on) do nothing;

    select * into dq
    from public.daily_questions q
    where q.couple_id = cid and q.asked_on = current_date;
  end if;

  return query
  select
    dq.id,
    coalesce(
      dq.custom_body,
      (select b.body from public.question_bank b where b.id = dq.question_id)
    ),
    coalesce(
      (select b.category from public.question_bank b where b.id = dq.question_id),
      'custom'
    ),
    dq.asked_on,
    dq.custom_body is not null,
    (select a.body from public.daily_answers a
      where a.daily_question_id = dq.id and a.author_id = auth.uid()),
    (select a.created_at from public.daily_answers a
      where a.daily_question_id = dq.id and a.author_id = auth.uid()),
    exists (select 1 from public.daily_answers a
      where a.daily_question_id = dq.id and a.author_id <> auth.uid()),
    (
      exists (select 1 from public.daily_answers a
        where a.daily_question_id = dq.id and a.author_id = auth.uid())
      and
      exists (select 1 from public.daily_answers a
        where a.daily_question_id = dq.id and a.author_id <> auth.uid())
    );
end;
$$;

-- Write (or rewrite) your answer to today's question.
create or replace function public.answer_today(answer text)
returns public.daily_answers
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  dq_id uuid;
  result public.daily_answers;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if nullif(trim(answer), '') is null then
    raise exception 'Write something first.';
  end if;

  select q.id into dq_id
  from public.daily_questions q
  where q.couple_id = cid and q.asked_on = current_date;

  if dq_id is null then
    raise exception 'No question for today yet. Open the Today screen first.';
  end if;

  insert into public.daily_answers (daily_question_id, couple_id, author_id, body)
  values (dq_id, cid, auth.uid(), trim(answer))
  on conflict (daily_question_id, author_id)
    do update set body = excluded.body, updated_at = now()
  returning * into result;

  return result;
end;
$$;

-- Replace today's question with one of your own.
create or replace function public.ask_custom_question(question text)
returns public.daily_questions
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.daily_questions;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if nullif(trim(question), '') is null then
    raise exception 'Write a question first.';
  end if;

  insert into public.daily_questions (couple_id, custom_body, asked_on)
  values (cid, trim(question), current_date)
  on conflict (couple_id, asked_on)
    do update set custom_body = excluded.custom_body, question_id = null
  returning * into result;

  return result;
end;
$$;

-- Everything the home screen needs, in one call.
create or replace function public.home_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
begin
  if cid is null then
    return jsonb_build_object('paired', false);
  end if;

  return jsonb_build_object(
    'paired', true,
    'couple', (select to_jsonb(c) from public.couples c where c.id = cid),
    'me', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'partner', (select to_jsonb(p) from public.profiles p where p.id = public.partner_id()),
    'stats', (select to_jsonb(s) from public.couple_stats s where s.couple_id = cid),
    'unopened_vault', (
      select count(*) from public.vault_items v
      where v.couple_id = cid
        and v.recipient_id = auth.uid()
        and v.unlocked_at is null
    ),
    'ready_vault', (
      select count(*) from public.vault_items v
      where v.couple_id = cid
        and v.recipient_id = auth.uid()
        and v.unlocked_at is null
        and v.unlock_type = 'date'
        and v.unlock_at <= now()
    ),
    'unread_notes', (
      select count(*) from public.love_notes n
      where n.couple_id = cid and n.author_id <> auth.uid() and n.read_at is null
    ),
    'latest_nudge', (
      select to_jsonb(g) from public.nudges g
      where g.couple_id = cid and g.sender_id <> auth.uid()
      order by g.created_at desc limit 1
    )
  );
end;
$$;

grant execute on all functions in schema public to authenticated;
