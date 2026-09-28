/** Mirrors supabase/migrations. Kept hand-written so the shapes stay readable;
 *  swap for `supabase gen types typescript` output once the schema settles. */

export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  couple_id: string | null
  joined_at: string | null
  created_at: string
  /** What you call them. Stored on your row, not theirs. */
  partner_nickname: string | null
  /** Only present on `partner` when a nickname is standing in for it. */
  real_name?: string
}

export type Couple = {
  id: string
  invite_code: string
  name: string | null
  anniversary: string | null
  created_by: string
  created_at: string
  avatar_url: string | null
  accent: string
  background: string
  /** Overrides the built-in reaction set. Null means use the default. */
  reactions: string[] | null
}

export type CoupleStats = {
  couple_id: string
  answers_given: number
  notes_written: number
  cards_played: number
  memories_added: number
  vault_items: number
  nudges_sent: number
  spicy_played: number
  /** Photos sent to each other. Expired ones still count — they happened. */
  moments_sent: number
  compliments_sent: number
  current_streak: number
  longest_streak: number
  messages_sent: number
}

export type TodayQuestion = {
  daily_question_id: string
  body: string
  category: string
  asked_on: string
  is_custom: boolean
  my_answer: string | null
  my_answered_at: string | null
  partner_answered: boolean
  revealed: boolean
}

export type DailyAnswer = {
  id: string
  daily_question_id: string
  couple_id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
}

export type CardDeck = {
  id: string
  couple_id: string | null
  slug: string
  name: string
  emoji: string
  description: string | null
  accent: string
  sort_order: number
}

export type Card = {
  id: string
  deck_id: string
  couple_id: string | null
  body: string
  kind: 'question' | 'dare'
  created_by: string | null
  is_active: boolean
  created_at: string
}

export type CardPlay = {
  id: string
  couple_id: string
  card_id: string
  played_by: string
  response: string | null
  completed: boolean
  played_at: string
}

export type NoteMood =
  | 'sweet'
  | 'miss_me'
  | 'sad'
  | 'angry'
  | 'reassurance'
  | 'happy'
  | 'sorry'
  | 'proud'
  | 'anniversary'

export type LoveNote = {
  id: string
  couple_id: string
  author_id: string
  title: string | null
  body: string
  mood: NoteMood
  is_pinned: boolean
  is_favourite: boolean
  photo_path: string | null
  /** Unpinned notes clear after 24 hours; pinning sets this to null. */
  expires_at: string | null
  read_at: string | null
  created_at: string
  updated_at: string
}

export type Message = {
  id: string
  couple_id: string
  author_id: string
  /** Null when the message is only an attachment. */
  body: string | null
  /** Set when this was sent as a reply to a photo. */
  moment_id: string | null
  media_path: string | null
  media_type: MediaType | null
  /** The message this one quotes. */
  reply_to: string | null
  is_pinned: boolean
  read_at: string | null
  created_at: string
}

export type Milestone = {
  id: string
  couple_id: string
  title: string
  description: string | null
  happened_on: string
  icon: string
  /** Free text, not coordinates — no third party ever sees where you've been. */
  location: string | null
  created_by: string | null
  created_at: string
}

export type MediaType = 'photo' | 'voice' | 'video'

export type MilestoneMedia = {
  id: string
  milestone_id: string
  couple_id: string
  storage_path: string
  media_type: MediaType
  caption: string | null
  created_at: string
}

export type VaultItem = {
  id: string
  couple_id: string
  author_id: string
  recipient_id: string
  label: string
  unlock_type: 'date' | 'condition'
  unlock_at: string | null
  unlock_condition: string | null
  unlocked_at: string | null
  created_at: string
  /** A surprise hides its label and its timing from the recipient. */
  is_surprise: boolean
  /** All they're told beforehand, if anything. Never the label. */
  teaser: string | null
  /**
   * Computed by the vault_inbox view. The recipient cannot see unlock_at on a
   * surprise, so they cannot work this out for themselves — which is the point.
   */
  ready: boolean
}

export type VaultContents = {
  item_id: string
  body: string | null
  media_path: string | null
  media_type: MediaType | null
}

/** What a reply can hang off. Mirrors the check on public.replies. */
export type ReplyKind = 'note' | 'vault' | 'compliment'

export type Reply = {
  id: string
  couple_id: string
  target_kind: ReplyKind
  target_id: string
  author_id: string
  body: string
  created_at: string
}

export type NudgeKind =
  | 'miss_you'
  | 'thinking_of_you'
  | 'need_you'
  | 'kiss'
  | 'annoying'
  | 'proud'
  /** One you wrote. Its words travel on the nudge, not in a lookup table. */
  | 'custom'

export type Nudge = {
  id: string
  couple_id: string
  sender_id: string
  kind: NudgeKind
  message: string | null
  /** Set on custom nudges only; the built-in six read theirs from NUDGES. */
  emoji: string | null
  label: string | null
  seen_at: string | null
  created_at: string
}

/** A saved custom tile, so the second send is one tap like the other six. */
export type CustomNudge = {
  id: string
  couple_id: string
  created_by: string | null
  emoji: string
  label: string
  line: string | null
  created_at: string
}

/* --- the handbook ---------------------------------------------------------
   Sections are rows, not a union, because there are ninety of them and a
   couple can write their own. See 0042_handbook.sql. */

export type HandbookSection = {
  id: string
  couple_id: string | null
  slug: string
  group_key: 'know' | 'understand' | 'relationship' | 'fun' | 'deeper' | 'personal' | 'growing'
  title: string
  emoji: string
  /** personal: one list each, acknowledged. shared: one list, nothing to ack. */
  scope: 'personal' | 'shared'
  prompt: string | null
  placeholder: string | null
  weight: 'light' | 'heavy'
  sort_order: number
}

export type HandbookEntry = {
  id: string
  section_id: string
  slug: string
  scope: 'personal' | 'shared'
  author_id: string
  author_name: string | null
  mine: boolean
  body: string
  /** Your own and shared ones always come back acknowledged — see handbook(). */
  acked: boolean
  acked_at: string | null
  created_at: string
}

export type HandbookSummary = {
  theirs_total: number
  theirs_unacked: number
  mine_total: number
  mine_acked: number
  shared_total: number
}

/* --- games ----------------------------------------------------------------
   Three mechanics underneath eleven games. See 0046_games.sql. */

export type Game = {
  slug: string
  name: string
  emoji: string
  tagline: string
  mode: 'match' | 'guess' | 'draw'
  rounds: number
  sort_order: number
}

export type GameRound = {
  round_id: string
  idx: number
  total: number
  mode: 'match' | 'guess' | 'draw'
  body: string
  option_a: string | null
  option_b: string | null
  subject_id: string | null
  subject_name: string | null
  /** guess rounds: true when you're the one answering honestly. */
  i_am_subject: boolean
  my_answer: string | null
  /** Withheld by current_game_round() until yours is in. */
  their_answer: string | null
  revealed: boolean
  correct: boolean | null
  finished: boolean
  score: number
  scored: number
  /** Carried by the client, not the RPC — the screen already knows it. */
  game_slug?: string
}

export type BucketItem = {
  id: string
  couple_id: string
  category: 'places' | 'experiences' | 'food' | 'goals' | 'save_for' | 'always'
  title: string
  note: string | null
  created_by: string | null
  completed_at: string | null
  completed_by: string | null
  milestone_id: string | null
  created_at: string
}

export type DateIdea = {
  id: string
  title: string
  emoji: string
  budget: 'free' | 'cheap' | 'mid' | 'splash'
  indoor: boolean | null
  minutes: number
  vibe: 'romantic' | 'fun' | 'chill' | null
  pick_id: string
  /** Set when the idea came off the bucket list rather than the idea pile. */
  bucket_id: string | null
}

/* --- the argument log -----------------------------------------------------
   No fault column, on purpose. See 0050_fights.sql. */

export type Fight = {
  id: string
  couple_id: string
  logged_by: string | null
  started_on: string
  /** Null while it's still going. */
  resolved_on: string | null
  what_about: string | null
  what_helped: string | null
  created_at: string
}

export type FightStats = {
  total: number
  open_id: string | null
  open_since: string | null
  open_days: number | null
  days_since: number | null
  longest_peace: number | null
  avg_days: number | null
  fastest_makeup: number | null
  fights_month: number
  fights_year: number
  dates_month: number
  dates_year: number
}

/* --- the archive reading itself back --------------------------------------
   See 0052_on_this_day.sql. */

export type OnThisDayItem = {
  id: string
  kind: string
  title: string | null
  body: string | null
  media_path: string | null
  /** Route to open it on. */
  source: string
  happened_on: string
  years_ago: number
}

export type AnsweredBefore = {
  question: string
  asked_on: string
  mine: string | null
  /** Null if you never answered that day — the reveal gate does not expire. */
  theirs: string | null
  years_ago: number
}

export type Streak = {
  couple_id: string
  current_streak: number
  longest_streak: number
  last_answered_on: string | null
}

export type AchievementDef = {
  slug: string
  name: string
  emoji: string
  description: string
  metric: keyof CoupleStats
  target: number
  sort_order: number
}

export type Achievement = {
  couple_id: string
  slug: string
  unlocked_at: string
}

export type HomeSummary = {
  paired: boolean
  couple?: Couple
  me?: Profile
  partner?: Profile | null
  stats?: CoupleStats
  unopened_vault?: number
  ready_vault?: number
  unread_notes?: number
  unread_compliments?: number
  unread_messages?: number
  latest_nudge?: Nudge | null
}

/**
 * The six buttons. Order here is the order they render in.
 *
 * `sent` is what it reads when they sent it ("Zahir misses you"). `mine` is a
 * separate phrasing for your own, because reusing the third-person one gave
 * "You is proud of you" — wrong grammar and pointed at the wrong person.
 */
export const NUDGES: {
  kind: NudgeKind
  emoji: string
  label: string
  sent: string
  mine: (partner: string) => string
}[] = [
  {
    kind: 'miss_you',
    emoji: '🥺',
    label: 'I miss you',
    sent: 'misses you',
    mine: (p) => `You told ${p} you miss them`,
  },
  {
    kind: 'thinking_of_you',
    emoji: '❤️',
    label: 'Thinking of you',
    sent: 'is thinking of you',
    mine: (p) => `You were thinking of ${p}`,
  },
  {
    kind: 'need_you',
    emoji: '🫥',
    label: 'I need you',
    sent: 'needs you',
    mine: (p) => `You told ${p} you need them`,
  },
  {
    kind: 'kiss',
    emoji: '😘',
    label: 'Kiss me',
    sent: 'wants a kiss',
    mine: (p) => `You asked ${p} for a kiss`,
  },
  {
    kind: 'annoying',
    emoji: '😂',
    label: "You're annoying me",
    sent: 'is a little annoyed with you',
    mine: (p) => `You told ${p} they're annoying you`,
  },
  {
    kind: 'proud',
    emoji: '🫶',
    label: 'Proud of you',
    sent: 'is proud of you',
    mine: (p) => `You told ${p} you're proud of them`,
  },
]

/** A category is only useful if it names the moment you would open the note. */
export const MOODS: { value: NoteMood; emoji: string; label: string }[] = [
  { value: 'miss_me', emoji: '💭', label: 'When you miss me' },
  { value: 'sad', emoji: '🌧️', label: "When you're sad" },
  { value: 'angry', emoji: '🔥', label: "When you're angry with me" },
  { value: 'reassurance', emoji: '🫂', label: 'When you need reassurance' },
  { value: 'happy', emoji: '☀️', label: "When you're happy" },
  { value: 'sweet', emoji: '💛', label: 'Just because' },
  { value: 'sorry', emoji: '🕊️', label: "I'm sorry" },
  { value: 'proud', emoji: '🌟', label: 'Proud of you' },
  { value: 'anniversary', emoji: '🥂', label: 'For a milestone' },
]

export type LoveNoteExtras = {
  is_favourite: boolean
  photo_path: string | null
}
