-- ============================================================================
-- 0013_note_push.sql — say when a note has been left
-- ============================================================================
-- Every other thing in the app announces itself. A love note did not, so one
-- written on a Tuesday might not be found until Friday — and the ones worth
-- writing are usually the ones worth finding today.
--
-- The notification carries the title but never the body. A note is meant to be
-- opened and read, not consumed from a lock screen, and the unread dot on the
-- wall should still mean something when they get there.

create or replace function public.on_note_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  headline text;
begin
  select display_name into author_name
  from public.profiles where id = new.author_id;

  -- Prefer the title the author chose; fall back to the mood so the push still
  -- says something more useful than "a note".
  headline := coalesce(
    nullif(trim(new.title), ''),
    case new.mood
      when 'hard_day'    then 'For a bad day'
      when 'proud'       then 'Proud of you'
      when 'sorry'       then 'An apology'
      when 'anniversary' then 'For a milestone'
      when 'random'      then 'A random thought'
      else 'Just because'
    end
  );

  perform public.dispatch_push(jsonb_build_object(
    'type', 'note',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    'label', headline,
    'kind', case when new.is_pinned then 'pinned' else 'note' end
  ));

  return new;
end;
$$;

drop trigger if exists love_notes_push on public.love_notes;
create trigger love_notes_push
  after insert on public.love_notes
  for each row execute function public.on_note_push();
