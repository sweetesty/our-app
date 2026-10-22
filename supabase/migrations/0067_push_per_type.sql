-- ============================================================================
-- 0067_push_per_type.sql — a budget per type, not one pot for all of them
-- ============================================================================
-- 0053 counted the hourly limit against the TIER, so every 'normal' type drew
-- from the same six-an-hour pot. One Ludo game emptied it in about four
-- minutes, and the log shows exactly that: forty-odd turn notifications in a
-- row, every one dropped on "hourly limit for normal". Worse, it was not only
-- the game that went quiet — chat messages, notes and moments were starved by
-- it too, because they were drinking from the same cup.
--
-- The limit belongs to the type. Six notes an hour is a sensible ceiling; six
-- notes an hour *minus however many moves your partner made at Ludo* is not a
-- policy, it is an accident.
--
-- And 'turn' gets a real allowance. It is the one notification whose entire
-- purpose is to be acted on — a turn-based game where nobody is told it is
-- their go is a game that stops after two moves.

create or replace function public.push_allowed(event jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  kind  text := event ->> 'type';
  cid   uuid := (event ->> 'couple_id')::uuid;
  t     public.push_tiers;
  zone  text;
  local_hour int;
  recent int;
  why   text;
begin
  select * into t from public.push_tiers where type = kind;

  -- An unknown type is new code that has not been budgeted yet. Let it through
  -- and log it, rather than silently swallowing a feature somebody just built.
  if not found then
    insert into public.push_log (couple_id, type, tier, delivered, reason)
    values (cid, kind, 'unbudgeted', true, null);
    return true;
  end if;

  if t.tier <> 'always' then
    select coalesce(c.timezone, 'UTC') into zone
    from public.couples c where c.id = cid;

    local_hour := extract(hour from (now() at time zone coalesce(zone, 'UTC')));

    if t.tier = 'quiet' and (local_hour >= 22 or local_hour < 8) then
      why := 'quiet hours';
    else
      -- Per type. This is the change: l.type, not l.tier.
      select count(*) into recent
      from public.push_log l
      where l.couple_id = cid
        and l.type = kind
        and l.delivered
        and l.sent_at > now() - interval '1 hour';

      if t.per_hour is not null and recent >= t.per_hour then
        why := format('hourly limit for %s (%s/hr)', kind, t.per_hour);
      end if;
    end if;
  end if;

  insert into public.push_log (couple_id, type, tier, delivered, reason)
  values (cid, kind, t.tier, why is null, why);

  return why is null;
end;
$$;

-- Allowances, now that each type has its own. Generous where being told is the
-- whole point, tight where it is ambient.
update public.push_tiers set per_hour = 20 where type = 'turn';
update public.push_tiers set per_hour = 20 where type = 'message';
update public.push_tiers set per_hour = 15 where type = 'table_chat';
update public.push_tiers set per_hour = 8  where type = 'note';
update public.push_tiers set per_hour = 10 where type = 'reply';
update public.push_tiers set per_hour = 10 where type = 'moment';

-- A clean slate. The log is what the limiter counts, and it is currently full
-- of an hour of drops from the old shared pot — leaving them in would keep
-- suppressing things for an hour after the fix.
delete from public.push_log
where sent_at > now() - interval '2 hours' and not delivered;
