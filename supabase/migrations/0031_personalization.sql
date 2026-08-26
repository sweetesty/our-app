-- ============================================================================
-- 0031_personalization.sql — make it yours rather than mine
-- ============================================================================
-- Everything so far looks identical for every couple who might ever use this.
-- These are the settings that change that: what you call each other, what it
-- looks like, and which emoji you actually use.
--
-- Theme choices live on the couple, not the profile, on purpose. This is one
-- shared room — two people seeing different colours would be two apps.

alter table public.couples
  add column if not exists avatar_url  text,
  -- Named palettes rather than a free colour: the whole UI is built on a
  -- eleven-step scale, and one arbitrary hex cannot fill it in without
  -- producing unreadable text somewhere.
  add column if not exists accent      text not null default 'rose',
  add column if not exists background  text not null default 'glow',
  -- Overrides the built-in reaction set. Null means use the default.
  add column if not exists reactions   text[];

alter table public.couples
  drop constraint if exists couples_accent_check;
alter table public.couples
  add constraint couples_accent_check
  check (accent in ('rose', 'violet', 'ocean', 'ember', 'forest', 'midnight'));

alter table public.couples
  drop constraint if exists couples_background_check;
alter table public.couples
  add constraint couples_background_check
  check (background in ('glow', 'plain', 'aurora', 'stars'));

-- What *you* call them. Stored on your row rather than theirs, because a pet
-- name belongs to the person using it — they may well call you something else.
alter table public.profiles
  add column if not exists partner_nickname text;

-- ---------------------------------------------------------------------------

/**
 * home_summary, with the nickname substituted in.
 *
 * Done here rather than in the fifteen screens that print a partner's name:
 * every one of them already reads summary.partner.display_name, so swapping it
 * at the source makes the nickname appear everywhere at once — and keeps the
 * real display name out of the client, where it would inevitably leak back in.
 */
create or replace function public.home_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  nickname text;
  partner jsonb;
begin
  if cid is null then
    return jsonb_build_object('paired', false);
  end if;

  select p.partner_nickname into nickname
  from public.profiles p where p.id = auth.uid();

  select to_jsonb(p) into partner
  from public.profiles p where p.id = public.partner_id();

  if partner is not null and nullif(trim(coalesce(nickname, '')), '') is not null then
    partner := jsonb_set(partner, '{display_name}', to_jsonb(trim(nickname)))
             || jsonb_build_object('real_name', partner ->> 'display_name');
  end if;

  return jsonb_build_object(
    'paired', true,
    'couple', (select to_jsonb(c) from public.couples c where c.id = cid),
    'me', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
    'partner', partner,
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
