-- ============================================================================
-- 0040_more_cards.sql — refilling the decks
-- ============================================================================
-- Ten cards each in Love, Spicy and Dare, twelve in Deep. Forty-two in total
-- for a game you play most nights — the decks were showing "you've played
-- every card in here" inside a fortnight, and an empty deck is a dead screen.
--
-- Roughly four times as many again. `on conflict do nothing` is not enough on
-- its own here (there is no unique constraint on a card's words), so the insert
-- filters on what is already there and this file can be run twice without
-- doubling anything.

with deck as (select id, slug from public.card_decks where couple_id is null)
insert into public.cards (deck_id, couple_id, body, kind)
select d.id, null, v.body, v.kind
from (values
  -- 💕 Love ------------------------------------------------------------------
  ('love', 'What''s something I do that you''ve never told me you love?', 'question'),
  ('love', 'When do I look most like myself to you?', 'question'),
  ('love', 'What did you think of me the first week, honestly?', 'question'),
  ('love', 'Which of our ordinary days would you live again?', 'question'),
  ('love', 'What do you tell other people about me when I''m not there?', 'question'),
  ('love', 'What''s the kindest thing I''ve done for you that I''ve probably forgotten?', 'question'),
  ('love', 'When did you last feel properly chosen by me?', 'question'),
  ('love', 'What sound or smell makes you think of me?', 'question'),
  ('love', 'What do you hope I never change?', 'question'),
  ('love', 'Which photo of us would you keep if you only got one?', 'question'),
  ('love', 'What''s something small I could do this week that would mean a lot?', 'question'),
  ('love', 'When do you miss me most in a normal day?', 'question'),
  ('love', 'What''s a version of us five years from now you''d be happy with?', 'question'),
  ('love', 'What did you almost say to me once but didn''t?', 'question'),
  ('love', 'Which of my habits have you quietly picked up?', 'question'),
  ('love', 'What makes you feel safest with me?', 'question'),
  ('love', 'What''s the best thing I''ve ever said to you?', 'question'),
  ('love', 'If you had to describe us in one sentence to a stranger, what is it?', 'question'),
  ('love', 'What do I underestimate about myself?', 'question'),
  ('love', 'What''s a moment you replay when you''re missing me?', 'question'),
  ('love', 'When was the last time I surprised you?', 'question'),
  ('love', 'What would you want us to do on an ordinary Tuesday, forever?', 'question'),
  ('love', 'What part of me did you not expect to fall for?', 'question'),
  ('love', 'What''s something you''ve forgiven me for without ever bringing it up?', 'question'),
  ('love', 'Which song has become ours without us deciding it?', 'question'),
  ('love', 'What do you want me to say to you more often?', 'question'),
  ('love', 'When did you know you''d tell people about me?', 'question'),
  ('love', 'What does a good day with me look like, start to finish?', 'question'),
  ('love', 'What have I taught you without meaning to?', 'question'),
  ('love', 'What''s the thing you''d miss first if I went away for a month?', 'question'),

  -- 🔥 Spicy -----------------------------------------------------------------
  ('spicy', 'What were you thinking the first time you wanted to kiss me?', 'question'),
  ('spicy', 'What''s something you want more of and haven''t asked for?', 'question'),
  ('spicy', 'Which outfit of mine do you think about?', 'question'),
  ('spicy', 'Where''s the boldest place you''d want to kiss me?', 'question'),
  ('spicy', 'What''s the most attractive thing I do without trying?', 'question'),
  ('spicy', 'Describe the last time you couldn''t stop looking at me.', 'question'),
  ('spicy', 'What would you do if we had the house to ourselves right now?', 'question'),
  ('spicy', 'What''s a fantasy you''ve had that involves me and a bad idea?', 'question'),
  ('spicy', 'Which part of me do you notice first, every time?', 'question'),
  ('spicy', 'What''s the best kiss we''ve ever had, and where?', 'question'),
  ('spicy', 'What do you want whispered to you?', 'question'),
  ('spicy', 'Tell me something you''ve thought about me but never said out loud.', 'question'),
  ('spicy', 'What''s something I did once that you want me to do again?', 'question'),
  ('spicy', 'Slow and quiet, or nowhere near quiet?', 'question'),
  ('spicy', 'What would you want our first hour together after a week apart to be?', 'question'),
  ('spicy', 'What''s the most you''ve ever wanted me?', 'question'),
  ('spicy', 'What''s one rule you''d like us to break?', 'question'),
  ('spicy', 'What compliment about your body do you want to hear from me?', 'question'),
  ('spicy', 'Which text I''ve sent you did you read more than once?', 'question'),
  ('spicy', 'What''s the last thing that made you blush because of me?', 'question'),
  ('spicy', 'Who''s in charge tonight, and why is it you?', 'question'),
  ('spicy', 'What would you do if I turned up at yours unannounced?', 'question'),
  ('spicy', 'What''s something you find sexy that has nothing to do with looks?', 'question'),
  ('spicy', 'Where should we never have tried it — and where should we try next?', 'question'),
  ('spicy', 'What''s the one thing that always works on you?', 'question'),

  -- 🎭 Dare ------------------------------------------------------------------
  ('dare', 'Send me a voice note saying the thing you find hardest to say.', 'dare'),
  ('dare', 'Text me the most embarrassing photo on your phone right now.', 'dare'),
  ('dare', 'Say three things you like about yourself, out loud, no hedging.', 'dare'),
  ('dare', 'Record yourself singing eight seconds of our song.', 'dare'),
  ('dare', 'Write me a one-line love note and put it in the Vault for next month.', 'dare'),
  ('dare', 'Describe me to a stranger in ten words. Say them now.', 'dare'),
  ('dare', 'Do your best impression of me for fifteen seconds.', 'dare'),
  ('dare', 'Send a photo of exactly what you can see right now.', 'dare'),
  ('dare', 'Tell me one thing you''ve been putting off saying.', 'dare'),
  ('dare', 'Plan our next date out loud, start to finish, in under a minute.', 'dare'),
  ('dare', 'Read the last message you nearly sent me and deleted.', 'dare'),
  ('dare', 'Give me a compliment you''d be shy to say in public.', 'dare'),
  ('dare', 'Record a voice note for me to open on a bad day.', 'dare'),
  ('dare', 'Show me your camera roll from exactly a year ago.', 'dare'),
  ('dare', 'Say sorry for something you never properly apologised for.', 'dare'),
  ('dare', 'Set a reminder right now to do something for me this week. Tell me when it''s set.', 'dare'),
  ('dare', 'Describe our first date from memory. No checking.', 'dare'),
  ('dare', 'Tell me the nickname you use for me in your head.', 'dare'),
  ('dare', 'Send me a selfie doing whatever your face is doing right now.', 'dare'),
  ('dare', 'Say something in your first language that you mean about me.', 'dare'),
  ('dare', 'Name one thing you want to change about us, then one way to start.', 'dare'),
  ('dare', 'Record thirty seconds of what your day sounded like today.', 'dare'),
  ('dare', 'Tell me a secret you''ve never told anybody at all.', 'dare'),
  ('dare', 'Write the caption you''d put on a photo of us, and read it to me.', 'dare'),
  ('dare', 'Pick a moment from today and tell it back like a story.', 'dare'),

  -- 🫶 Deep ------------------------------------------------------------------
  ('deep', 'What are you most afraid of losing?', 'question'),
  ('deep', 'What did you need as a child that you didn''t get?', 'question'),
  ('deep', 'What do you do when you''re hurt that I might be reading wrong?', 'question'),
  ('deep', 'What does home mean to you now, and is it a place?', 'question'),
  ('deep', 'What are you carrying at the moment that you haven''t put down?', 'question'),
  ('deep', 'What would you do with a year where money didn''t matter?', 'question'),
  ('deep', 'Which of your parents do you see in yourself, and how do you feel about it?', 'question'),
  ('deep', 'What''s a belief you''ve changed your mind about?', 'question'),
  ('deep', 'When do you feel most yourself?', 'question'),
  ('deep', 'What would make you feel properly proud of your life?', 'question'),
  ('deep', 'What''s the hardest thing you''ve survived?', 'question'),
  ('deep', 'What do you need from me when you go quiet?', 'question'),
  ('deep', 'What are we avoiding talking about?', 'question'),
  ('deep', 'What does forgiveness actually look like to you?', 'question'),
  ('deep', 'What do you want your thirties — or forties — to be about?', 'question'),
  ('deep', 'Where do you want to be living in five years, honestly?', 'question'),
  ('deep', 'What would a hard year test in us first?', 'question'),
  ('deep', 'What do you want me to do if we fight and you shut down?', 'question'),
  ('deep', 'What does money mean in your family, and what does it mean to you?', 'question'),
  ('deep', 'What are you still angry about?', 'question'),
  ('deep', 'What would you want our children to know about us?', 'question'),
  ('deep', 'What''s a fear about us you''ve never said out loud?', 'question'),
  ('deep', 'Who are you when nobody is watching?', 'question'),
  ('deep', 'What do you think I need that I''ve never asked you for?', 'question'),
  ('deep', 'What would you want at the end of a very long life?', 'question'),
  ('deep', 'What''s the kindest thing anybody has ever done for you?', 'question'),
  ('deep', 'What do you want us to be better at a year from now?', 'question'),
  ('deep', 'What part of your day do you wish I could see?', 'question'),
  ('deep', 'What do you think we''re building?', 'question'),
  ('deep', 'What would you tell yourself the week before we met?', 'question')
) as v(deck_slug, body, kind)
join deck d on d.slug = v.deck_slug
-- Runnable twice. A card is the same card if it's the same words in the same
-- deck; there is no constraint saying so, so the check lives here.
where not exists (
  select 1 from public.cards c
  where c.deck_id = d.id and c.body = v.body
)
on conflict do nothing;
