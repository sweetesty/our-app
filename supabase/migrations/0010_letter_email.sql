-- ============================================================================
-- 0010_letter_email.sql — optionally deliver a sealed letter by email
-- ============================================================================
-- Emailing is opt-in per letter, not a global setting, and deliberately so.
-- Everything in this app is behind row-level security; an email is not. It
-- lands in a mailbox that syncs to every device the recipient has ever signed
-- into and stays there forever. That is a fine trade for "open on your
-- birthday" and a poor one for "open when you miss me" — so the choice is made
-- per letter, at the moment of writing it.

alter table public.vault_items
  add column if not exists email_on_unlock boolean not null default false;

comment on column public.vault_items.email_on_unlock is
  'Author opted to also send this letter by email when it unlocks.';

alter table public.vault_items
  add column if not exists emailed_at timestamptz;

-- Where to reach the email function. Same table as the push config so there is
-- one place holding callable endpoints, and it stays unreadable to clients.
alter table private.push_config
  add column if not exists email_function_url text;

-- ---------------------------------------------------------------------------
-- dispatch
-- ---------------------------------------------------------------------------

create or replace function public.dispatch_email(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  cfg private.push_config;
begin
  select * into cfg from private.push_config where enabled limit 1;

  if cfg.email_function_url is null then
    return;   -- email not configured; silently skip
  end if;

  perform net.http_post(
    url     := cfg.email_function_url,
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || cfg.service_role_key
               ),
    body    := payload,
    timeout_milliseconds := 8000
  );
exception
  when others then
    raise warning 'email dispatch failed: %', sqlerrm;
end;
$$;

-- ---------------------------------------------------------------------------
-- fold it into the unlock job
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
      and v.unlocked_at is null
      and v.notified_at is null
    order by v.unlock_at
    limit 20
  loop
    select display_name into author_name
    from public.profiles where id = item.author_id;

    perform public.dispatch_push(jsonb_build_object(
      'type', 'vault',
      'couple_id', item.couple_id,
      'sender_id', item.author_id,
      'sender_name', coalesce(author_name, 'They'),
      'label', item.label
    ));

    if item.email_on_unlock and item.emailed_at is null then
      perform public.dispatch_email(jsonb_build_object(
        'item_id', item.id,
        'reason', 'unlocked'
      ));

      update public.vault_items set emailed_at = now() where id = item.id;
    end if;

    update public.vault_items set notified_at = now() where id = item.id;
    count_sent := count_sent + 1;
  end loop;

  return count_sent;
end;
$$;

-- ---------------------------------------------------------------------------
-- "email me a copy" — the recipient asking, after the fact
-- ---------------------------------------------------------------------------

create or replace function public.email_vault_item(item uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.vault_items;
begin
  select * into target from public.vault_items v where v.id = item;

  if target.id is null or target.couple_id is distinct from public.current_couple_id() then
    raise exception 'No such item.';
  end if;

  -- Only the two people it concerns, and only once it is genuinely open. This
  -- must never become a way to read a sealed letter early via your inbox.
  if auth.uid() not in (target.author_id, target.recipient_id) then
    raise exception 'Not yours.';
  end if;

  if not public.vault_is_unlocked(target.id) then
    raise exception 'This one has not opened yet.';
  end if;

  perform public.dispatch_email(jsonb_build_object(
    'item_id', target.id,
    'reason', 'requested',
    'to_user_id', auth.uid()
  ));
end;
$$;

grant execute on function public.email_vault_item(uuid) to authenticated;
revoke execute on function public.dispatch_email(jsonb) from anon, authenticated;
