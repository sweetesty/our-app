-- ============================================================================
-- 0007_push.sql — device tokens and the trigger that fires a push
-- ============================================================================
-- A nudge is only worth having if it reaches a locked phone. This adds:
--   * device_tokens        — one row per installed app, per person
--   * private.push_config  — where to reach the Edge Function (one row, yours)
--   * triggers on nudges and daily_answers that call it
--
-- Nothing here talks to Firebase directly. Postgres just posts the event to an
-- Edge Function, which owns the credentials.

create extension if not exists pg_net with schema extensions;

-- ---------------------------------------------------------------------------
-- device tokens
-- ---------------------------------------------------------------------------

create table if not exists public.device_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  couple_id     uuid references public.couples (id) on delete set null,
  token         text not null unique,
  platform      text not null check (platform in ('android', 'ios', 'web')),
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now()
);

create index if not exists device_tokens_user_idx on public.device_tokens (user_id);

alter table public.device_tokens enable row level security;

-- You can only ever see or touch your own devices — not your partner's.
-- The Edge Function reads them with the service role, which bypasses this.
drop policy if exists device_tokens_own on public.device_tokens;
create policy device_tokens_own on public.device_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Called by the app every launch. FCM rotates tokens, and the same token can
-- move between accounts when someone signs out and back in, so the conflict
-- target is the token itself.
create or replace function public.register_device_token(
  device_token text,
  device_platform text
)
returns public.device_tokens
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.device_tokens;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  insert into public.device_tokens (user_id, couple_id, token, platform)
  values (auth.uid(), public.current_couple_id(), device_token, device_platform)
  on conflict (token) do update
    set user_id      = excluded.user_id,
        couple_id    = excluded.couple_id,
        platform     = excluded.platform,
        last_seen_at = now()
  returning * into result;

  return result;
end;
$$;

-- On sign-out, so a shared phone stops receiving someone else's nudges.
create or replace function public.unregister_device_token(device_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.device_tokens
  where token = device_token and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- where to reach the Edge Function
-- ---------------------------------------------------------------------------
-- Kept in a private schema rather than the dashboard so the whole setup lives
-- in migrations. The service role key sits here, so nothing but SECURITY
-- DEFINER functions may read it.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.push_config (
  id                serial primary key,
  function_url      text not null,   -- https://<ref>.supabase.co/functions/v1/send-push
  service_role_key  text not null,
  enabled           boolean not null default true
);

revoke all on private.push_config from public, anon, authenticated;

comment on table private.push_config is
  'Fill in one row after deploying the send-push Edge Function. See README.';

-- ---------------------------------------------------------------------------
-- the trigger
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_push(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg private.push_config;
begin
  select * into cfg from private.push_config where enabled limit 1;

  -- Not configured yet: stay quiet. A missing push must never be able to roll
  -- back the write that triggered it.
  if cfg.function_url is null then
    return;
  end if;

  perform net.http_post(
    url     := cfg.function_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || cfg.service_role_key
               ),
    body    := payload,
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- Same reasoning: the nudge is already saved and will still arrive over
    -- realtime if the app is open. Never fail the transaction over a push.
    raise warning 'push dispatch failed: %', sqlerrm;
end;
$$;

create or replace function public.on_nudge_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin
  select display_name into sender_name
  from public.profiles where id = new.sender_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'nudge',
    'couple_id', new.couple_id,
    'sender_id', new.sender_id,
    'sender_name', coalesce(sender_name, 'They'),
    'kind', new.kind,
    'message', new.message
  ));

  return new;
end;
$$;

drop trigger if exists nudges_push on public.nudges;
create trigger nudges_push
  after insert on public.nudges
  for each row execute function public.on_nudge_push();

-- "They answered — your turn." Only fires for the first of the two answers;
-- once both are in, the reveal happens in-app and a push would be noise.
create or replace function public.on_answer_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  answer_count int;
  author_name text;
begin
  select count(*) into answer_count
  from public.daily_answers where daily_question_id = new.daily_question_id;

  if answer_count <> 1 then
    return new;
  end if;

  select display_name into author_name
  from public.profiles where id = new.author_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'answer',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They')
  ));

  return new;
end;
$$;

drop trigger if exists daily_answers_push on public.daily_answers;
create trigger daily_answers_push
  after insert on public.daily_answers
  for each row execute function public.on_answer_push();

grant execute on function public.register_device_token(text, text) to authenticated;
grant execute on function public.unregister_device_token(text) to authenticated;
