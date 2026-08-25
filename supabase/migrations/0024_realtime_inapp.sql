-- ============================================================================
-- 0024_realtime_inapp.sql — publish the tables an in-app alert needs
-- ============================================================================
-- A push notification is no use while the app is already open: iOS suppresses
-- it, and you are looking at the screen anyway. But if you are both mid card
-- game and one of you sends a note, the other should still see it arrive.
--
-- Realtime is the right channel for that rather than the foreground FCM
-- handler: it works for someone who never granted notification permission, it
-- carries the row so the toast can route to the right screen, and it respects
-- RLS — Postgres decides what the other person is allowed to be told about.
--
-- nudges, daily_answers (0002) and compliments (0019) are already published.
-- daily_answers is deliberately not used for alerts: the reveal gate means the
-- row is invisible until you have answered, so nothing would arrive anyway.

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication not found, skipping';
    return;
  end if;

  foreach t in array array['love_notes', 'moments'] loop
    -- Adding a table twice is an error, so check first. Re-running this
    -- migration has to stay harmless.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
