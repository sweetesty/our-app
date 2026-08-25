-- ============================================================================
-- 0021_monthly_milestones.sql — "3 months today 💗"
-- ============================================================================
-- Recurring dates only fired once a year. But the months are the part people
-- actually count early on, and nobody wants to work out that today is the
-- eleventh monthiversary.
--
-- Two kinds of milestone:
--   monthly  — same day-of-month as the anniversary, skipping exact years
--              because the annual reminder already covers those
--   day      — 100, 200, 300, 365, 500, 730, 1000 days together

create table if not exists public.milestone_notifications (
  couple_id   uuid not null references public.couples (id) on delete cascade,
  key         text not null,          -- e.g. 'month:11' or 'day:100'
  notified_on date not null default current_date,
  primary key (couple_id, key)
);

alter table public.milestone_notifications enable row level security;

drop policy if exists milestone_notifications_read on public.milestone_notifications;
create policy milestone_notifications_read on public.milestone_notifications
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------

create or replace function public.notify_monthly_milestones()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  months_elapsed int;
  days_elapsed int;
  anniversary_day int;
  is_month_hit boolean;
  milestone_key text;
  sent int := 0;
  day_marks constant int[] := array[100, 200, 300, 365, 500, 730, 1000, 1825, 3650];
  mark int;
begin
  for c in
    select id, anniversary from public.couples where anniversary is not null
  loop
    days_elapsed := current_date - c.anniversary;
    if days_elapsed < 1 then
      continue;
    end if;

    -- ---- monthly -------------------------------------------------------
    anniversary_day := extract(day from c.anniversary)::int;

    -- A 31st anniversary has no 31st in February; fire on the last day of
    -- those months instead so it never silently skips.
    is_month_hit :=
      extract(day from current_date)::int = anniversary_day
      or (
        anniversary_day > extract(day from (date_trunc('month', current_date)
              + interval '1 month - 1 day'))::int
        and current_date = (date_trunc('month', current_date)
              + interval '1 month - 1 day')::date
      );

    if is_month_hit then
      months_elapsed :=
        (extract(year from age(current_date, c.anniversary)) * 12
         + extract(month from age(current_date, c.anniversary)))::int;

      -- Skip exact years: the yearly reminder already says that, better.
      if months_elapsed >= 1 and months_elapsed % 12 <> 0 then
        milestone_key := 'month:' || months_elapsed;

        if not exists (
          select 1 from public.milestone_notifications m
          where m.couple_id = c.id and m.key = milestone_key
        ) then
          perform public.dispatch_push(jsonb_build_object(
            'type', 'milestone',
            'couple_id', c.id,
            'sender_id', '00000000-0000-0000-0000-000000000000',
            'sender_name', '💗',
            'kind', 'month',
            'label', months_elapsed::text,
            'message', days_elapsed::text
          ));

          insert into public.milestone_notifications (couple_id, key)
          values (c.id, milestone_key)
          on conflict do nothing;

          sent := sent + 1;
        end if;
      end if;
    end if;

    -- ---- notable day counts --------------------------------------------
    foreach mark in array day_marks loop
      if days_elapsed = mark then
        milestone_key := 'day:' || mark;

        if not exists (
          select 1 from public.milestone_notifications m
          where m.couple_id = c.id and m.key = milestone_key
        ) then
          perform public.dispatch_push(jsonb_build_object(
            'type', 'milestone',
            'couple_id', c.id,
            'sender_id', '00000000-0000-0000-0000-000000000000',
            'sender_name', '🎉',
            'kind', 'day',
            'label', mark::text,
            'message', null
          ));

          insert into public.milestone_notifications (couple_id, key)
          values (c.id, milestone_key)
          on conflict do nothing;

          sent := sent + 1;
        end if;
      end if;
    end loop;
  end loop;

  return sent;
end;
$$;

-- Fold into the existing 9am pass rather than adding another schedule.
create or replace function public.run_vault_notifier()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  local_hour int;
begin
  local_hour := extract(hour from (now() at time zone 'Africa/Lagos'));

  if local_hour < 8 or local_hour > 21 then
    return;
  end if;

  perform public.notify_ready_vault_items();

  if local_hour = 9 then
    perform public.notify_upcoming_dates();
    perform public.notify_monthly_milestones();
  end if;
end;
$$;

revoke execute on function public.notify_monthly_milestones() from anon, authenticated;
