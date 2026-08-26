-- ============================================================================
-- 0035_compliment_photo.sql — which picture it was about
-- ============================================================================
-- Compliments are mostly sent from a photo — you say it because you are
-- looking at them. But nothing recorded which photo, so an hour later the
-- history was a list of sentences with no subject: "that leg is not sexy
-- pleaseeee" about, at this distance, nothing at all.
--
-- The same shape messages already use for a reply to a moment.

alter table public.compliments
  add column if not exists moment_id uuid
    references public.moments (id) on delete set null;

comment on column public.compliments.moment_id is
  'The photo it was said about, if it was said about one. Nulled rather than '
  'deleted with the photo, so the words outlive the picture.';

-- ---------------------------------------------------------------------------

/**
 * send_compliment, now carrying the photo.
 *
 * Replaced rather than overloaded, following send_message: a second signature
 * would leave the old three-argument version callable, and a stale client
 * would keep silently dropping the link.
 */
drop function if exists public.send_compliment(text, text, text);

create or replace function public.send_compliment(
  compliment_kind text,
  compliment_body text,
  compliment_emoji text default '💕',
  about_moment uuid default null
)
returns public.compliments
language plpgsql
security definer
set search_path = public
as $$
declare
  cid uuid := public.current_couple_id();
  result public.compliments;
begin
  if cid is null then
    raise exception 'You are not paired yet.';
  end if;

  if nullif(trim(compliment_body), '') is null then
    raise exception 'Say something first.';
  end if;

  -- Guard the reference rather than trusting the client: a moment id from
  -- another couple would otherwise be readable through the join.
  if about_moment is not null and not exists (
    select 1 from public.moments m where m.id = about_moment and m.couple_id = cid
  ) then
    raise exception 'That moment is not yours.';
  end if;

  insert into public.compliments (couple_id, author_id, kind, emoji, body, moment_id)
  values (cid, auth.uid(), compliment_kind, compliment_emoji, trim(compliment_body), about_moment)
  returning * into result;

  return result;
end;
$$;

grant execute on function public.send_compliment(text, text, text, uuid) to authenticated;
