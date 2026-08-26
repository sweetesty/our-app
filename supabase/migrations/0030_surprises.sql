-- ============================================================================
-- 0030_surprises.sql — a wrapped box, not a labelled envelope
-- ============================================================================
-- The Vault already holds time-locked letters, and a sealed letter tells you
-- almost everything: "Open on your birthday", counting down in plain sight.
-- That is lovely for a letter and useless for a surprise — the whole pleasure
-- of one is not knowing.
--
-- Rather than build a second feature beside the Vault, this hides what a vault
-- item shows. A surprise is the same row with its label and its timing kept
-- from the recipient until it opens.
--
-- Redaction lives in a view rather than the client, because "don't render it"
-- is not the same as "cannot read it" — the row goes over the wire either way.

alter table public.vault_items
  add column if not exists is_surprise boolean not null default false;

-- The one thing they are allowed to know. Optional, and written for them:
-- "something for the 3rd" rather than the actual label.
alter table public.vault_items
  add column if not exists teaser text;

-- ---------------------------------------------------------------------------

/**
 * The Vault as each person is allowed to see it.
 *
 * security_invoker keeps the existing RLS on vault_items in force; this only
 * blanks columns on top of it. Authors always see their own in full — you
 * cannot keep a secret from yourself, and hiding it would just make it
 * impossible to edit.
 */
create or replace view public.vault_inbox
with (security_invoker = true) as
select
  v.id,
  v.couple_id,
  v.author_id,
  v.recipient_id,
  v.is_surprise,
  v.teaser,
  v.unlock_type,
  v.unlocked_at,
  v.created_at,

  -- Hidden only while it is still sealed, and only from the recipient.
  case
    when v.is_surprise and v.recipient_id = auth.uid() and v.unlocked_at is null
    then null else v.label
  end as label,

  case
    when v.is_surprise and v.recipient_id = auth.uid() and v.unlocked_at is null
    then null else v.unlock_at
  end as unlock_at,

  case
    when v.is_surprise and v.recipient_id = auth.uid() and v.unlocked_at is null
    then null else v.unlock_condition
  end as unlock_condition,

  -- Whether it can be opened now. Computed here because the recipient cannot
  -- see unlock_at to work it out for themselves — which is the point.
  case
    when v.unlocked_at is not null then true
    when v.unlock_type = 'date' then v.unlock_at <= now()
    else false
  end as ready
from public.vault_items v;

grant select on public.vault_inbox to authenticated;

-- ---------------------------------------------------------------------------
-- push
-- ---------------------------------------------------------------------------
-- 0009's notifier announces a letter by its label. For a surprise that would
-- give away the thing it is hiding, one notification before it opens.

create or replace function public.on_vault_created_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
begin
  select display_name into author_name
  from public.profiles where id = new.author_id;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'surprise',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    -- The teaser, or nothing. Never the label.
    'message', case when new.is_surprise then new.teaser else new.label end,
    'kind', case when new.is_surprise then 'surprise' else 'letter' end
  ));

  return new;
end;
$$;

drop trigger if exists vault_items_created_push on public.vault_items;
create trigger vault_items_created_push
  after insert on public.vault_items
  for each row execute function public.on_vault_created_push();

-- 0009's hourly notifier announces a letter by its label when the date lands.
-- For a surprise that hands over the secret in a lock-screen banner, before
-- they have opened anything. Withhold the label there too.
-- Keeps `returns integer` from 0009: run_vault_notifier() calls it, and
-- Postgres refuses to replace a function whose return type changed.
create or replace function public.notify_ready_vault_items()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item record;
  author_name text;
  sent integer := 0;
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
      'label', case when item.is_surprise then null else item.label end
    ));

    update public.vault_items
    set notified_at = now()
    where id = item.id;

    sent := sent + 1;
  end loop;

  return sent;
end;
$$;
