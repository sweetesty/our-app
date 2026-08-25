-- ============================================================================
-- 0019_compliments.sql — say the nice thing out loud
-- ============================================================================
-- Nudges are signals ("I miss you"). A compliment is about them rather than
-- about how you feel, which is a different thing worth its own place — and the
-- kind of sentence people think and never actually say.

create table if not exists public.compliments (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  kind        text not null default 'custom',
  emoji       text not null default '💕',
  body        text not null,
  seen_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists compliments_couple_idx
  on public.compliments (couple_id, created_at desc);

alter table public.compliments enable row level security;

drop policy if exists compliments_read on public.compliments;
create policy compliments_read on public.compliments
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists compliments_write on public.compliments;
create policy compliments_write on public.compliments
  for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

-- Marking one seen is the receiver's action, so update is couple-wide.
drop policy if exists compliments_seen on public.compliments;
create policy compliments_seen on public.compliments
  for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

alter publication supabase_realtime add table public.compliments;

-- Reactions already cover five target kinds; add this one.
alter table public.reactions drop constraint if exists reactions_target_kind_check;
alter table public.reactions
  add constraint reactions_target_kind_check check (target_kind in (
    'moment', 'note', 'card_play', 'milestone', 'answer', 'compliment'
  ));

-- ---------------------------------------------------------------------------

create or replace function public.send_compliment(
  compliment_kind text,
  compliment_body text,
  compliment_emoji text default '💕'
)
returns public.compliments
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.compliments;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if nullif(trim(compliment_body), '') is null then
    raise exception 'Say something first.';
  end if;

  insert into public.compliments (couple_id, author_id, kind, emoji, body)
  values (cid, auth.uid(), compliment_kind, compliment_emoji, trim(compliment_body))
  returning * into result;

  return result;
end;
$$;

create or replace function public.mark_compliments_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.compliments
  set seen_at = now()
  where couple_id = public.current_couple_id()
    and author_id <> auth.uid()
    and seen_at is null;
$$;

grant execute on function public.send_compliment(text, text, text) to authenticated;
grant execute on function public.mark_compliments_seen() to authenticated;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------

create or replace function public.on_compliment_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  select display_name into author_name
  from public.profiles where id = new.author_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'compliment',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    'kind', new.emoji,
    -- The whole compliment goes in the body. Unlike a love note, this is meant
    -- to be read on the spot — that is the entire point of it.
    'message', new.body
  ));

  return new;
end;
$$;

drop trigger if exists compliments_push on public.compliments;
create trigger compliments_push
  after insert on public.compliments
  for each row execute function public.on_compliment_push();

-- ---------------------------------------------------------------------------
-- surface the unread count on the home screen
-- ---------------------------------------------------------------------------

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
      where v.couple_id = cid and v.recipient_id = auth.uid() and v.unlocked_at is null
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
    'unread_compliments', (
      select count(*) from public.compliments c
      where c.couple_id = cid and c.author_id <> auth.uid() and c.seen_at is null
    ),
    'latest_nudge', (
      select to_jsonb(g) from public.nudges g
      where g.couple_id = cid and g.sender_id <> auth.uid()
      order by g.created_at desc limit 1
    )
  );
end;
$$;
