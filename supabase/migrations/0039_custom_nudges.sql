-- ============================================================================
-- 0039_custom_nudges.sql — nudges you write yourself
-- ============================================================================
-- Six buttons, fixed in a CHECK constraint since 0002. They cover the ordinary
-- things and none of the particular ones — the phrase only the two of you use,
-- the emoji that means a specific thing at a specific time of night. The deck
-- already lets you write your own cards; this is the same idea one screen over.
--
-- A custom nudge is a saved tile: an emoji, a few words, kept on the grid so
-- the second send is one tap like the built-in six.

create table if not exists public.custom_nudges (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  created_by  uuid references public.profiles (id) on delete set null,
  emoji       text not null,
  label       text not null,
  -- How it reads in the history and on their lock screen: "Zahir <line>".
  -- Defaulted from the label, editable because "Come home" wants "says come
  -- home", not "come home".
  line        text,
  created_at  timestamptz not null default now()
);

create index if not exists custom_nudges_couple_idx
  on public.custom_nudges (couple_id, created_at);

alter table public.custom_nudges enable row level security;

drop policy if exists custom_nudges_all on public.custom_nudges;
create policy custom_nudges_all on public.custom_nudges
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- letting one through the front door
-- ---------------------------------------------------------------------------

-- The CHECK listed the six kinds by name, so anything else was rejected at the
-- insert. 'custom' joins them, and the emoji and label ride along on the nudge
-- itself — a sent nudge has to keep reading correctly even if the tile it came
-- from is deleted later.
alter table public.nudges drop constraint if exists nudges_kind_check;
alter table public.nudges add constraint nudges_kind_check check (kind in (
  'miss_you', 'thinking_of_you', 'need_you',
  'kiss', 'annoying', 'proud', 'custom'
));

alter table public.nudges add column if not exists emoji text;
alter table public.nudges add column if not exists label text;

-- ---------------------------------------------------------------------------
-- sending
-- ---------------------------------------------------------------------------

-- Same function, two extra arguments with defaults, so every existing caller —
-- the web grid, the Flutter grid, both of which send only kind and note —
-- keeps working untouched.
create or replace function public.send_nudge(
  nudge_kind text,
  note       text default null,
  emoji      text default null,
  label      text default null
)
returns public.nudges
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.nudges;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if nudge_kind = 'custom' and nullif(trim(coalesce(label, '')), '') is null then
    raise exception 'A custom nudge needs something to say.';
  end if;

  insert into public.nudges (couple_id, sender_id, kind, message, emoji, label)
  values (
    cid, auth.uid(), nudge_kind, nullif(trim(note), ''),
    nullif(trim(coalesce(emoji, '')), ''),
    nullif(trim(coalesce(label, '')), '')
  )
  returning * into result;

  return result;
end;
$$;

grant execute on function public.send_nudge(text, text, text, text) to authenticated;

-- The push trigger passed only the kind, which the Edge Function looks up in a
-- table of six. A custom one would have landed as the generic "is thinking of
-- you" — the wrong words in the one case where the words are the whole point.
create or replace function public.on_nudge_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
begin
  select display_name into sender_name
  from public.profiles where id = new.sender_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'nudge',
    'couple_id', new.couple_id,
    'sender_id', new.sender_id,
    'sender_name', coalesce(sender_name, 'They'),
    'kind', new.kind,
    'emoji', new.emoji,
    'label', new.label,
    'message', new.message
  ));

  return new;
end;
$$;
