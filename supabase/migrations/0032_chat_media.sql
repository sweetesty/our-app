-- ============================================================================
-- 0032_chat_media.sql — voice, photos, replies, reactions and pins in chat
-- ============================================================================
-- Chat shipped as text only, while voice notes already existed in Cards, the
-- Timeline and the Vault. Same bucket, same signed URLs — the only thing
-- missing was somewhere to put the path.
--
-- No GIF search: every one of those is a third-party API, which would mean
-- sending what the two of you are talking about to Giphy or Tenor on every
-- keystroke. For an app whose whole premise is that nobody else is watching,
-- that is the wrong trade. Short emoji messages render large instead, which is
-- what a sticker is for anyway.

alter table public.messages
  add column if not exists media_path text,
  add column if not exists media_type text
    check (media_type is null or media_type in ('photo', 'voice', 'video')),
  -- Quoting another message. Nulled rather than deleted with it, so a reply
  -- survives the thing it answered being taken back.
  add column if not exists reply_to uuid references public.messages (id) on delete set null,
  add column if not exists is_pinned boolean not null default false;

-- A message can now be media with no words at all.
alter table public.messages
  alter column body drop not null;

alter table public.messages
  drop constraint if exists messages_has_content;
alter table public.messages
  add constraint messages_has_content check (
    nullif(trim(coalesce(body, '')), '') is not null or media_path is not null
  );

create index if not exists messages_pinned_idx
  on public.messages (couple_id, created_at desc)
  where is_pinned;

-- Reactions already cover seven target kinds; add the eighth.
alter table public.reactions drop constraint if exists reactions_target_kind_check;
alter table public.reactions
  add constraint reactions_target_kind_check check (target_kind in (
    'moment', 'note', 'card_play', 'milestone', 'answer', 'compliment', 'message'
  ));

-- ---------------------------------------------------------------------------

/**
 * send_message, now with an attachment and a quote.
 *
 * Replaced rather than overloaded: a second signature would leave the old
 * two-argument version callable, and a stale client would keep silently
 * dropping attachments.
 */
drop function if exists public.send_message(text, uuid);

create or replace function public.send_message(
  message_body text default null,
  about_moment uuid default null,
  attachment_path text default null,
  attachment_type text default null,
  replying_to uuid default null
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

  if nullif(trim(coalesce(message_body, '')), '') is null and attachment_path is null then
    raise exception 'Say something first.';
  end if;

  -- Guard both references rather than trusting the client: an id from another
  -- couple would otherwise be readable through the join.
  if about_moment is not null and not exists (
    select 1 from public.moments m where m.id = about_moment and m.couple_id = cid
  ) then
    raise exception 'That moment is not yours.';
  end if;

  if replying_to is not null and not exists (
    select 1 from public.messages m where m.id = replying_to and m.couple_id = cid
  ) then
    raise exception 'That message is not in this thread.';
  end if;

  insert into public.messages
    (couple_id, author_id, body, moment_id, media_path, media_type, reply_to)
  values
    (cid, auth.uid(), nullif(trim(coalesce(message_body, '')), ''), about_moment,
     attachment_path, attachment_type, replying_to)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.send_message(text, uuid, text, text, uuid) to authenticated;

/** Pinning is either person's to do — it marks the thread, not the message. */
create or replace function public.toggle_message_pin(message_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  now_pinned boolean;
begin
  update public.messages
  set is_pinned = not is_pinned
  where id = message_id and couple_id = public.current_couple_id()
  returning is_pinned into now_pinned;

  if now_pinned is null then
    raise exception 'That message is not in this thread.';
  end if;

  return now_pinned;
end;
$$;

grant execute on function public.toggle_message_pin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------
-- A message with no words used to push an empty body.

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
    'kind', coalesce(new.media_type, 'text'),
    'message', coalesce(
      new.body,
      case new.media_type
        when 'photo' then '📷 Photo'
        when 'voice' then '🎙️ Voice note'
        when 'video' then '🎥 Video'
      end
    )
  ));

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- one photo, one flow
-- ---------------------------------------------------------------------------
-- A photo sent in chat is a memory like any other, and should not need
-- re-sending through Moments to be kept.

create or replace function public.memories(
  kinds text[] default null,
  limit_count integer default 200
)
returns table (
  id uuid,
  kind text,
  title text,
  body text,
  media_path text,
  source text,
  source_id uuid,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with cid as (select public.current_couple_id() as v)

  select mo.id, mo.media_type, 'A moment', mo.caption, mo.storage_path,
         'moments', mo.id, mo.created_at
  from public.moments mo
  where mo.couple_id = (select v from cid)
    and (mo.expires_at is null or mo.expires_at > now())

  union all

  select m.id, m.media_type, ms.title, m.caption, m.storage_path,
         'timeline', ms.id, m.created_at
  from public.milestone_media m
  join public.milestones ms on ms.id = m.milestone_id
  where m.couple_id = (select v from cid)

  union all

  select ms.id, 'note', ms.title, ms.description, null,
         'timeline', ms.id, ms.created_at
  from public.milestones ms
  where ms.couple_id = (select v from cid)
    and not exists (
      select 1 from public.milestone_media mm where mm.milestone_id = ms.id
    )

  union all

  select n.id, 'note', coalesce(n.title, 'A note'), n.body, n.photo_path,
         'notes', n.id, n.created_at
  from public.love_notes n
  where n.couple_id = (select v from cid)

  union all

  select p.id, case when p.voice_path is not null then 'voice' else 'card' end, d.name,
         c.body || case when p.response is not null then E'\n— ' || p.response else '' end,
         p.voice_path, 'cards', p.card_id, p.played_at
  from public.card_plays p
  join public.cards c on c.id = p.card_id
  join public.card_decks d on d.id = c.deck_id
  where p.couple_id = (select v from cid) and p.response is not null

  union all

  select vc.item_id, coalesce(vc.media_type, 'photo'), v.label, null, vc.media_path,
         'vault', v.id, v.created_at
  from public.vault_contents vc
  join public.vault_items v on v.id = vc.item_id
  where v.couple_id = (select c2.v from cid c2)
    and vc.media_path is not null
    and v.unlocked_at is not null

  union all

  select dp.id, 'photo', 'Our day', dp.caption, dp.storage_path,
         'daily', dp.id, dp.created_at
  from public.daily_photos dp
  where dp.couple_id = (select v from cid)
    and (dp.author_id = auth.uid() or public.has_posted_photo(dp.taken_on))

  union all

  -- Attachments sent in chat. Text messages stay out: a conversation is not a
  -- gallery, and putting every "ok" in Memories would bury everything else.
  select ms.id, ms.media_type, 'From our chat', ms.body, ms.media_path,
         'chat', ms.id, ms.created_at
  from public.messages ms
  where ms.couple_id = (select v from cid)
    and ms.media_path is not null

  order by created_at desc
  limit least(greatest(limit_count, 1), 500);
$$;

grant execute on function public.memories(text[], integer) to authenticated;
