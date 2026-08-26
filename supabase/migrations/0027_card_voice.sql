-- ============================================================================
-- 0027_card_voice.sql — the Dare deck asks for voice notes; let it have them
-- ============================================================================
-- Several dares say "record a voice note" out loud, and there was no recorder
-- on the screen. You could only type that you had done it somewhere else.
--
-- The recorder already exists for the Vault, so this is only the column to put
-- the result in.

alter table public.card_plays
  add column if not exists voice_path text;

-- A recorded answer counts as a response even when nothing was typed, so it
-- reaches Memories like a written one. memories() checks response is not null,
-- so this fills it in rather than adding a branch there.
create or replace function public.card_play_voice_response()
returns trigger
language plpgsql
as $$
begin
  if new.voice_path is not null and nullif(trim(coalesce(new.response, '')), '') is null then
    new.response := '🎙️ Voice note';
  end if;
  return new;
end;
$$;

drop trigger if exists card_plays_voice on public.card_plays;
create trigger card_plays_voice
  before insert or update on public.card_plays
  for each row execute function public.card_play_voice_response();
