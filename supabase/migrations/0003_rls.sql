-- ============================================================================
-- 0003_rls.sql — row level security
-- ============================================================================
-- Privacy is not a UI decision here. Every policy below reduces to "is this row
-- in my couple", enforced by Postgres before a row ever reaches a client. Even
-- with the anon key and a raw REST call, there is no query either of you can
-- write that returns the other couple's data — or, for the vault, a letter that
-- has not opened yet.

alter table public.couples          enable row level security;
alter table public.profiles         enable row level security;
alter table public.question_bank    enable row level security;
alter table public.daily_questions  enable row level security;
alter table public.daily_answers    enable row level security;
alter table public.card_decks       enable row level security;
alter table public.cards            enable row level security;
alter table public.card_plays       enable row level security;
alter table public.love_notes       enable row level security;
alter table public.milestones       enable row level security;
alter table public.milestone_media  enable row level security;
alter table public.vault_items      enable row level security;
alter table public.vault_contents   enable row level security;
alter table public.nudges           enable row level security;
alter table public.streaks          enable row level security;
alter table public.achievement_defs enable row level security;
alter table public.achievements     enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.couple_stats to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------------
-- couples + profiles
-- ---------------------------------------------------------------------------

drop policy if exists couples_read on public.couples;
create policy couples_read on public.couples
  for select to authenticated
  using (id = public.current_couple_id());

drop policy if exists couples_update on public.couples;
create policy couples_update on public.couples
  for update to authenticated
  using (id = public.current_couple_id())
  with check (id = public.current_couple_id());

-- No insert policy: couples are created only through create_couple(), which is
-- SECURITY DEFINER and validates that you are not already paired.

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (couple_id is not null and couple_id = public.current_couple_id())
  );

drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 1. daily question
-- ---------------------------------------------------------------------------

drop policy if exists question_bank_read on public.question_bank;
create policy question_bank_read on public.question_bank
  for select to authenticated using (is_active);

drop policy if exists daily_questions_all on public.daily_questions;
create policy daily_questions_all on public.daily_questions
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- The reveal. Your own answer, always. Your partner's, only once yours exists.
drop policy if exists daily_answers_read on public.daily_answers;
create policy daily_answers_read on public.daily_answers
  for select to authenticated
  using (
    couple_id = public.current_couple_id()
    and (
      author_id = auth.uid()
      or public.has_answered(daily_question_id)
    )
  );

drop policy if exists daily_answers_write on public.daily_answers;
create policy daily_answers_write on public.daily_answers
  for insert to authenticated
  with check (
    author_id = auth.uid()
    and couple_id = public.current_couple_id()
  );

drop policy if exists daily_answers_edit on public.daily_answers;
create policy daily_answers_edit on public.daily_answers
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. cards
-- ---------------------------------------------------------------------------

drop policy if exists card_decks_read on public.card_decks;
create policy card_decks_read on public.card_decks
  for select to authenticated
  using (couple_id is null or couple_id = public.current_couple_id());

drop policy if exists card_decks_write on public.card_decks;
create policy card_decks_write on public.card_decks
  for insert to authenticated
  with check (couple_id = public.current_couple_id());

drop policy if exists card_decks_modify on public.card_decks;
create policy card_decks_modify on public.card_decks
  for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists card_decks_delete on public.card_decks;
create policy card_decks_delete on public.card_decks
  for delete to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists cards_read on public.cards;
create policy cards_read on public.cards
  for select to authenticated
  using (couple_id is null or couple_id = public.current_couple_id());

drop policy if exists cards_write on public.cards;
create policy cards_write on public.cards
  for insert to authenticated
  with check (couple_id = public.current_couple_id());

drop policy if exists cards_modify on public.cards;
create policy cards_modify on public.cards
  for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists cards_delete on public.cards;
create policy cards_delete on public.cards
  for delete to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists card_plays_all on public.card_plays;
create policy card_plays_all on public.card_plays
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- 3. love notes
-- ---------------------------------------------------------------------------

drop policy if exists love_notes_read on public.love_notes;
create policy love_notes_read on public.love_notes
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists love_notes_write on public.love_notes;
create policy love_notes_write on public.love_notes
  for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

-- Only the author edits the words. Pinning and marking-as-read go through the
-- RPCs below so your partner can act on a note without being able to rewrite it.
drop policy if exists love_notes_edit on public.love_notes;
create policy love_notes_edit on public.love_notes
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists love_notes_delete on public.love_notes;
create policy love_notes_delete on public.love_notes
  for delete to authenticated
  using (author_id = auth.uid());

create or replace function public.mark_note_read(note uuid)
returns public.love_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.love_notes;
begin
  update public.love_notes
     set read_at = coalesce(read_at, now())
   where id = note
     and couple_id = public.current_couple_id()
     and author_id <> auth.uid()
   returning * into result;

  return result;
end;
$$;

create or replace function public.toggle_note_pin(note uuid)
returns public.love_notes
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.love_notes;
begin
  update public.love_notes
     set is_pinned = not is_pinned, updated_at = now()
   where id = note
     and couple_id = public.current_couple_id()
   returning * into result;

  if result.id is null then
    raise exception 'No such note.';
  end if;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. timeline
-- ---------------------------------------------------------------------------

drop policy if exists milestones_all on public.milestones;
create policy milestones_all on public.milestones
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

drop policy if exists milestone_media_all on public.milestone_media;
create policy milestone_media_all on public.milestone_media
  for all to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

-- ---------------------------------------------------------------------------
-- 5. vault
-- ---------------------------------------------------------------------------

-- Teasers are visible to both of you: you can see that something is waiting,
-- what it is called, and when it opens.
drop policy if exists vault_items_read on public.vault_items;
create policy vault_items_read on public.vault_items
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists vault_items_write on public.vault_items;
create policy vault_items_write on public.vault_items
  for insert to authenticated
  with check (author_id = auth.uid() and couple_id = public.current_couple_id());

drop policy if exists vault_items_delete on public.vault_items;
create policy vault_items_delete on public.vault_items
  for delete to authenticated
  using (author_id = auth.uid());

-- No update policy. unlocked_at moves only through unlock_vault_item(), which
-- checks that you are the recipient and that the date has actually arrived.

-- The contents. This is the policy that makes the vault a vault.
drop policy if exists vault_contents_read on public.vault_contents;
create policy vault_contents_read on public.vault_contents
  for select to authenticated
  using (
    exists (
      select 1 from public.vault_items v
      where v.id = vault_contents.item_id
        and v.couple_id = public.current_couple_id()
        and (
          v.author_id = auth.uid()                -- you can reread what you wrote
          or (v.recipient_id = auth.uid() and public.vault_is_unlocked(v.id))
        )
    )
  );

drop policy if exists vault_contents_write on public.vault_contents;
create policy vault_contents_write on public.vault_contents
  for insert to authenticated
  with check (
    exists (
      select 1 from public.vault_items v
      where v.id = vault_contents.item_id and v.author_id = auth.uid()
    )
  );

drop policy if exists vault_contents_edit on public.vault_contents;
create policy vault_contents_edit on public.vault_contents
  for update to authenticated
  using (
    exists (
      select 1 from public.vault_items v
      where v.id = vault_contents.item_id and v.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.vault_items v
      where v.id = vault_contents.item_id and v.author_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. nudges
-- ---------------------------------------------------------------------------

drop policy if exists nudges_read on public.nudges;
create policy nudges_read on public.nudges
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists nudges_write on public.nudges;
create policy nudges_write on public.nudges
  for insert to authenticated
  with check (sender_id = auth.uid() and couple_id = public.current_couple_id());

-- Marking a nudge seen is the receiver's action, so update is couple-wide.
drop policy if exists nudges_seen on public.nudges;
create policy nudges_seen on public.nudges
  for update to authenticated
  using (couple_id = public.current_couple_id())
  with check (couple_id = public.current_couple_id());

create or replace function public.send_nudge(nudge_kind text, note text default null)
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

  insert into public.nudges (couple_id, sender_id, kind, message)
  values (cid, auth.uid(), nudge_kind, nullif(trim(note), ''))
  returning * into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. streaks + achievements
-- ---------------------------------------------------------------------------

drop policy if exists streaks_read on public.streaks;
create policy streaks_read on public.streaks
  for select to authenticated
  using (couple_id = public.current_couple_id());

drop policy if exists achievement_defs_read on public.achievement_defs;
create policy achievement_defs_read on public.achievement_defs
  for select to authenticated using (true);

drop policy if exists achievements_read on public.achievements;
create policy achievements_read on public.achievements
  for select to authenticated
  using (couple_id = public.current_couple_id());

-- streaks and achievements are written only by bump_streak() and
-- sync_achievements(), both SECURITY DEFINER.
