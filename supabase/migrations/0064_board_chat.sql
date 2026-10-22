-- ============================================================================
-- 0064_board_chat.sql — table talk that survives a reload, and gets through
-- ============================================================================
-- The chat drawer was a realtime broadcast and nothing else. Broadcast is a
-- pipe, not a store: if you were not on the screen at that second the message
-- simply never existed, scrolling back showed nothing, and there was no row
-- anywhere for a notification to be about. Which is why nothing arrived.
--
-- So it gets a table. Same shape as everything else here — written by the
-- couple, read by the couple, pushed to whoever was not the one typing.

create table if not exists public.board_chat (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid not null references public.couples (id) on delete cascade,
  match_id   uuid not null references public.board_matches (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  body       text not null check (length(trim(body)) > 0 and length(body) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists board_chat_match_idx
  on public.board_chat (match_id, created_at);

alter table public.board_chat enable row level security;

drop policy if exists board_chat_read on public.board_chat;
create policy board_chat_read on public.board_chat
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists board_chat_write on public.board_chat;
create policy board_chat_write on public.board_chat
  for insert to authenticated
  with check (couple_id = public.current_couple_id() and author_id = auth.uid());

-- Realtime, so it arrives while you are both looking at the board.
do $$
begin
  alter publication supabase_realtime add table public.board_chat;
exception
  when duplicate_object then null;
  when undefined_object then null;
end
$$;

-- ---------------------------------------------------------------------------
-- and on the other phone
-- ---------------------------------------------------------------------------

create or replace function public.on_board_chat_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who  text;
  game text;
begin
  select display_name into who from public.profiles where id = new.author_id;
  select m.game into game from public.board_matches m where m.id = new.match_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'table_chat',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(who, 'They'),
    'kind', game,
    'message', new.body
  ));

  return new;
end;
$$;

drop trigger if exists board_chat_push on public.board_chat;
create trigger board_chat_push
  after insert on public.board_chat
  for each row execute function public.on_board_chat_push();

-- Budgeted with the rest. Chat across a board is chat — the same tier the
-- messages screen gets, because it is the same thing in a different room.
insert into public.push_tiers (type, tier, per_hour) values
  ('table_chat', 'normal', 12)
on conflict (type) do update set tier = excluded.tier, per_hour = excluded.per_hour;
