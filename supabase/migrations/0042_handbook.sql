-- ============================================================================
-- 0042_handbook.sql — the handbook the two of you write for each other
-- ============================================================================
-- Everything else in this app is something you send. This is something you
-- keep: what you love, what you can't stand, what actually hurts, and what you
-- need when you're upset — written down calmly, once, so it isn't being
-- explained for the first time in the middle of an argument.
--
-- Three decisions carry it.
--
-- Sections are *rows*, not an enum. There are about ninety of them and the
-- list will keep growing; a CHECK constraint listing them would mean a
-- migration every time one is added, and would make couple-written sections
-- impossible. `handbook_sections` with a null couple_id is a built-in; with a
-- couple_id it's one you wrote yourselves.
--
-- A section is either personal or shared, and that is not decoration.
-- "Things That Hurt Me" has two independent answers and you each own yours.
-- "Our Boundaries" has one answer that belongs to both of you. Modelling them
-- the same way would put one person's name on a joint decision.
--
-- And every personal entry can be acknowledged. An entry your partner has read
-- and said "got it" to is a different object from one they've never seen, and
-- both of you can tell which is which. That's the difference between keeping a
-- list and being heard.

-- ---------------------------------------------------------------------------
-- sections
-- ---------------------------------------------------------------------------

create table if not exists public.handbook_sections (
  id          uuid primary key default gen_random_uuid(),
  -- Null for the built-in list; set for a section a couple wrote themselves.
  couple_id   uuid references public.couples (id) on delete cascade,
  slug        text not null,
  group_key   text not null check (group_key in (
                'know', 'understand', 'relationship', 'fun', 'deeper', 'personal', 'growing'
              )),
  title       text not null,
  emoji       text not null default '📝',
  -- personal: one list each, and your partner acknowledges yours.
  -- shared:   one list between you, either of you may add to it.
  scope       text not null default 'personal' check (scope in ('personal', 'shared')),
  prompt      text,
  placeholder text,
  -- Heavy ones are styled so they cannot be skimmed like the funny ones.
  weight      text not null default 'light' check (weight in ('light', 'heavy')),
  sort_order  int not null default 100,
  created_at  timestamptz not null default now()
);

-- One 'boundaries' for everyone, and one per couple if they write their own.
create unique index if not exists handbook_sections_builtin_idx
  on public.handbook_sections (slug) where couple_id is null;
create unique index if not exists handbook_sections_couple_idx
  on public.handbook_sections (couple_id, slug) where couple_id is not null;

-- ---------------------------------------------------------------------------
-- entries
-- ---------------------------------------------------------------------------

create table if not exists public.handbook_entries (
  id          uuid primary key default gen_random_uuid(),
  couple_id   uuid not null references public.couples (id) on delete cascade,
  section_id  uuid not null references public.handbook_sections (id) on delete cascade,
  -- Who wrote it. In a personal section that also means whose list it is; in a
  -- shared one it's only a byline.
  author_id   uuid not null references public.profiles (id) on delete cascade,
  body        text not null check (length(trim(body)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists handbook_entries_couple_idx
  on public.handbook_entries (couple_id, section_id, author_id, created_at);

-- ---------------------------------------------------------------------------
-- "got it"
-- ---------------------------------------------------------------------------

create table if not exists public.handbook_acks (
  entry_id  uuid not null references public.handbook_entries (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  acked_at  timestamptz not null default now(),
  primary key (entry_id, user_id)
);

-- ---------------------------------------------------------------------------
-- row level security
-- ---------------------------------------------------------------------------
-- Read by the couple, written only by its author. This is the one screen where
-- "only the author may edit" is load-bearing rather than tidy: a boundary your
-- partner could quietly reword is not a boundary.

alter table public.handbook_sections enable row level security;
alter table public.handbook_entries  enable row level security;
alter table public.handbook_acks     enable row level security;

drop policy if exists handbook_sections_read on public.handbook_sections;
create policy handbook_sections_read on public.handbook_sections
  for select to authenticated
  using (couple_id is null or couple_id = public.current_couple_id());

drop policy if exists handbook_sections_write on public.handbook_sections;
create policy handbook_sections_write on public.handbook_sections
  for insert to authenticated
  with check (couple_id = public.current_couple_id());

drop policy if exists handbook_sections_delete on public.handbook_sections;
create policy handbook_sections_delete on public.handbook_sections
  for delete to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists handbook_entries_read on public.handbook_entries;
create policy handbook_entries_read on public.handbook_entries
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists handbook_entries_write on public.handbook_entries;
create policy handbook_entries_write on public.handbook_entries
  for insert to authenticated
  with check (couple_id = public.current_couple_id() and author_id = auth.uid());

drop policy if exists handbook_entries_modify on public.handbook_entries;
create policy handbook_entries_modify on public.handbook_entries
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists handbook_entries_delete on public.handbook_entries;
create policy handbook_entries_delete on public.handbook_entries
  for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists handbook_acks_read on public.handbook_acks;
create policy handbook_acks_read on public.handbook_acks
  for select to authenticated
  using (exists (
    select 1 from public.handbook_entries e
    where e.id = entry_id and e.couple_id = public.current_couple_id()
  ));

-- You acknowledge; you cannot acknowledge on someone else's behalf.
drop policy if exists handbook_acks_write on public.handbook_acks;
create policy handbook_acks_write on public.handbook_acks
  for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.handbook_entries e
    where e.id = entry_id and e.couple_id = public.current_couple_id()
  ));

drop policy if exists handbook_acks_delete on public.handbook_acks;
create policy handbook_acks_delete on public.handbook_acks
  for delete to authenticated
  using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- what the screen reads
-- ---------------------------------------------------------------------------

-- Every entry in the couple's handbook, with whether *you* have acknowledged
-- it. Your own entries come back acknowledged — you wrote them, there is
-- nothing to tell you.
create or replace function public.handbook()
returns table (
  id          uuid,
  section_id  uuid,
  slug        text,
  scope       text,
  author_id   uuid,
  author_name text,
  mine        boolean,
  body        text,
  acked       boolean,
  acked_at    timestamptz,
  created_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.section_id,
    s.slug,
    s.scope,
    e.author_id,
    p.display_name,
    e.author_id = auth.uid(),
    e.body,
    -- Shared entries are a joint list, not a message to you, so there is
    -- nothing to acknowledge and they never show as unread.
    e.author_id = auth.uid() or s.scope = 'shared' or a.entry_id is not null,
    a.acked_at,
    e.created_at
  from public.handbook_entries e
  join public.handbook_sections s on s.id = e.section_id
  left join public.profiles p on p.id = e.author_id
  left join public.handbook_acks a
    on a.entry_id = e.id and a.user_id = auth.uid()
  where e.couple_id = public.current_couple_id()
  order by e.created_at;
$$;

-- "17 things ❤️ · I've read them all ✓" — the line at the top of their side.
create or replace function public.handbook_summary()
returns table (
  theirs_total   int,
  theirs_unacked int,
  mine_total     int,
  -- How much of your own they have taken in. The reciprocal matters: it's the
  -- difference between a list and a conversation.
  mine_acked     int,
  shared_total   int
)
language sql
stable
security definer
set search_path = public
as $$
  with rows as (
    select e.*, s.scope
    from public.handbook_entries e
    join public.handbook_sections s on s.id = e.section_id
    where e.couple_id = public.current_couple_id()
  )
  select
    count(*) filter (where scope = 'personal' and author_id <> auth.uid())::int,
    count(*) filter (
      where scope = 'personal' and author_id <> auth.uid()
        and not exists (
          select 1 from public.handbook_acks a
          where a.entry_id = rows.id and a.user_id = auth.uid()
        )
    )::int,
    count(*) filter (where scope = 'personal' and author_id = auth.uid())::int,
    count(*) filter (
      where scope = 'personal' and author_id = auth.uid()
        and exists (
          select 1 from public.handbook_acks a
          where a.entry_id = rows.id and a.user_id = public.partner_id()
        )
    )::int,
    count(*) filter (where scope = 'shared')::int
  from rows;
$$;

-- "Got it." Idempotent, and it will not let you acknowledge your own.
create or replace function public.ack_handbook(entry uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  owner uuid;
begin
  select author_id into owner
  from public.handbook_entries
  where id = entry and couple_id = public.current_couple_id();

  if owner is null then
    raise exception 'No such entry';
  end if;

  if owner = auth.uid() then
    return;
  end if;

  insert into public.handbook_acks (entry_id, user_id)
  values (entry, auth.uid())
  on conflict (entry_id, user_id) do nothing;
end;
$$;

-- Acknowledge a whole section, or the lot. The realistic gesture after reading
-- someone's list top to bottom is "I've read all of this", not forty taps.
create or replace function public.ack_handbook_all(target_section uuid default null)
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  added int;
begin
  insert into public.handbook_acks (entry_id, user_id)
  select e.id, auth.uid()
  from public.handbook_entries e
  join public.handbook_sections s on s.id = e.section_id
  where e.couple_id = public.current_couple_id()
    and e.author_id <> auth.uid()
    and s.scope = 'personal'
    and (target_section is null or e.section_id = target_section)
  on conflict (entry_id, user_id) do nothing;

  get diagnostics added = row_count;
  return added;
end;
$$;

grant execute on function public.handbook() to authenticated;
grant execute on function public.handbook_summary() to authenticated;
grant execute on function public.ack_handbook(uuid) to authenticated;
grant execute on function public.ack_handbook_all(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- telling them
-- ---------------------------------------------------------------------------
-- Worth a push. Something added to a handbook is by definition something the
-- other person did not know — and the section name rides along, because "added
-- a boundary" and "added a food they don't like" deserve different amounts of
-- your attention.

create or replace function public.on_handbook_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  section_title text;
begin
  select display_name into author_name from public.profiles where id = new.author_id;
  select title into section_title from public.handbook_sections where id = new.section_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'handbook',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    'label', section_title,
    'message', new.body
  ));

  return new;
end;
$$;

drop trigger if exists handbook_push on public.handbook_entries;
create trigger handbook_push
  after insert on public.handbook_entries
  for each row execute function public.on_handbook_push();
