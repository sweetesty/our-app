-- ============================================================================
-- 0043_handbook_sections.sql — the sections themselves
-- ============================================================================
-- Ninety-odd of them, in seven groups. Kept in their own migration because the
-- list is the part that will keep growing, and it should be possible to add to
-- it without touching the schema that holds it.
--
-- `scope` is the load-bearing column. A section is personal when it has two
-- independent answers and you each own yours ("Things That Hurt Me"), and
-- shared when it has one answer that belongs to both of you ("Our Boundaries").
-- Getting that wrong would either put one person's name on a joint decision or
-- merge two different people's feelings into one list.
--
-- `weight = heavy` is for the ones that must not be skimmed like the funny
-- ones. The screen styles them differently and warns before you write in them.

insert into public.handbook_sections
  (couple_id, slug, group_key, title, emoji, scope, prompt, placeholder, weight, sort_order)
values
  -- 🧠 Get to Know Us -------------------------------------------------------
  (null, 'love_about_you',    'know', 'Things I Love About You',        '❤️', 'personal', 'The things that land every time.', 'How you say my name when you''re half asleep', 'light', 10),
  (null, 'dont_like',         'know', 'Things I Don''t Like',           '🚫', 'personal', 'Foods, places, nicknames, plans. Small and specific.', 'I don''t like crowded places', 'light', 20),
  (null, 'annoy',             'know', 'Things That Annoy Me',           '😂', 'personal', 'The ones you can laugh about. Say them anyway.', 'I hate when you leave me on read', 'light', 30),
  (null, 'make_me_happy',     'know', 'Things That Make Me Happy',      '🥹', 'personal', 'The small reliable ones.', 'Voice notes instead of texts', 'light', 40),
  (null, 'make_me_sad',       'know', 'Things That Make Me Sad',        '💔', 'personal', 'Not annoyances. The ones that actually land badly.', 'Being the one who always texts first', 'heavy', 50),
  (null, 'feel_loved',        'know', 'Things That Make Me Feel Loved', '💕', 'personal', 'What it looks like when it reaches you.', 'When you remember something I only said once', 'light', 60),
  (null, 'feel_unloved',      'know', 'Things That Make Me Feel Unloved','🥀', 'personal', 'Hard to say and worth saying.', 'When I hear about your day from someone else', 'heavy', 70),
  (null, 'need_from_you',     'know', 'Things I Need From You',         '🙏', 'personal', 'Plainly. Not hints.', 'Tell me when you''re upset instead of going quiet', 'heavy', 80),
  (null, 'wish_you_knew',     'know', 'Things I Wish You Knew About Me','💭', 'personal', 'The context you''d have if you''d always known me.', 'I go quiet when I''m overwhelmed, not when I''m angry', 'light', 90),
  (null, 'cant_say_aloud',    'know', 'Things I Don''t Know How to Say Out Loud', '🤐', 'personal', 'Writing counts. That''s what this is for.', 'Sometimes I''m scared this is too good', 'heavy', 100),
  (null, 'still_learning',    'know', 'Things I''m Still Learning About You', '🔎', 'personal', 'What you''re still working out about them.', 'That you''re softer than you let on', 'light', 110),
  (null, 'in_common',         'know', 'Things We Have in Common',       '🤝', 'shared',   'The overlap.', 'Neither of us can sit through a horror film', 'light', 120),
  (null, 'different_about',   'know', 'Things We''re Completely Different About', '🙃', 'shared', 'The gaps. Useful to name before they surprise you.', 'You plan. I turn up.', 'light', 130),

  -- 🫂 Understanding Each Other ---------------------------------------------
  (null, 'when_upset',        'understand', 'When I''m Upset, I Need…',  '🫂', 'personal', 'The single most useful thing in this handbook.', 'A minute, then to be asked', 'heavy', 10),
  (null, 'when_quiet',        'understand', 'When I''m Quiet, It Usually Means…', '🤫', 'personal', 'Because silence gets read wrong more than anything else.', 'I''m tired, not annoyed', 'heavy', 20),
  (null, 'comfort_me',        'understand', 'How to Comfort Me',         '🧸', 'personal', 'What actually helps.', 'Sit next to me. Don''t fix it yet.', 'heavy', 30),
  (null, 'not_comfort_me',    'understand', 'How Not to Comfort Me',     '😂', 'personal', 'Well meant, doesn''t work.', 'Telling me to calm down', 'light', 40),
  (null, 'feel_safe',         'understand', 'What Makes Me Feel Safe',   '🕯️', 'personal', 'The conditions you''re at your best in.', 'Knowing we''ll finish the conversation', 'heavy', 50),
  (null, 'feel_insecure',     'understand', 'What Makes Me Feel Insecure','😔', 'personal', 'Honest, not accusatory.', 'Long gaps with no word', 'heavy', 60),
  (null, 'calms_me',          'understand', 'What Helps Me Calm Down',   '🌊', 'personal', 'What works once it''s already gone wrong.', 'Being held without talking', 'heavy', 70),
  (null, 'makes_worse',       'understand', 'What Makes Things Worse',   '⛔', 'personal', 'The things to stop doing first.', 'Bringing up something from months ago', 'heavy', 80),
  (null, 'apologies',         'understand', 'How I Like to Receive Apologies', '🤍', 'personal', 'Sorry lands differently for everyone.', 'Say what you''re sorry for, specifically', 'heavy', 90),
  (null, 'how_i_show_love',   'understand', 'How I Show Love',           '💞', 'personal', 'So it gets recognised as love.', 'I check you''ve eaten. That''s the whole thing.', 'light', 100),
  (null, 'how_i_know_loved',  'understand', 'How I Know I''m Loved',     '🪞', 'personal', 'The signal you actually read.', 'When you make time you didn''t have', 'light', 110),
  (null, 'during_argument',   'understand', 'What I Need During an Argument', '🗣️', 'personal', 'Decided now, while nothing is wrong.', 'Don''t tell me to leave', 'heavy', 120),
  (null, 'comm_style',        'understand', 'My Communication Style',    '📡', 'personal', 'How you work, so it isn''t guessed at.', 'I need to think before I can answer', 'light', 130),
  (null, 'triggers',          'understand', 'My Biggest Relationship Triggers', '🛑', 'personal', 'The ones that aren''t really about the moment.', 'Being compared to anyone', 'heavy', 140),

  -- ❤️ Relationship Stuff ---------------------------------------------------
  (null, 'rules',             'relationship', 'Our Relationship Rules',  '📜', 'shared', 'What you''ve both agreed to.', 'We don''t go to sleep in separate rooms', 'heavy', 10),
  (null, 'boundaries',        'relationship', 'Our Boundaries',          '🛑', 'shared', 'Genuinely important, and never a joke.', 'No talking about us in the group chat', 'heavy', 20),
  -- Deliberately shared and heavy. Two private lists would be the whole
  -- problem: the point is one agreed answer, written while nobody is accused
  -- of anything, so "I didn't think that counted" stops being available to
  -- either of you.
  (null, 'cheating',          'relationship', 'Things We Consider Cheating', '⛓️‍💥', 'shared', 'Agree it now, in the calm. The line only works if you both drew it.', 'Texting someone you''d delete the messages from', 'heavy', 25),
  (null, 'promises',          'relationship', 'Things We Promise Each Other', '🤞', 'shared', 'Said once, kept.', 'We say it the day it happens, not a week later', 'heavy', 30),
  (null, 'never_become',      'relationship', 'Things We Never Want to Become', '🚷', 'shared', 'The couple you''ve both watched and don''t want to be.', 'The couple who stop asking', 'heavy', 40),
  (null, 'improve',           'relationship', 'Things We Want to Improve', '📈', 'shared', 'Named, so it can be worked on.', 'Actually finishing arguments', 'light', 50),
  (null, 'do_more',           'relationship', 'Things We Should Do More', '➕', 'shared', 'The ones you always mean to.', 'Cook together on Sundays', 'light', 60),
  (null, 'stop_doing',        'relationship', 'Things We Should Stop Doing', '➖', 'shared', 'Both of you, not one of you.', 'Texting through a disagreement', 'light', 70),
  (null, 'never_say',         'relationship', 'Things We Should Never Say During Arguments', '🤬', 'shared', 'The words that can''t be taken back.', '"Maybe we shouldn''t do this"', 'heavy', 80),
  (null, 'handle_conflict',   'relationship', 'How We Want to Handle Conflict', '⚖️', 'shared', 'The plan you make while calm.', 'One person talks at a time. No phones.', 'heavy', 90),
  (null, 'reset_rules',       'relationship', 'Our "Reset" Rules',       '🔄', 'shared', 'How you get back to normal on purpose.', 'Whoever is less upset makes the tea', 'heavy', 100),
  (null, 'love_languages',    'relationship', 'Our Love Languages',      '🗝️', 'shared', 'Both of yours, written where you''ll see them.', 'You: words. Me: time.', 'light', 110),
  (null, 'goals',             'relationship', 'Our Relationship Goals',  '🎯', 'shared', 'Where this is going.', 'A year with no week of silence', 'light', 120),

  -- 😂 Fun Ones --------------------------------------------------------------
  (null, 'so_you',            'fun', 'Things You Do That Are So You',   '🫵', 'personal', 'The tells.', 'The face you make at bad news', 'light', 10),
  (null, 'your_weird_habits', 'fun', 'Your Weird Habits',               '🤨', 'personal', 'Affectionately.', 'You narrate what you''re doing', 'light', 20),
  (null, 'my_weird_habits',   'fun', 'My Weird Habits',                 '🙈', 'personal', 'Own up first.', 'I reread messages I''ve already read', 'light', 30),
  (null, 'both_find_funny',   'fun', 'Things We Both Find Funny',       '😹', 'shared',   'The shared sense of humour, catalogued.', 'People falling over. Every time.', 'light', 40),
  (null, 'inside_jokes',      'fun', 'Our Inside Jokes',                '🤝', 'shared',   'So they survive.', 'The thing with the taxi driver', 'light', 50),
  (null, 'argue_no_reason',   'fun', 'Things We Argue About for No Reason', '🌀', 'shared', 'The recurring nonsense.', 'The correct way to load a plate', 'light', 60),
  (null, 'you_always_say',    'fun', 'Things You Always Say',           '💬', 'personal', 'Their catchphrases.', '"I''m just saying"', 'light', 70),
  (null, 'pretend_to_hate',   'fun', 'Things I Pretend to Hate but Actually Love', '😌', 'personal', 'Confession time.', 'The nickname. Keep using it.', 'light', 80),
  (null, 'most_annoying',     'fun', 'Your Most Annoying Habits',       '😤', 'personal', 'Lightly.', 'Finishing my sentences wrong', 'light', 90),
  (null, 'funniest_memories', 'fun', 'Our Funniest Memories',           '🤣', 'shared',   'The ones that still work.', 'The night the cake collapsed', 'light', 100),
  (null, 'more_likely_to',    'fun', 'Who Is More Likely To…?',         '🎲', 'shared',   'Settle them in writing.', 'Cry at an advert — you', 'light', 110),
  (null, 'hot_takes',         'fun', 'Couple Hot Takes',                '🌶️', 'shared',   'Your joint unpopular opinions.', 'Anniversaries are overrated', 'light', 120),
  (null, 'would_you_rather',  'fun', 'Would You Rather?',               '🔀', 'shared',   'Leave them for each other.', 'Never text again or never call again?', 'light', 130),

  -- 🥺 Deeper Ones -----------------------------------------------------------
  (null, 'afraid_to_lose',    'deeper', 'Things I''m Afraid to Lose',   '🫙', 'personal', 'Worth saying out loud once.', 'How easy this is', 'heavy', 10),
  (null, 'afraid_to_tell',    'deeper', 'Things I''m Afraid to Tell You', '🫣', 'personal', 'Written is still said.', 'I worry I''m too much', 'heavy', 20),
  (null, 'biggest_fear',      'deeper', 'My Biggest Fear',              '🌑', 'personal', 'One line is enough.', 'Being left without being told why', 'heavy', 30),
  (null, 'working_on',        'deeper', 'Something I''m Working On',    '🛠️', 'personal', 'So it''s met with patience rather than surprise.', 'Not going quiet when I''m hurt', 'heavy', 40),
  (null, 'want_understood',   'deeper', 'Something I Want You to Understand', '🪢', 'personal', 'The thing you keep not getting across.', 'When I say I''m fine I usually mean I need a minute', 'heavy', 50),
  (null, 'part_i_hide',       'deeper', 'A Part of Me I Don''t Show Everyone', '🕯️', 'personal', 'What they get that others don''t.', 'How much I actually worry', 'heavy', 60),
  (null, 'need_confidence',   'deeper', 'What I Need More Confidence In', '🌱', 'personal', 'Where encouragement would land.', 'That I''m good at my job', 'light', 70),
  (null, 'proud_of_myself',   'deeper', 'What I''m Proud of Myself For', '🏅', 'personal', 'Say it here if nowhere else.', 'I asked for help this year', 'light', 80),
  (null, 'my_future',         'deeper', 'What I Want My Future to Look Like', '🌅', 'personal', 'Yours, not just ours.', 'Work I don''t dread', 'light', 90),
  (null, 'our_future',        'deeper', 'What I Want Our Future to Look Like', '🏡', 'personal', 'In your own words, separately. Compare after.', 'Quiet mornings, no rush', 'light', 100),
  (null, 'five_years',        'deeper', 'Where I See Us in 5 Years',    '🔭', 'personal', 'Answer it before you discuss it.', 'Same city, more space', 'light', 110),
  (null, 'experience_together','deeper', 'Things I Want Us to Experience Together', '✨', 'personal', 'Not places — moments.', 'Learning something neither of us is good at', 'light', 120),

  -- 💌 Cute Personal Sections ------------------------------------------------
  (null, 'reasons_i_chose',   'personal', 'Reasons I Chose You',        '💌', 'personal', 'The original ones.', 'You listened to the boring version of the story', 'light', 10),
  (null, 'keep_choosing',     'personal', 'Why I Keep Choosing You',    '🔁', 'personal', 'The ones that came later.', 'You got better at the hard conversations', 'light', 20),
  (null, 'favourite_thing',   'personal', 'My Favourite Thing About You', '⭐', 'personal', 'Pick one. Then another.', 'You laugh before the punchline', 'light', 30),
  (null, 'favourite_memory',  'personal', 'My Favourite Memory of Us',  '📸', 'personal', 'Yours may not be theirs. That''s the fun of it.', 'The walk back in the rain', 'light', 40),
  (null, 'moment_i_knew',     'personal', 'The Moment I Knew',          '💫', 'personal', 'There''s usually one.', 'When you waited without being asked', 'light', 50),
  (null, 'never_forget',      'personal', 'Things About You I Never Want to Forget', '🧵', 'personal', 'The details that fade first.', 'How you hold a cup with both hands', 'light', 60),
  (null, 'what_i_miss',       'personal', 'What I Miss About You',      '🌙', 'personal', 'For the days apart.', 'The noise you make sitting down', 'light', 70),
  (null, 'do_with_you',       'personal', 'Things I Want to Do With You', '📝', 'personal', 'Small and soon, not someday.', 'A whole day with no plans', 'light', 80),
  (null, 'places_with_you',   'personal', 'Places I Want to Go With You', '🗺️', 'personal', 'Anywhere counts.', 'That café you mentioned once', 'light', 90),
  (null, 'dream_date',        'personal', 'Our Dream Date',             '🥂', 'shared',   'Build it together.', 'Late food, no phones, long walk', 'light', 100),
  (null, 'dream_vacation',    'personal', 'Our Dream Vacation',         '✈️', 'shared',   'Write it down and it starts being a plan.', 'Somewhere with a sea and no signal', 'light', 110),
  (null, 'bucket_list',       'personal', 'Our Couple Bucket List',     '🪣', 'shared',   'Tick them off as you go.', 'Drive somewhere with no destination', 'light', 120),
  (null, 'future_home',       'personal', 'Our Future Home',            '🔑', 'shared',   'Every detail you''ve both said out loud.', 'A kitchen big enough for two people arguing', 'light', 130),
  (null, 'names_we_like',     'personal', 'Names We Like',              '👀', 'shared',   'No commitment implied. Obviously.', 'Amara', 'light', 140),

  -- 🌱 Growing Together ------------------------------------------------------
  (null, 'were_working_on',   'growing', 'Things We''re Working On',    '🌱', 'shared', 'Together, out loud.', 'Not letting things sit for days', 'light', 10),
  (null, 'goals_together',    'growing', 'Goals We Have Together',      '🎯', 'shared', 'With dates if you dare.', 'Save for the deposit by December', 'light', 20),
  (null, 'habits_to_build',   'growing', 'Habits We Want to Build',     '🧱', 'shared', 'Small and repeatable.', 'Phones down after ten', 'light', 30),
  (null, 'learn_together',    'growing', 'Things We Want to Learn Together', '📚', 'shared', 'Being bad at something together is underrated.', 'Cooking one dish properly', 'light', 40),
  (null, 'save_for',          'growing', 'Things We Want to Save For',  '💰', 'shared', 'Named, so it''s real.', 'The trip', 'light', 50),
  (null, 'places_to_visit',   'growing', 'Places We Want to Visit',     '📍', 'shared', 'Near ones count.', 'The coast, before summer ends', 'light', 60),
  (null, 'experiences',       'growing', 'Experiences We Want to Have', '🎢', 'shared', 'Not things. Things that happen.', 'A night drive with nowhere to be', 'light', 70),
  (null, 'checkin',           'growing', 'Monthly Relationship Check-In', '🗓️', 'shared', 'Once a month, both of you, ten minutes.', 'October — better than September', 'light', 80),
  (null, 'went_well',         'growing', 'What Went Well This Month',   '✅', 'shared', 'Start with this one. Always.', 'We said the hard thing early', 'light', 90),
  (null, 'do_better',         'growing', 'What We Could Do Better',     '🔧', 'shared', 'Only after the one above.', 'Less scrolling in the same room', 'light', 100),
  (null, 'appreciate_month',  'growing', 'One Thing I Appreciate About You This Month', '🫶', 'personal', 'One a month. That''s the whole ritual.', 'You noticed before I said anything', 'light', 110)
on conflict (slug) where couple_id is null do update set
  -- Re-runnable, and edits to the wording above reach couples who already
  -- have the section. The entries hang off the id, which never changes.
  group_key   = excluded.group_key,
  title       = excluded.title,
  emoji       = excluded.emoji,
  scope       = excluded.scope,
  prompt      = excluded.prompt,
  placeholder = excluded.placeholder,
  weight      = excluded.weight,
  sort_order  = excluded.sort_order;
