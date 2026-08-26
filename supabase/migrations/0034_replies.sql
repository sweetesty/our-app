-- ============================================================================
-- 0034_replies.sql — writing back
-- ============================================================================
-- Until now a love note and a vault letter were one-way. You could react with
-- an emoji, star it, pin it — but the one thing you actually want to do after
-- reading something someone wrote you is answer it, and there was nowhere to
-- put the answer. Chat exists, but a reply typed into chat loses the thing it
-- was replying to within the hour.
--
-- Built generically for the same reason reactions were: one table serves notes
-- and letters, and will serve whatever the next thing is.

create table if not exists public.replies (
  id           uuid primary key default gen_random_uuid(),
  couple_id    uuid not null references public.couples (id) on delete cascade,
  target_kind  text not null check (target_kind in ('note', 'vault', 'compliment')),
  target_id    uuid not null,
  author_id    uuid not null references public.profiles (id) on delete cascade,
  body         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists replies_target_idx
  on public.replies (couple_id, target_kind, target_id, created_at);

alter table public.replies enable row level security;

drop policy if exists replies_read on public.replies;
create policy replies_read on public.replies
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- No insert policy on purpose: everything goes through send_reply below, which
-- is the only place the "is this letter actually open?" rule can be enforced.
-- A plain insert policy would let a client write a reply to a sealed letter and
-- then read the couple's own words back out of it as a side channel.

drop policy if exists replies_delete on public.replies;
create policy replies_delete on public.replies
  for delete to authenticated
  using (author_id = auth.uid());

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'replies'
     )
  then
    alter publication supabase_realtime add table public.replies;
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- writing one
-- ---------------------------------------------------------------------------

/**
 * Every gate repeated by hand, because SECURITY DEFINER means RLS does not
 * apply inside: the target must belong to this couple, and a vault letter must
 * be one you wrote or one that has genuinely been opened. Replying to a sealed
 * letter would otherwise be a way to talk about a surprise before it lands.
 */
create or replace function public.send_reply(
  kind text,
  target uuid,
  body text
)
returns public.replies
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.replies;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if nullif(trim(body), '') is null then
    raise exception 'Write something first.';
  end if;

  if kind = 'note' then
    if not exists (
      select 1 from public.love_notes n where n.id = target and n.couple_id = cid
    ) then
      raise exception 'No such note.';
    end if;

    -- A note someone wrote back to is no longer a passing thought. Push the
    -- 24-hour clock out from now, so the exchange does not vanish mid
    -- conversation. Pinning is still the way to keep one for good.
    update public.love_notes
    set expires_at = now() + interval '24 hours'
    where id = target and expires_at is not null;

  elsif kind = 'vault' then
    if not exists (
      select 1 from public.vault_items v
      where v.id = target
        and v.couple_id = cid
        and (v.author_id = auth.uid() or v.unlocked_at is not null)
    ) then
      raise exception 'That letter is still sealed.';
    end if;

  elsif kind = 'compliment' then
    if not exists (
      select 1 from public.compliments c where c.id = target and c.couple_id = cid
    ) then
      raise exception 'No such compliment.';
    end if;

  else
    raise exception 'There is nothing of that kind to reply to.';
  end if;

  insert into public.replies (couple_id, target_kind, target_id, author_id, body)
  values (cid, kind, target, auth.uid(), trim(body))
  returning * into result;

  return result;
end;
$$;

grant execute on function public.send_reply(text, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- clearing up after an expired note
-- ---------------------------------------------------------------------------
-- replies has no foreign key to love_notes — it cannot, it points at four
-- different tables — so the daily sweep has to take the replies with it.
-- Without this a deleted note leaves its conversation behind forever.

create or replace function public.purge_expired_notes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  with gone as (
    delete from public.love_notes
    where expires_at is not null
      and expires_at < now() - interval '1 day'   -- grace period
    returning id
  )
  select count(*) into removed from gone;

  delete from public.replies r
  where r.target_kind = 'note'
    and not exists (select 1 from public.love_notes n where n.id = r.target_id);

  return removed;
end;
$$;

revoke execute on function public.purge_expired_notes() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------
-- The reply itself goes on the lock screen. Unlike the note it answers — which
-- deliberately sends only its title, because it is meant to be opened and sat
-- with — a reply is a message, and a message is meant to be read as it lands.

create or replace function public.on_reply_push()
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
    'type', 'reply',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    -- Which screen the notification opens.
    'kind', new.target_kind,
    'label', case new.target_kind
               when 'vault' then 'Replied to your letter'
               when 'note'  then 'Replied to your note'
               else 'Wrote back'
             end,
    'message', new.body
  ));

  return new;
end;
$$;

drop trigger if exists replies_push on public.replies;
create trigger replies_push
  after insert on public.replies
  for each row execute function public.on_reply_push();
