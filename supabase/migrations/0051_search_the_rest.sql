-- ============================================================================
-- 0051_search_the_rest.sql — the third of the app search couldn't see
-- ============================================================================
-- search_everything() was written when the app had nine kinds of content. It
-- now has fourteen, and the five it never learned about are the ones most
-- worth finding again: a boundary written six months ago, the bucket-list item
-- you half-remember adding, what helped the last time you argued.
--
-- The reveal rules are repeated here rather than relied upon, exactly as they
-- already are for daily answers and the vault. Search is a side door, and a
-- side door that skips the gate is not a gate.

create or replace function public.search_everything(
  q text,
  limit_count integer default 60
)
returns table (
  id uuid,
  kind text,
  title text,
  snippet text,
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
  with cid as (select public.current_couple_id() as v),
       needle as (select '%' || trim(q) || '%' as v)

  select n.id, 'note', coalesce(n.title, 'A note'), n.body, n.photo_path,
         'notes', n.id, n.created_at
  from public.love_notes n
  where n.couple_id = (select v from cid)
    and (n.body ilike (select v from needle) or n.title ilike (select v from needle))

  union all

  select m.id, 'message', 'Chat', m.body, m.media_path, 'chat', m.id, m.created_at
  from public.messages m
  where m.couple_id = (select v from cid)
    and m.body ilike (select v from needle)

  union all

  select ms.id, 'milestone', ms.title,
         concat_ws(' · ', ms.description, ms.location),
         null, 'timeline', ms.id, ms.created_at
  from public.milestones ms
  where ms.couple_id = (select v from cid)
    and (ms.title ilike (select v from needle)
      or ms.description ilike (select v from needle)
      or ms.location ilike (select v from needle))

  union all

  -- Expired moments are gone, not merely hidden.
  select mo.id, 'moment', 'A moment', mo.caption, mo.storage_path,
         'moments', mo.id, mo.created_at
  from public.moments mo
  where mo.couple_id = (select v from cid)
    and (mo.expires_at is null or mo.expires_at > now())
    and mo.caption ilike (select v from needle)

  union all

  select p.id, 'card', d.name, concat_ws(E'\n— ', c.body, p.response),
         p.voice_path, 'cards', p.card_id, p.played_at
  from public.card_plays p
  join public.cards c on c.id = p.card_id
  join public.card_decks d on d.id = c.deck_id
  where p.couple_id = (select v from cid)
    and (c.body ilike (select v from needle) or p.response ilike (select v from needle))
    -- Rounds made card answers readable, which also made them findable. Your
    -- own always; theirs only once the round revealed.
    and (
      p.played_by = auth.uid()
      or p.round_id is null
      or (select count(*) from public.card_plays q where q.round_id = p.round_id) >= 2
    )

  union all

  -- The reveal gate, repeated. Your own answer always; theirs only once you
  -- have written yours.
  select a.id, 'answer', 'An answer', a.body, null, 'today', a.id, a.created_at
  from public.daily_answers a
  where a.couple_id = (select v from cid)
    and a.body ilike (select v from needle)
    and (a.author_id = auth.uid() or public.has_answered(a.daily_question_id))

  union all

  -- Opened letters only, and never a sealed surprise's label.
  select v.id, 'vault', v.label, null, null, 'vault', v.id, v.created_at
  from public.vault_items v
  where v.couple_id = (select c2.v from cid c2)
    and v.label ilike (select n.v from needle n)
    and (v.author_id = auth.uid() or (v.unlocked_at is not null))

  union all

  select cp.id, 'compliment', 'A compliment', cp.body, null,
         'compliments', cp.id, cp.created_at
  from public.compliments cp
  where cp.couple_id = (select v from cid)
    and cp.body ilike (select v from needle)

  union all

  select dp.id, 'photo', 'Our day', dp.caption, dp.storage_path,
         'daily', dp.id, dp.created_at
  from public.daily_photos dp
  where dp.couple_id = (select v from cid)
    and dp.caption ilike (select v from needle)
    and (dp.author_id = auth.uid() or public.has_posted_photo(dp.taken_on))

  /* ---- the five it could not see ------------------------------------- */

  union all

  -- The handbook. The single most searchable thing in the app: "what did she
  -- say about being told to leave" is exactly the question you have mid-row.
  select e.id, 'handbook', s.title, e.body, null, 'handbook', e.id, e.created_at
  from public.handbook_entries e
  join public.handbook_sections s on s.id = e.section_id
  where e.couple_id = (select v from cid)
    and (e.body ilike (select v from needle) or s.title ilike (select v from needle))

  union all

  select b.id, 'bucket',
         case when b.completed_at is null then 'Bucket list' else 'Done ✨' end,
         concat_ws(' · ', b.title, b.note),
         null, 'bucket', b.id, b.created_at
  from public.bucket_items b
  where b.couple_id = (select v from cid)
    and (b.title ilike (select v from needle) or b.note ilike (select v from needle))

  union all

  -- What you said in a game, once the round was scored. Same gate as cards.
  select ga.round_id, 'game', g.name,
         concat_ws(E'\n— ', p.body, ga.value),
         null, 'cards', ga.round_id, ga.answered_at
  from public.game_answers ga
  join public.game_rounds r on r.id = ga.round_id
  join public.game_sessions gs on gs.id = r.session_id
  join public.games g on g.slug = gs.game_slug
  join public.game_prompts p on p.id = r.prompt_id
  where gs.couple_id = (select v from cid)
    and ga.value ilike (select v from needle)
    and (
      ga.user_id = auth.uid()
      or (select count(*) from public.game_answers x where x.round_id = ga.round_id) >= 2
    )

  union all

  -- The argument log. "What helped" is the field you come back for.
  select f.id, 'fight',
         case when f.resolved_on is null then 'Still going' else 'Sorted' end,
         concat_ws(E'\n— ', f.what_about, f.what_helped),
         null, 'timeline', f.id, f.created_at
  from public.fights f
  where f.couple_id = (select v from cid)
    and (f.what_about ilike (select v from needle)
      or f.what_helped ilike (select v from needle))

  union all

  select d.id, 'date', 'Date night', d.title, null, 'date', d.id, d.created_at
  from public.date_ideas d
  where d.couple_id = (select v from cid)
    and d.title ilike (select v from needle)

  order by created_at desc
  limit least(greatest(limit_count, 1), 200);
$$;

grant execute on function public.search_everything(text, integer) to authenticated;
