-- ============================================================================
-- 0029_account.sql — a way out
-- ============================================================================
-- Until now the only exit from this app was asking someone to run SQL. Three
-- doors, in increasing order of severity:
--
--   wipe_couple_data  — empty the space, keep the space and both accounts
--   delete_couple     — destroy the shared space, keep both accounts
--   delete_my_account — the above, plus your login
--
-- All three take the literal word DELETE. A confirm dialog can be tapped
-- through; typing the word cannot be done by accident.
--
-- Files are removed too. Deleting rows leaves the photos sitting in the bucket
-- paying for themselves forever, which is not what anyone means by "delete my
-- data".

/**
 * Every couple-scoped row, everywhere.
 *
 * Derived from the catalogue rather than a hand-written list, so a table added
 * later is covered without anyone remembering to come back here — the failure
 * mode of a hardcoded list is silently leaving data behind.
 */
create or replace function private.purge_couple(cid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t text;
begin
  -- Photos, voice notes and video. Storage RLS keys off the first path
  -- segment, which is the couple id, so this is exactly their folder.
  delete from storage.objects
  where bucket_id = 'couple-media' and name like cid::text || '/%';

  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'couple_id'
      and tb.table_type = 'BASE TABLE'
      -- profiles is a person, not content: unlinked below, never deleted here.
      and c.table_name <> 'profiles'
  loop
    execute format('delete from public.%I where couple_id = $1', t) using cid;
  end loop;
end;
$$;

revoke all on function private.purge_couple(uuid) from public, authenticated, anon;

-- ---------------------------------------------------------------------------

create or replace function public.wipe_couple_data(confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
begin
  if confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm.';
  end if;
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  perform private.purge_couple(cid);
  -- The space itself survives: same invite code, same anniversary, empty.
end;
$$;

/**
 * Destroy the shared space. Both people keep their logins and can pair again,
 * with each other or not.
 *
 * Deliberately does not ask the partner. Consent for this lives in the
 * relationship, not in a database check — and a check would only mean the
 * person who wanted out could not leave.
 */
create or replace function public.delete_couple(confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
begin
  if confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm.';
  end if;
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  perform private.purge_couple(cid);

  -- Unlink everyone first: profiles.couple_id is ON DELETE SET NULL, but doing
  -- it explicitly keeps joined_at from being left behind pointing at nothing.
  update public.profiles
  set couple_id = null, joined_at = null, updated_at = now()
  where couple_id = cid;

  delete from public.couples where id = cid;
end;
$$;

/**
 * Delete your account.
 *
 * This takes the shared space with it. Half a two-person space is not a
 * meaningful thing to leave behind, and the alternative — cascading from your
 * profile — would quietly delete your half of their memories while pretending
 * the space survived. Better to say plainly that it all goes.
 *
 * Deleting the auth user cascades to profiles, which ends the session.
 */
create or replace function public.delete_my_account(confirm text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  me uuid := auth.uid();
begin
  if confirm is distinct from 'DELETE' then
    raise exception 'Type DELETE to confirm.';
  end if;
  if me is null then
    raise exception 'Not signed in.';
  end if;

  if cid is not null then
    perform private.purge_couple(cid);
    update public.profiles
    set couple_id = null, joined_at = null, updated_at = now()
    where couple_id = cid;
    delete from public.couples where id = cid;
  end if;

  delete from public.device_tokens where user_id = me;
  delete from auth.users where id = me;
end;
$$;

grant execute on function public.wipe_couple_data(text) to authenticated;
grant execute on function public.delete_couple(text) to authenticated;
grant execute on function public.delete_my_account(text) to authenticated;
