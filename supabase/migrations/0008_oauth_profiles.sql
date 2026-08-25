-- ============================================================================
-- 0008_oauth_profiles.sql — make profiles work for OAuth sign-ups
-- ============================================================================
-- The original trigger only knew about `display_name`, which is what the
-- email/password form sends. Google sends `full_name` / `name` and `picture`
-- instead, so a Google sign-up would land as "estherolukorede12" with no
-- avatar. This teaches it every shape it might receive.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  chosen_name text;
  chosen_avatar text;
begin
  -- Most specific first: what the user typed, then what the provider gave us,
  -- then the local part of the email as a last resort.
  chosen_name := coalesce(
    nullif(trim(meta ->> 'display_name'), ''),
    nullif(trim(meta ->> 'full_name'), ''),
    nullif(trim(meta ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'You'
  );

  -- Google calls it `picture`; most other providers use `avatar_url`.
  chosen_avatar := coalesce(
    nullif(trim(meta ->> 'avatar_url'), ''),
    nullif(trim(meta ->> 'picture'), '')
  );

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, chosen_name, chosen_avatar)
  on conflict (id) do update
    set display_name = case
          -- Never overwrite a name the user has actually chosen.
          when public.profiles.display_name in ('You', '')
            or public.profiles.display_name is null
          then excluded.display_name
          else public.profiles.display_name
        end,
        avatar_url = coalesce(public.profiles.avatar_url, excluded.avatar_url);

  return new;
end;
$$;

-- Backfill: anyone who signed up before this ran and ended up with a placeholder
-- name or a missing avatar gets the provider's values applied now.
update public.profiles p
set display_name = coalesce(
      nullif(trim(u.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'name'), ''),
      p.display_name
    ),
    avatar_url = coalesce(
      p.avatar_url,
      nullif(trim(u.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(trim(u.raw_user_meta_data ->> 'picture'), '')
    ),
    updated_at = now()
from auth.users u
where u.id = p.id
  and (
    p.avatar_url is null
    or p.display_name is null
    or p.display_name = 'You'
  );
