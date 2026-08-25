-- ============================================================================
-- 0025_chat.sql — the two of you, talking
-- ============================================================================
-- Until now the only replies in the whole app were an emoji or a preset
-- compliment. You could put a caption on a photo and they could not write back.
--
-- A message can hang off a moment (moment_id), which is how a reply under a
-- photo works: it is still one thread, not a second per-photo comment system.
-- The photo keeps flowing moment -> memory -> album exactly as before, and the
-- conversation about it lives here.

create table if not exists public.messages (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null,
  -- Set when this was sent as a reply to a photo. Nulled rather than deleted
  -- if the moment goes, so the conversation survives the picture.
  moment_id   uuid references public.moments (id) on delete set null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists messages_couple_idx
  on public.messages (couple_id, created_at desc);

-- Pulling the replies for one photo without scanning the whole thread.
create index if not exists messages_moment_idx
  on public.messages (moment_id)
  where moment_id is not null;

alter table public.messages enable row level security;

drop policy if exists messages_read on public.messages;
create policy messages_read on public.messages
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists messages_write on public.messages;
create policy messages_write on public.messages
  for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

-- Marking read is the receiver's action, so update is couple-wide. Editing
-- someone else's words is prevented by the body check below.
drop policy if exists messages_update on public.messages;
create policy messages_update on public.messages
  for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- You can always take back something you said. Only your own.
drop policy if exists messages_delete on public.messages;
create policy messages_delete on public.messages
  for delete to authenticated
  using (author_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'messages'
     )
  then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ---------------------------------------------------------------------------

create or replace function public.send_message(
  message_body text,
  about_moment uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.messages;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if nullif(trim(message_body), '') is null then
    raise exception 'Say something first.';
  end if;

  -- Guard the reference rather than trusting the client: a moment id from
  -- another couple would otherwise be readable through the join.
  if about_moment is not null and not exists (
    select 1 from public.moments m where m.id = about_moment and m.couple_id = cid
  ) then
    raise exception 'That moment is not yours.';
  end if;

  insert into public.messages (couple_id, author_id, body, moment_id)
  values (cid, auth.uid(), trim(message_body), about_moment)
  returning * into result;

  return result;
end;
$$;

create or replace function public.mark_messages_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.messages
  set read_at = now()
  where couple_id = public.current_couple_id()
    and author_id <> auth.uid()
    and read_at is null;
$$;

grant execute on function public.send_message(text, uuid) to authenticated;
grant execute on function public.mark_messages_read() to authenticated;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------

create or replace function public.on_message_push()
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
    'type', 'message',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    -- The message itself goes on the lock screen. A love note deliberately
    -- sends the title only, because it is meant to be opened and sat with;
    -- a chat message is meant to be read as it arrives.
    'message', new.body
  ));

  return new;
end;
$$;

drop trigger if exists messages_push on public.messages;
create trigger messages_push
  after insert on public.messages
  for each row execute function public.on_message_push();

-- ---------------------------------------------------------------------------
-- counts
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced, for the same reason as 0023: `create or
-- replace view` cannot reorder or insert columns, only append.
drop view if exists public.couple_stats;

create view public.couple_stats
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
  (select count(*) from public.moments mo where mo.couple_id = c.id)      as moments_sent,
  (select count(*) from public.compliments cp where cp.couple_id = c.id)  as compliments_sent,
  coalesce((select s.current_streak from public.streaks s where s.couple_id = c.id), 0) as current_streak,
  coalesce((select s.longest_streak from public.streaks s where s.couple_id = c.id), 0) as longest_streak,
  (select count(*) from public.messages ms where ms.couple_id = c.id)     as messages_sent
from public.couples c;

grant select on public.couple_stats to authenticated;

insert into public.achievement_defs (slug, name, emoji, description, metric, target, sort_order)
values
  ('first_word',   'First Word',    '💬', 'Said the first thing.',        'messages_sent',    1, 16),
  ('thousand_words', 'A Thousand Words', '📖', 'A thousand messages between you.', 'messages_sent', 1000, 90)
on conflict (slug) do update
  set name = excluded.name,
      emoji = excluded.emoji,
      description = excluded.description,
      metric = excluded.metric,
      target = excluded.target,
      sort_order = excluded.sort_order;

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
    'unread_messages', (
      select count(*) from public.messages m
      where m.couple_id = cid and m.author_id <> auth.uid() and m.read_at is null
    ),
    'latest_nudge', (
      select to_jsonb(g) from public.nudges g
      where g.couple_id = cid and g.sender_id <> auth.uid()
      order by g.created_at desc limit 1
    )
  );
end;
$$;
