-- ============================================================================
-- 0001_core.sql — couples, profiles, and the helper functions every policy uses
-- ============================================================================
-- The whole app is built on one idea: every row belongs to exactly one couple,
-- and a couple has exactly two members. Get that right here and every feature
-- table downstream is a two-line RLS policy.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- couples
-- ---------------------------------------------------------------------------

create table if not exists public.couples (
  id            uuid primary key default gen_random_uuid(),
  invite_code   text unique not null,
  name          text,                       -- e.g. "Us", shown in the header
  anniversary   date,                       -- powers the timeline + streak copy
  created_by    uuid not null references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now()
);

comment on table public.couples is
  'One private space. Exactly two profiles point at it. Nothing is ever shared beyond it.';

-- Short, unambiguous invite codes: no 0/O/1/I/L to avoid "is that a one or an ell"
-- being the reason your partner cannot get into your app.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..6 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.couples c where c.invite_code = code);
  end loop;
  return code;
end;
$$;

alter table public.couples
  alter column invite_code set default public.generate_invite_code();

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  display_name  text not null default 'You',
  avatar_url    text,
  couple_id     uuid references public.couples (id) on delete set null,
  joined_at     timestamptz,                -- when they entered the couple
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists profiles_couple_id_idx on public.profiles (couple_id);

-- A couple is two people. Not one, not three.
create or replace function public.enforce_couple_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  member_count int;
begin
  if new.couple_id is null then
    return new;
  end if;

  if tg_op = 'UPDATE' and old.couple_id is not distinct from new.couple_id then
    return new;
  end if;

  select count(*) into member_count
  from public.profiles p
  where p.couple_id = new.couple_id and p.id <> new.id;

  if member_count >= 2 then
    raise exception 'This space already has two people in it.'
      using errcode = 'check_violation';
  end if;

  new.joined_at := coalesce(new.joined_at, now());
  return new;
end;
$$;

drop trigger if exists profiles_couple_capacity on public.profiles;
create trigger profiles_couple_capacity
  before insert or update of couple_id on public.profiles
  for each row execute function public.enforce_couple_capacity();

-- ---------------------------------------------------------------------------
-- new user -> profile
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- The two functions every RLS policy in 0003 leans on.
-- SECURITY DEFINER so they bypass RLS — without that, a policy on `profiles`
-- that calls current_couple_id() (which reads `profiles`) recurses forever.
-- ---------------------------------------------------------------------------

create or replace function public.current_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid();
$$;

create or replace function public.partner_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from public.profiles p
  where p.couple_id = public.current_couple_id()
    and p.id <> auth.uid()
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- pairing RPCs
-- ---------------------------------------------------------------------------

-- Called by the first person. Creates the space and drops them into it.
create or replace function public.create_couple(couple_name text default null)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  new_couple public.couples;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  if public.current_couple_id() is not null then
    raise exception 'You are already in a space.';
  end if;

  insert into public.couples (name, created_by)
  values (nullif(trim(couple_name), ''), auth.uid())
  returning * into new_couple;

  update public.profiles
     set couple_id = new_couple.id, joined_at = now(), updated_at = now()
   where id = auth.uid();

  return new_couple;
end;
$$;

-- Called by the second person, with the code the first person sent them.
create or replace function public.join_couple(code text)
returns public.couples
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.couples;
  member_count int;
begin
  if auth.uid() is null then
    raise exception 'Not signed in.';
  end if;

  if public.current_couple_id() is not null then
    raise exception 'You are already in a space.';
  end if;

  select * into target
  from public.couples c
  where c.invite_code = upper(trim(code));

  if target.id is null then
    raise exception 'That code does not match any space.';
  end if;

  select count(*) into member_count
  from public.profiles p where p.couple_id = target.id;

  if member_count >= 2 then
    raise exception 'That space already has two people in it.';
  end if;

  update public.profiles
     set couple_id = target.id, joined_at = now(), updated_at = now()
   where id = auth.uid();

  return target;
end;
$$;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch
  before update on public.profiles
  for each row execute function public.touch_updated_at();
