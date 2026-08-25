-- ============================================================================
-- 0026_milestone_push.sql — tell them when something goes on the timeline
-- ============================================================================
-- Adding a photo through Memories inserts a moment, so that already notified.
-- Adding one to the Timeline inserts a milestone, and nothing fired at all —
-- you could put the day you met on the wall and they would never know.
--
-- The type is 'memory' rather than 'milestone': 'milestone' is already taken by
-- the monthly-anniversary push from 0021, whose copy expects a day count.

create or replace function public.on_milestone_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  -- Milestones backfilled by a script have no author. Nobody to announce.
  if new.created_by is null then
    return new;
  end if;

  select display_name into author_name
  from public.profiles where id = new.created_by;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'memory',
    'couple_id', new.couple_id,
    'sender_id', new.created_by,
    'sender_name', coalesce(author_name, 'They'),
    'kind', new.icon,
    'message', new.title
  ));

  return new;
end;
$$;

drop trigger if exists milestones_push on public.milestones;
create trigger milestones_push
  after insert on public.milestones
  for each row execute function public.on_milestone_push();

-- So the in-app toast can announce it too.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public' and tablename = 'milestones'
     )
  then
    alter publication supabase_realtime add table public.milestones;
  end if;
end $$;
