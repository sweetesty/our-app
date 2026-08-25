-- ============================================================================
-- 0018_memories_fix.sql — include notes that have no photo
-- ============================================================================
-- memories() required love_notes.photo_path to be non-null, so a written note
-- never appeared — while the gallery showed a "Love Notes" filter promising it
-- would. A note is a memory whether or not a picture came with it.
--
-- Same reasoning for milestones: a moment on the timeline with only words is
-- still worth seeing here.

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

  -- Moments. Guarded so this still works if 0017 has not been applied.
  select mo.id, mo.media_type, 'A moment', mo.caption, mo.storage_path,
         'moments', mo.id, mo.created_at
  from public.moments mo
  where mo.couple_id = (select v from cid)
    and (mo.expires_at is null or mo.expires_at > now())

  union all

  -- Timeline attachments
  select m.id, m.media_type, ms.title, m.caption, m.storage_path,
         'timeline', ms.id, m.created_at
  from public.milestone_media m
  join public.milestones ms on ms.id = m.milestone_id
  where m.couple_id = (select v from cid)

  union all

  -- Timeline entries that carry no attachment. Words alone are still a memory.
  select ms.id, 'note', ms.title, ms.description, null,
         'timeline', ms.id, ms.created_at
  from public.milestones ms
  where ms.couple_id = (select v from cid)
    and not exists (
      select 1 from public.milestone_media mm where mm.milestone_id = ms.id
    )

  union all

  -- Every love note, with or without a picture.
  select n.id, 'note', coalesce(n.title, 'A note'), n.body, n.photo_path,
         'notes', n.id, n.created_at
  from public.love_notes n
  where n.couple_id = (select v from cid)

  union all

  -- Cards you answered. A skipped card is still not a memory.
  select p.id, 'card', d.name,
         c.body || case when p.response is not null then E'\n— ' || p.response else '' end,
         null, 'cards', p.card_id, p.played_at
  from public.card_plays p
  join public.cards c on c.id = p.card_id
  join public.card_decks d on d.id = c.deck_id
  where p.couple_id = (select v from cid) and p.response is not null

  union all

  -- Vault attachments, opened letters only, so nothing leaks early.
  select vc.item_id, coalesce(vc.media_type, 'photo'), v.label, null, vc.media_path,
         'vault', v.id, v.created_at
  from public.vault_contents vc
  join public.vault_items v on v.id = vc.item_id
  where v.couple_id = (select c2.v from cid c2)
    and vc.media_path is not null
    and v.unlocked_at is not null

  order by created_at desc
  limit least(greatest(limit_count, 1), 500);
$$;

grant execute on function public.memories(text[], integer) to authenticated;
