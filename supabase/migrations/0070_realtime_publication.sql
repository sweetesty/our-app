-- ============================================================================
-- 0070_realtime_publication.sql — every table the app listens to
-- ============================================================================
-- check_realtime found game_answers missing from the publication, which means
-- the subscription in the prompt games has never once fired: you answered, and
-- nothing told your partner until they reloaded. The screen was built to say
-- "they've answered" the moment it happened and has never been able to.
--
-- Rather than add the one and wait to discover the next, this covers every
-- table the client actually subscribes to. The list came from grepping the
-- source for postgres_changes, so it is what the app listens for rather than
-- what I remember adding.
--
-- A missing table is silent in the worst way: the subscription is accepted,
-- the callback simply never runs, and the feature looks merely slow.

do $$
declare
  t text;
begin
  foreach t in array array[
    'board_chat',
    'board_matches',
    'card_plays',
    'compliments',
    'daily_answers',
    'daily_photos',
    'game_answers',
    'love_notes',
    'messages',
    'milestones',
    'moments',
    'nudges',
    'reactions',
    'replies'
  ]
  loop
    -- Skip anything already in, and anything that does not exist on this
    -- database yet, rather than failing the whole migration over one name.
    if not exists (
      select 1
      from pg_publication_rel pr
      join pg_publication p on p.oid = pr.prpubid
      join pg_class c on c.oid = pr.prrelid
      join pg_namespace n on n.oid = c.relnamespace
      where p.pubname = 'supabase_realtime'
        and n.nspname = 'public'
        and c.relname = t
    ) and exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
      raise notice 'added % to supabase_realtime', t;
    end if;
  end loop;
end
$$;

-- What the app is actually listening on now, so this can be read back rather
-- than trusted.
select c.relname as table_name
from pg_publication_rel pr
join pg_publication p on p.oid = pr.prpubid
join pg_class c on c.oid = pr.prrelid
where p.pubname = 'supabase_realtime'
order by c.relname;
