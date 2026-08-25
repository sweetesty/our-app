-- ============================================================================
-- 0005_seed.sql — question bank, built-in decks, achievements
-- ============================================================================
-- Everything here is shared content with nothing private in it. Couples add
-- their own decks and cards on top; those carry a couple_id and never appear
-- to anyone else.

-- ---------------------------------------------------------------------------
-- Daily question bank
-- ---------------------------------------------------------------------------

insert into public.question_bank (body, category) values
  ('What''s something I did recently that made you smile?', 'general'),
  ('What''s one thing you want us to experience together?', 'general'),
  ('What was your first impression of me?', 'playful'),
  ('What''s something you''re secretly obsessed with about me? 👀', 'playful'),
  ('Where would you take me if we could disappear for 24 hours?', 'general'),
  ('What''s a small thing I do that you''d miss if I stopped?', 'deep'),
  ('What song reminds you of us?', 'playful'),
  ('What''s the last thing that made you laugh out loud?', 'general'),
  ('If you could relive one day with me, which one?', 'deep'),
  ('What do you need more of from me right now?', 'deep'),
  ('What''s something you''ve never told me but want to?', 'deep'),
  ('What does a perfect ordinary Tuesday with me look like?', 'general'),
  ('What''s one thing you''re proud of me for?', 'general'),
  ('When do you feel closest to me?', 'deep'),
  ('What''s a habit of mine you find weirdly attractive?', 'spicy'),
  ('If we had to move to another country tomorrow, where?', 'playful'),
  ('What''s something you were scared to tell me early on?', 'deep'),
  ('What''s your favourite photo of us and why?', 'general'),
  ('What''s something you want to be better at, for us?', 'deep'),
  ('What''s the most attractive non-physical thing about me?', 'general'),
  ('What''s a memory of us you replay in your head?', 'deep'),
  ('If I woke up tomorrow having forgotten everything, what would you tell me first?', 'deep'),
  ('What''s a tiny thing that would make your day easier tomorrow?', 'general'),
  ('What do you think I''m underestimating about myself?', 'deep'),
  ('What''s something you want us to stop doing?', 'deep'),
  ('What''s our funniest disaster so far?', 'playful'),
  ('What are you looking forward to most this month?', 'general'),
  ('What''s something you find hot that I''d never guess?', 'spicy'),
  ('Describe me to a stranger in three words.', 'playful'),
  ('What''s a promise you''d like us to make each other?', 'deep'),
  ('When was the last time you felt really understood by me?', 'deep'),
  ('What''s the best gift I could give you that costs nothing?', 'general'),
  ('What''s a fear you have about us that you''d like to say out loud?', 'deep'),
  ('What did you think about the first time you saw my face today?', 'playful'),
  ('What''s something you want to try together that you''ve been shy to ask?', 'spicy'),
  ('Which version of me is your favourite: morning, tired, or excited?', 'playful'),
  ('What would our life look like in five years if everything went right?', 'deep'),
  ('What''s something I said once that stuck with you?', 'deep'),
  ('What''s the pettiest thing you''ve ever been annoyed at me for?', 'playful'),
  ('What do you want me to remind you of when you forget it?', 'deep'),
  ('What''s our love language, if we had to invent one?', 'general'),
  ('What''s a place you want to kiss me?', 'spicy'),
  ('What''s something about our relationship you''d never change?', 'general'),
  ('What''s the hardest thing you''ve gone through since we met?', 'deep'),
  ('If you had to describe today in one sentence, what would it be?', 'general'),
  ('What''s something you''re grateful for right now, big or small?', 'general'),
  ('What''s a way I could surprise you this week?', 'general'),
  ('What''s the thing you''d most want us to be known for?', 'deep'),
  ('What''s a boundary you want me to respect more?', 'deep'),
  ('What''s the sweetest thing I''ve ever done without realising?', 'general')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Built-in decks (couple_id is null = available to everyone)
-- ---------------------------------------------------------------------------

insert into public.card_decks (couple_id, slug, name, emoji, description, accent, sort_order) values
  (null, 'love',        'Love',         '💕', 'The soft ones. Say the thing out loud.',            '#E8879B', 10),
  (null, 'inside_joke', 'Inside Jokes', '😂', 'Empty on purpose. Fill it with what only you two understand.', '#F0B429', 20),
  (null, 'spicy',       'Spicy',        '🔥', 'Flirty, warm, a little dangerous.',                 '#D65A5A', 30),
  (null, 'dare',        'Dare',         '🎭', 'Small challenges. Do them now, not later.',         '#5FA8A0', 40),
  (null, 'deep',        'Deep',         '🫶', 'Fears, dreams, the future, the hard conversations.', '#7C7BC4', 50)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Built-in cards
-- ---------------------------------------------------------------------------

with deck as (select id, slug from public.card_decks where couple_id is null)
insert into public.cards (deck_id, couple_id, body, kind)
select d.id, null, v.body, v.kind
from (values
  -- 💕 Love
  ('love', 'Tell me three things you love about me.', 'question'),
  ('love', 'What moment made you realise you were falling for me?', 'question'),
  ('love', 'What''s the first thing you noticed about me?', 'question'),
  ('love', 'Describe the exact moment you knew you wanted this.', 'question'),
  ('love', 'What do I do that makes you feel safe?', 'question'),
  ('love', 'Finish this: "I never expected you to be so..."', 'question'),
  ('love', 'What would you write on the first page of a book about us?', 'question'),
  ('love', 'What''s something you love about us that other people don''t see?', 'question'),
  ('love', 'When did you last feel proud to be with me?', 'question'),
  ('love', 'What''s a version of me you fell for that I''ve forgotten about?', 'question'),

  -- 🔥 Spicy
  ('spicy', 'What''s the most attractive thing I''ve done without meaning to?', 'question'),
  ('spicy', 'Describe your favourite thing about the way I look right now.', 'question'),
  ('spicy', 'What''s something you''ve thought about but never said out loud?', 'question'),
  ('spicy', 'What do you want more of?', 'question'),
  ('spicy', 'What outfit of mine lives in your head rent-free?', 'question'),
  ('spicy', 'Tell me what you were thinking the last time you went quiet.', 'question'),
  ('spicy', 'What''s a fantasy you''d want to try together?', 'question'),
  ('spicy', 'Where''s the best place I''ve ever kissed you?', 'question'),
  ('spicy', 'What''s the fastest way to get my attention?', 'question'),
  ('spicy', 'Send a voice note saying the last thing you wanted to say but didn''t.', 'dare'),

  -- 🎭 Dare
  ('dare', 'Send me a voice note saying something you''d be too shy to text.', 'dare'),
  ('dare', 'Recreate our first conversation from memory.', 'dare'),
  ('dare', 'Send me the ugliest selfie you can take right now. 😂', 'dare'),
  ('dare', 'Text me the first thing you thought when you woke up today.', 'dare'),
  ('dare', 'Sing eight seconds of our song. Voice note. No editing.', 'dare'),
  ('dare', 'Take a photo of whatever is directly in front of you and send it.', 'dare'),
  ('dare', 'Write me a two-line poem in under sixty seconds.', 'dare'),
  ('dare', 'Do your best impression of me. Video. Go.', 'dare'),
  ('dare', 'Send a screenshot of your most recent photo, no matter what it is.', 'dare'),
  ('dare', 'Say "I love you" in the most ridiculous voice you can manage.', 'dare'),

  -- 🫶 Deep
  ('deep', 'What are you most afraid of losing?', 'question'),
  ('deep', 'What does home mean to you now?', 'question'),
  ('deep', 'What''s something you''re still healing from?', 'question'),
  ('deep', 'How do you want to be comforted when you''re low? Be specific.', 'question'),
  ('deep', 'What do you need me to understand about how you argue?', 'question'),
  ('deep', 'What does a good life look like to you in ten years?', 'question'),
  ('deep', 'What''s a promise you''ve made to yourself?', 'question'),
  ('deep', 'When was the last time you felt truly alone, and what helped?', 'question'),
  ('deep', 'What would you want said about us if someone told our story?', 'question'),
  ('deep', 'What''s one thing we handle badly that you want us to get better at?', 'question'),
  ('deep', 'What do you want from me that you''ve been afraid to ask for?', 'question'),
  ('deep', 'What''s a part of yourself you''re still learning to show me?', 'question')
) as v(deck_slug, body, kind)
join deck d on d.slug = v.deck_slug
on conflict do nothing;

-- Inside Jokes ships empty by design — the whole point is that you write it.

-- ---------------------------------------------------------------------------
-- Achievements
-- ---------------------------------------------------------------------------

insert into public.achievement_defs (slug, name, emoji, description, metric, target, sort_order) values
  ('first_ten_questions', 'First 10 Questions', '🏆', 'Answered ten daily questions between you.',      'answers_given',   10, 10),
  ('fifty_love_notes',    '50 Love Notes',      '💌', 'Fifty notes left on the wall.',                  'notes_written',   50, 20),
  ('twenty_five_cards',   '25 Cards Played',    '🃏', 'Twenty-five cards drawn and answered.',          'cards_played',    25, 30),
  ('ten_memories',        '10 Memories',        '📸', 'Ten moments added to the timeline.',             'memories_added',  10, 40),
  ('seven_spicy',         '7 Spicy Answered',   '🔥', 'Seven cards from the Spicy deck.',               'spicy_played',     7, 50),
  ('week_streak',         'A Week of Us',       '🗓️', 'Seven days in a row, both of you answering.',   'current_streak',   7, 60),
  ('month_streak',        'A Month of Us',      '🌙', 'Thirty days in a row.',                          'current_streak',  30, 70),
  ('hundred_streak',      'One Hundred Days',   '💯', 'A hundred consecutive days.',                    'longest_streak', 100, 80),
  ('first_vault',         'Something Waiting',  '🔒', 'Left the first letter in the vault.',            'vault_items',      1, 90),
  ('five_vault',          'Time Capsules',      '⏳', 'Five sealed letters between you.',               'vault_items',      5, 100),
  ('hundred_nudges',      '100 Little Nudges',  '🫂', 'A hundred taps of "I''m thinking about you".',   'nudges_sent',    100, 110)
on conflict (slug) do update
  set name = excluded.name,
      emoji = excluded.emoji,
      description = excluded.description,
      metric = excluded.metric,
      target = excluded.target,
      sort_order = excluded.sort_order;
