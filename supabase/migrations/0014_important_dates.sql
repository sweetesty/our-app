-- ============================================================================
-- 0014_important_dates.sql — the private couple calendar
-- ============================================================================
-- The timeline records what already happened. Nothing looked forward, so
-- nothing reminded either of you about a birthday — and you could seal a letter
-- labelled "open on your birthday" while the app had no idea when that was.

create table if not exists public.important_dates (
  id                 uuid primary key default gen_random_uuid(),
  couple_id          uuid not null references public.couples (id) on delete cascade,
  title              text not null,
  kind               text not null default 'occasion' check (kind in (
                       'birthday', 'anniversary', 'first_date',
                       'occasion', 'trip', 'milestone'
                     )),
  date_on            date not null,
  -- Birthdays and anniversaries repeat; a trip or a one-off does not.
  recurs_annually    boolean not null default true,
  icon               text not null default '🎂',
  note               text,
  remind_days_before int not null default 3 check (remind_days_before between 0 and 60),

  -- Which occurrence each reminder has already covered. A boolean would break
  -- on the second year: the date comes round again and must fire again.
  reminded_early_for date,
  reminded_day_for   date,

  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists important_dates_couple_idx
  on public.important_dates (couple_id, date_on);

drop trigger if exists important_dates_touch on public.important_dates;
create trigger important_dates_touch
  before update on public.important_dates
  for each row execute function public.touch_updated_at();

alter table public.important_dates enable row level security;

drop policy if exists important_dates_all on public.important_dates;
create policy important_dates_all on public.important_dates
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- when does it next come round?
-- ---------------------------------------------------------------------------

create or replace function public.next_occurrence(d date, recurs boolean)
returns date
language plpgsql
immutable
as $$
declare
  this_year date;
begin
  if not recurs then
    return d;
  end if;

  -- 29 February only exists every fourth year; make_date would throw on the
  -- others, so those birthdays land on the 28th.
  begin
    this_year := make_date(
      extract(year from current_date)::int,
      extract(month from d)::int,
      extract(day from d)::int
    );
  exception when others then
    this_year := make_date(extract(year from current_date)::int, 2, 28);
  end;

  if this_year >= current_date then
    return this_year;
  end if;

  begin
    return make_date(
      extract(year from current_date)::int + 1,
      extract(month from d)::int,
      extract(day from d)::int
    );
  exception when others then
    return make_date(extract(year from current_date)::int + 1, 2, 28);
  end;
end;
$$;

-- What the calendar screen reads: everything, sorted by how soon it is.
create or replace function public.upcoming_dates(within_days integer default 400)
returns table (
  id uuid,
  title text,
  kind text,
  icon text,
  note text,
  date_on date,
  recurs_annually boolean,
  remind_days_before int,
  next_on date,
  days_away int,
  years_count int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id, d.title, d.kind, d.icon, d.note, d.date_on, d.recurs_annually,
    d.remind_days_before,
    public.next_occurrence(d.date_on, d.recurs_annually) as next_on,
    (public.next_occurrence(d.date_on, d.recurs_annually) - current_date)::int as days_away,
    -- "3 years together" on the day itself.
    case
      when d.recurs_annually
      then (extract(year from public.next_occurrence(d.date_on, d.recurs_annually))
            - extract(year from d.date_on))::int
      else null
    end as years_count
  from public.important_dates d
  where d.couple_id = public.current_couple_id()
    and public.next_occurrence(d.date_on, d.recurs_annually)
        <= current_date + least(greatest(within_days, 1), 400)
  order by public.next_occurrence(d.date_on, d.recurs_annually);
$$;

grant execute on function public.next_occurrence(date, boolean) to authenticated;
grant execute on function public.upcoming_dates(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------
-- Both people get these. Unlike every other push in the app, this one is not
-- routed away from a sender — there is no sender, so it goes to the whole
-- couple.

create or replace function public.notify_upcoming_dates()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  next_on date;
  sent int := 0;
  member record;
begin
  for item in
    select * from public.important_dates
  loop
    next_on := public.next_occurrence(item.date_on, item.recurs_annually);

    -- On the day
    if next_on = current_date
       and (item.reminded_day_for is null or item.reminded_day_for <> next_on) then

      for member in select id from public.profiles where couple_id = item.couple_id loop
        perform public.dispatch_push(jsonb_build_object(
          'type', 'date',
          'couple_id', item.couple_id,
          -- No sender to exclude, so name someone who is not in the couple;
          -- the function sends to everyone except sender_id.
          'sender_id', '00000000-0000-0000-0000-000000000000',
          'sender_name', item.icon,
          'label', item.title,
          'kind', 'today',
          'message', item.note
        ));
        exit;   -- one dispatch reaches both members
      end loop;

      update public.important_dates set reminded_day_for = next_on where id = item.id;
      sent := sent + 1;

    -- The heads-up, so there is time to actually do something about it
    elsif item.remind_days_before > 0
      and next_on = current_date + item.remind_days_before
      and (item.reminded_early_for is null or item.reminded_early_for <> next_on) then

      perform public.dispatch_push(jsonb_build_object(
        'type', 'date',
        'couple_id', item.couple_id,
        'sender_id', '00000000-0000-0000-0000-000000000000',
        'sender_name', item.icon,
        'label', item.title,
        'kind', 'soon',
        'message', item.remind_days_before || ' days'
      ));

      update public.important_dates set reminded_early_for = next_on where id = item.id;
      sent := sent + 1;
    end if;
  end loop;

  return sent;
end;
$$;

-- Fold into the existing hourly job rather than adding a second schedule.
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

  -- Once a day is plenty for calendar reminders; the 9am pass carries them.
  if local_hour = 9 then
    perform public.notify_upcoming_dates();
  end if;
end;
$$;

revoke execute on function public.notify_upcoming_dates() from anon, authenticated;

-- ---------------------------------------------------------------------------
-- seed from what is already known
-- ---------------------------------------------------------------------------
-- If a couple already set an anniversary in Settings, it belongs on the
-- calendar without anyone re-entering it.

insert into public.important_dates (couple_id, title, kind, date_on, icon, recurs_annually)
select c.id, 'Our anniversary', 'anniversary', c.anniversary, '🥂', true
from public.couples c
where c.anniversary is not null
  and not exists (
    select 1 from public.important_dates d
    where d.couple_id = c.id and d.kind = 'anniversary'
  );
