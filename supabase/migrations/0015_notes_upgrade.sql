-- ============================================================================
-- 0015_notes_upgrade.sql — favourites, photos, and better categories
-- ============================================================================
-- The original categories were mine and they were vague ("random thought").
-- These are the ones that actually name the moment you would reach for a note:
-- when you miss me, when you are angry with me, when you need reassurance.
-- A category is only useful if it tells you when to open the thing.

alter table public.love_notes
  add column if not exists is_favourite boolean not null default false;

-- One photo per note. A gallery would make this the timeline; a single image
-- is enough to make a note feel like a letter with something tucked inside.
alter table public.love_notes
  add column if not exists photo_path text;

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------
-- Drop the constraint before remapping, or the update fails against the old
-- allowed set halfway through.

alter table public.love_notes drop constraint if exists love_notes_mood_check;

update public.love_notes
set mood = case mood
  when 'hard_day' then 'sad'      -- closest match
  when 'random'   then 'sweet'    -- "random thought" was never a real category
  else mood
end
where mood in ('hard_day', 'random');

alter table public.love_notes
  add constraint love_notes_mood_check check (mood in (
    'sweet',        -- just because
    'miss_me',      -- read when you miss me
    'sad',          -- read when you're sad
    'angry',        -- read when you're angry with me
    'reassurance',  -- read when you need reassurance
    'happy',        -- read when you're happy
    'sorry',
    'proud',
    'anniversary'
  ));

alter table public.love_notes alter column mood set default 'sweet';

-- ---------------------------------------------------------------------------
-- favouriting
-- ---------------------------------------------------------------------------
-- Deliberately separate from pinning. Pinning is "this stays at the top of the
-- wall for both of us"; favouriting is "I keep coming back to this one". The
-- author pins, the reader favourites.

create or replace function public.toggle_note_favourite(note uuid)
returns public.love_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.love_notes;
begin
  update public.love_notes
  set is_favourite = not is_favourite, updated_at = now()
  where id = note
    and couple_id = public.current_couple_id()
  returning * into result;

  if result.id is null then
    raise exception 'No such note.';
  end if;

  return result;
end;
$$;

grant execute on function public.toggle_note_favourite(uuid) to authenticated;

create index if not exists love_notes_favourite_idx
  on public.love_notes (couple_id, is_favourite)
  where is_favourite;
