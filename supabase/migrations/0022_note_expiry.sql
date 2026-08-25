-- ============================================================================
-- 0022_note_expiry.sql — notes last a day unless you pin them
-- ============================================================================
-- Pinning now means "keep this". An unpinned note is a passing thought and
-- clears itself after 24 hours; a pinned one stays until it is unpinned.
--
-- Nothing is destroyed on a timer. RLS stops returning expired notes, and a
-- daily sweep removes them for good — so pinning a note an hour before it
-- would have gone still saves it, and unpinning does not resurrect one that
-- expired weeks ago.

alter table public.love_notes
  add column if not exists expires_at timestamptz;

comment on column public.love_notes.expires_at is
  'When an unpinned note stops being visible. Null once pinned.';

-- Existing notes keep their current behaviour: everything already written was
-- created under "notes are permanent", and quietly deleting them tomorrow
-- would be a betrayal of that.
update public.love_notes set expires_at = null where expires_at is null;

-- ---------------------------------------------------------------------------
-- new notes get a clock, pinned ones lose it
-- ---------------------------------------------------------------------------

create or replace function public.set_note_expiry()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    -- Pinned at the moment of writing means keep it from the start.
    new.expires_at := case
      when new.is_pinned then null
      else now() + interval '24 hours'
    end;
    return new;
  end if;

  -- Pinning saves it; unpinning starts a fresh 24 hours rather than reviving
  -- an old deadline that may already have passed.
  if new.is_pinned and not old.is_pinned then
    new.expires_at := null;
  elsif old.is_pinned and not new.is_pinned then
    new.expires_at := now() + interval '24 hours';
  end if;

  return new;
end;
$$;

drop trigger if exists love_notes_expiry on public.love_notes;
create trigger love_notes_expiry
  before insert or update of is_pinned on public.love_notes
  for each row execute function public.set_note_expiry();

-- ---------------------------------------------------------------------------
-- hide expired notes
-- ---------------------------------------------------------------------------

drop policy if exists love_notes_read on public.love_notes;
create policy love_notes_read on public.love_notes
  for select to authenticated
  using (
    couple_id = public.current_couple_id()
    and (expires_at is null or expires_at > now())
  );

-- Sweep them away once a day. Kept separate from the visibility rule above so
-- a delayed job can never expose something that should have gone.
create or replace function public.purge_expired_notes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed int;
begin
  with gone as (
    delete from public.love_notes
    where expires_at is not null
      and expires_at < now() - interval '1 day'   -- grace period
    returning 1
  )
  select count(*) into removed from gone;

  return removed;
end;
$$;

do $$
begin
  perform cron.unschedule('purge-expired-notes');
exception
  when others then null;
end
$$;

select cron.schedule(
  'purge-expired-notes',
  '20 4 * * *',
  $$ select public.purge_expired_notes() $$
);

revoke execute on function public.purge_expired_notes() from anon, authenticated;
