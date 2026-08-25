-- ============================================================================
-- 0023_stats_moments.sql — count moments, and stop mislabelling milestones
-- ============================================================================
-- couple_stats had `memories_added`, which counts timeline milestones. The Us
-- screen labelled that tile "Memories", so a couple with eight photos and nine
-- notes saw 0 — the number was right, the word was wrong.
--
-- Adds moments and compliments, and keeps memories_added for the existing
-- achievement definitions that reference it by name.

-- Dropped rather than replaced: `create or replace view` can only append
-- columns at the end, so adding moments_sent before current_streak reads to
-- Postgres as renaming that column and it refuses. Nothing else depends on the
-- view — sync_achievements queries it, which is not a blocking dependency.
drop view if exists public.couple_stats;

create view public.couple_stats
with (security_invoker = true) as
select
  c.id as couple_id,
  (select count(*) from public.daily_answers a where a.couple_id = c.id)  as answers_given,
  (select count(*) from public.love_notes n where n.couple_id = c.id)     as notes_written,
  (select count(*) from public.card_plays p where p.couple_id = c.id)     as cards_played,
  -- Timeline entries. Named for the achievement that already uses it.
  (select count(*) from public.milestones m where m.couple_id = c.id)     as memories_added,
  (select count(*) from public.vault_items v where v.couple_id = c.id)    as vault_items,
  (select count(*) from public.nudges g where g.couple_id = c.id)         as nudges_sent,
  (select count(*) from public.card_plays p
     join public.cards cd on cd.id = p.card_id
     join public.card_decks d on d.id = cd.deck_id
    where p.couple_id = c.id and d.slug = 'spicy')                        as spicy_played,

  -- Photos sent to each other. Expired ones still count: they happened.
  (select count(*) from public.moments mo where mo.couple_id = c.id)      as moments_sent,
  (select count(*) from public.compliments cp where cp.couple_id = c.id)  as compliments_sent,

  coalesce((select s.current_streak from public.streaks s where s.couple_id = c.id), 0) as current_streak,
  coalesce((select s.longest_streak from public.streaks s where s.couple_id = c.id), 0) as longest_streak
from public.couples c;

grant select on public.couple_stats to authenticated;

-- Achievements for the two new counters.
insert into public.achievement_defs (slug, name, emoji, description, metric, target, sort_order)
values
  ('first_moment',  'First Glimpse',   '📸', 'Sent each other a photo.',        'moments_sent',     1, 15),
  ('fifty_moments', '50 Moments',      '🖼️', 'Fifty photos between you.',       'moments_sent',    50, 45),
  ('kind_words',    'Kind Words',      '💕', 'Twenty compliments said out loud.', 'compliments_sent', 20, 55)
on conflict (slug) do update
  set name = excluded.name,
      emoji = excluded.emoji,
      description = excluded.description,
      metric = excluded.metric,
      target = excluded.target,
      sort_order = excluded.sort_order;
