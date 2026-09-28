-- ============================================================================
-- 0053_push_budget.sql — a budget, before you both start ignoring them
-- ============================================================================
-- Seventeen things now send a push. Individually each one is defensible; added
-- up they are a phone that buzzes all day, and the end state of that is not
-- "an engaged couple", it is two people who have turned notifications off —
-- at which point the vault unlock and the "are you okay" nudge don't arrive
-- either.
--
-- So: a budget, enforced in dispatch_push() where every one of them already
-- passes through, rather than seventeen separate judgement calls.
--
-- Three rules.
--
-- Types have tiers. 'always' gets through whatever happens — a nudge is
-- someone reaching for you, and a vault letter unlocking is the entire feature.
-- 'normal' is the bulk of them. 'quiet' is the ambient ones nobody needs within
-- the minute.
--
-- Quiet hours. Between 10pm and 8am only 'always' gets through; the rest wait,
-- which in practice means they are seen with the morning's.
--
-- And a rate limit per tier per person. Ten normal pushes in an hour is not
-- information, it is noise, and the eleventh is what makes someone reach for
-- the settings.
--
-- Nothing is queued or retried. A push is a tap on the shoulder — if it was
-- not worth delivering then, it is not worth delivering an hour later, and the
-- content is still sitting in the app when they open it.

create table if not exists public.push_log (
  id         uuid primary key default gen_random_uuid(),
  couple_id  uuid references public.couples (id) on delete cascade,
  type       text not null,
  tier       text not null,
  sent_at    timestamptz not null default now(),
  -- False when the budget dropped it. Kept rather than discarded so it is
  -- answerable why a notification never arrived — the push doctor already
  -- exists for exactly that question.
  delivered  boolean not null default true,
  reason     text
);

create index if not exists push_log_couple_idx
  on public.push_log (couple_id, sent_at desc);

alter table public.push_log enable row level security;

drop policy if exists push_log_read on public.push_log;
create policy push_log_read on public.push_log
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- what each type is worth
-- ---------------------------------------------------------------------------

create table if not exists public.push_tiers (
  type       text primary key,
  tier       text not null check (tier in ('always', 'normal', 'quiet')),
  -- Per person, per hour. Null means no limit, which only 'always' gets.
  per_hour   int
);

insert into public.push_tiers (type, tier, per_hour) values
  -- Someone is reaching for you, or something they waited months for opened.
  ('nudge',      'always', null),
  ('vault',      'always', null),
  ('surprise',   'always', null),
  ('joined',     'always', null),
  ('test',       'always', null),

  -- The ones worth knowing about today.
  ('message',    'normal', 12),
  ('note',       'normal', 6),
  ('reply',      'normal', 8),
  ('answer',     'normal', 4),
  ('reveal',     'normal', 4),
  ('moment',     'normal', 8),
  ('photo',      'normal', 4),
  ('date',       'normal', 4),
  ('milestone',  'normal', 4),
  ('memory',     'normal', 4),
  ('handbook',   'normal', 4),

  -- Lovely, and not worth a buzz at 11pm.
  ('mood',       'quiet', 3),
  ('compliment', 'quiet', 4),
  ('reaction',   'quiet', 4),
  ('bucket',     'quiet', 3)
on conflict (type) do update set
  tier = excluded.tier, per_hour = excluded.per_hour;

alter table public.push_tiers enable row level security;

drop policy if exists push_tiers_read on public.push_tiers;
create policy push_tiers_read on public.push_tiers
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- the gate
-- ---------------------------------------------------------------------------

-- Answers "should this one go out", and records the answer either way.
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
  -- Local time, taken from the couple rather than the server, so "10pm" means
  -- 10pm where they actually are.
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
      select count(*) into recent
      from public.push_log l
      where l.couple_id = cid
        and l.tier = t.tier
        and l.delivered
        and l.sent_at > now() - interval '1 hour';

      if t.per_hour is not null and recent >= t.per_hour then
        why := 'hourly limit for ' || t.tier;
      end if;
    end if;
  end if;

  insert into public.push_log (couple_id, type, tier, delivered, reason)
  values (cid, kind, t.tier, why is null, why);

  return why is null;
end;
$$;

revoke execute on function public.push_allowed(jsonb) from anon, authenticated;

-- A couple's own clock. Without it "quiet hours" is the server's night, which
-- for a couple in Lagos is the middle of their afternoon.
alter table public.couples add column if not exists timezone text;

comment on column public.couples.timezone is
  'IANA zone, e.g. Africa/Lagos. Quiet hours are computed against this.';

-- ---------------------------------------------------------------------------
-- wiring it in
-- ---------------------------------------------------------------------------
-- dispatch_push is the single door every notification in the app goes through,
-- which is the only reason this can be one gate rather than seventeen.

-- The parameter stays `payload` and the search_path keeps `extensions` on it.
-- Renaming the first would raise 42P13 — create or replace cannot rename an
-- argument — and dropping the second would put net.http_post out of scope,
-- which is the one line in here that actually sends anything.
create or replace function public.dispatch_push(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg private.push_config;
begin
  -- The budget, before anything else. See push_allowed().
  if not public.push_allowed(payload) then
    return;
  end if;

  select * into cfg from private.push_config where enabled limit 1;

  -- Not configured yet: stay quiet. A missing push must never be able to roll
  -- back the write that triggered it.
  if cfg.function_url is null then
    return;
  end if;

  perform net.http_post(
    url     := cfg.function_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || cfg.service_role_key
               ),
    body    := payload,
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- The thing itself is already saved and will still arrive over realtime if
    -- the app is open. Never fail the transaction over a push.
    raise warning 'push dispatch failed: %', sqlerrm;
end;
$$;

-- What the push doctor should show: everything dropped in the last day, and
-- why. "It never arrived" now has an answer that isn't a shrug.
create or replace function public.push_drops()
returns table (type text, tier text, reason text, sent_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select l.type, l.tier, l.reason, l.sent_at
  from public.push_log l
  where l.couple_id = public.current_couple_id()
    and not l.delivered
    and l.sent_at > now() - interval '1 day'
  order by l.sent_at desc
  limit 50;
$$;

grant execute on function public.push_drops() to authenticated;

-- The log is a rolling window, not history. A fortnight is more than enough to
-- answer "why didn't I get that".
create or replace function public.prune_push_log()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_log where sent_at < now() - interval '14 days';
$$;
