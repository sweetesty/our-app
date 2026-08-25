-- ============================================================================
-- 0011_leave_couple.sql — let someone undo a mis-pair
-- ============================================================================
-- A new user who has an invite code can still end up tapping "open a new
-- space", which lands them alone in a space of their own. join_couple() then
-- refuses, because they are already paired, and there was no way out without
-- an admin editing the database. That is a dead end reached by one wrong tap.

create or replace function public.leave_couple()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  others int;
begin
  if cid is null then
    return;   -- nothing to leave
  end if;

  select count(*) into others
  from public.profiles p
  where p.couple_id = cid and p.id <> auth.uid();

  -- Refuse to walk out of a space that has a partner and history in it. That
  -- is a different, much heavier action than undoing a mis-tap, and it should
  -- not hide behind the same button.
  if others > 0 then
    raise exception 'This space has both of you in it. Ask your partner first.';
  end if;

  update public.profiles
  set couple_id = null, joined_at = null, updated_at = now()
  where id = auth.uid();

  -- The space is now empty, so remove it rather than leaving orphans and
  -- burning invite codes. Cascades clear anything written in the meantime.
  delete from public.couples c where c.id = cid;
end;
$$;

comment on function public.leave_couple is
  'Leaves and deletes an empty space, so a wrong tap on the pairing screen can be undone. Refuses if a partner has already joined.';

grant execute on function public.leave_couple() to authenticated;

-- ---------------------------------------------------------------------------
-- "they're in" — tell the person who was waiting
-- ---------------------------------------------------------------------------
-- Nothing announced a partner joining, so whoever created the space sat on a
-- waiting screen with no idea it had happened. This is the first moment the
-- app is actually two people; it deserves a notification.

create or replace function public.on_partner_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  joiner_name text;
begin
  -- Only when someone moves from unpaired into a space.
  if new.couple_id is null or old.couple_id is not distinct from new.couple_id then
    return new;
  end if;

  select display_name into joiner_name
  from public.profiles where id = new.id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'joined',
    'couple_id', new.couple_id,
    -- Routed to everyone in the couple except the joiner, which is exactly the
    -- person who has been waiting.
    'sender_id', new.id,
    'sender_name', coalesce(joiner_name, new.display_name, 'They')
  ));

  return new;
end;
$$;

drop trigger if exists profiles_partner_joined on public.profiles;
create trigger profiles_partner_joined
  after update of couple_id on public.profiles
  for each row execute function public.on_partner_joined();
