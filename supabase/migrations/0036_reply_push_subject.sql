-- ============================================================================
-- 0036_reply_push_subject.sql — say which note they answered
-- ============================================================================
-- The reply notification carried the words but not what they were about, so a
-- lock screen reading "you're right, I'm sorry" gave no clue which of five
-- notes it belonged to. The subject is the half you cannot reconstruct.
--
-- This also re-creates the trigger. It was the last statement in 0034, which
-- is exactly the position a half-run migration leaves out — if replies were
-- saving but never announcing themselves, this is the line that was missing.

create or replace function public.on_reply_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  author_name text;
  subject text;
begin
  select display_name into author_name
  from public.profiles where id = new.author_id;

  -- What they answered. A note prefers its title, because that is the sentence
  -- the author chose; the category is only a fallback for an untitled one.
  if new.target_kind = 'note' then
    select coalesce(
      nullif(trim(n.title), ''),
      case n.mood
        when 'miss_me'     then 'When you miss me'
        when 'sad'         then 'When you''re sad'
        when 'angry'       then 'When you''re angry with me'
        when 'reassurance' then 'When you need reassurance'
        when 'happy'       then 'When you''re happy'
        when 'sorry'       then 'I''m sorry'
        when 'proud'       then 'Proud of you'
        when 'anniversary' then 'For a milestone'
        else 'Just because'
      end
    )
    into subject
    from public.love_notes n
    where n.id = new.target_id;

  elsif new.target_kind = 'vault' then
    -- The label, even on a surprise: it has been opened by the time anyone can
    -- reply to it, so there is nothing left to give away.
    select v.label into subject
    from public.vault_items v
    where v.id = new.target_id;

  elsif new.target_kind = 'compliment' then
    select c.body into subject
    from public.compliments c
    where c.id = new.target_id;
  end if;

  perform public.dispatch_push(jsonb_build_object(
    'type', 'reply',
    'couple_id', new.couple_id,
    'sender_id', new.author_id,
    'sender_name', coalesce(author_name, 'They'),
    -- Which screen the notification opens.
    'kind', new.target_kind,
    -- What they replied to.
    'label', subject,
    -- And what they said.
    'message', new.body
  ));

  return new;
end;
$$;

drop trigger if exists replies_push on public.replies;
create trigger replies_push
  after insert on public.replies
  for each row execute function public.on_reply_push();
