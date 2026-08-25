-- ============================================================================
-- 0009_vault_notifier.sql — tell people when a sealed letter opens
-- ============================================================================
-- Every other push in this app hangs off a row being inserted, so a trigger
-- catches it. A vault letter is different: it unlocks because time passed, and
-- nothing writes a row at that moment. So nothing fired, and a letter written
-- for someone's birthday sat unread unless they happened to open the app and
-- scroll to the vault — the feature failing at exactly the moment it mattered.
--
-- The fix is a scheduled job that looks for letters that have just become
-- openable and pushes once each.

create extension if not exists pg_cron with schema cron;

-- ---------------------------------------------------------------------------
-- remember what we have already announced
-- ---------------------------------------------------------------------------
-- Without this the job would re-notify every letter, every run, forever.

alter table public.vault_items
  add column if not exists notified_at timestamptz;

comment on column public.vault_items.notified_at is
  'When the recipient was told this became openable. Null = not yet announced.';

-- Anything already unlocked before this migration ran is history — mark it so
-- the first run does not fire a burst of notifications about old letters.
update public.vault_items
set notified_at = now()
where notified_at is null
  and unlock_type = 'date'
  and unlock_at <= now();

create index if not exists vault_items_pending_notify_idx
  on public.vault_items (unlock_at)
  where unlock_type = 'date' and notified_at is null and unlocked_at is null;

-- ---------------------------------------------------------------------------
-- the job
-- ---------------------------------------------------------------------------

create or replace function public.notify_ready_vault_items()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  author_name text;
  count_sent int := 0;
begin
  for item in
    select v.*
    from public.vault_items v
    where v.unlock_type = 'date'
      and v.unlock_at is not null
      and v.unlock_at <= now()
      and v.unlocked_at is null      -- they have not already opened it
      and v.notified_at is null      -- and we have not already said so
    -- A sane ceiling: if something goes wrong we would rather under-notify
    -- than push fifty times in one morning.
    order by v.unlock_at
    limit 20
  loop
    select display_name into author_name
    from public.profiles where id = item.author_id;

    perform public.dispatch_push(jsonb_build_object(
      'type', 'vault',
      'couple_id', item.couple_id,
      -- The push goes to everyone in the couple except `sender_id`, so naming
      -- the author here is what routes it to the recipient.
      'sender_id', item.author_id,
      'sender_name', coalesce(author_name, 'They'),
      'label', item.label
    ));

    update public.vault_items
    set notified_at = now()
    where id = item.id;

    count_sent := count_sent + 1;
  end loop;

  return count_sent;
end;
$$;

comment on function public.notify_ready_vault_items is
  'Announces vault letters whose unlock date has arrived. Scheduled hourly.';

-- ---------------------------------------------------------------------------
-- schedule
-- ---------------------------------------------------------------------------
-- Hourly rather than daily so a letter does not wait most of a day, but with a
-- waking-hours guard inside the job — unlock_at is midnight-based, and nobody
-- wants a birthday letter announced at 3am.

create or replace function public.run_vault_notifier()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_hour int;
begin
  -- Africa/Lagos: change this one line if you move. It only decides *when*
  -- notifications are allowed, never whether a letter unlocks.
  local_hour := extract(hour from (now() at time zone 'Africa/Lagos'));

  if local_hour < 8 or local_hour > 21 then
    return;
  end if;

  perform public.notify_ready_vault_items();
end;
$$;

-- Re-running this migration should not stack duplicate jobs.
do $$
begin
  perform cron.unschedule('vault-unlock-notifier');
exception
  when others then null;  -- not scheduled yet
end
$$;

select cron.schedule(
  'vault-unlock-notifier',
  '5 * * * *',                       -- five past every hour
  $$ select public.run_vault_notifier() $$
);

revoke execute on function public.notify_ready_vault_items() from anon, authenticated;
revoke execute on function public.run_vault_notifier() from anon, authenticated;
