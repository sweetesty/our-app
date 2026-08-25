/** Mirrors supabase/migrations. Kept hand-written so the shapes stay readable;
 *  swap for `supabase gen types typescript` output once the schema settles. */

export type Profile = {
  id: string
  display_name: string
  avatar_url: string | null
  couple_id: string | null
  joined_at: string | null
  created_at: string
}

export type Couple = {
  id: string
  invite_code: string
  name: string | null
  anniversary: string | null
  created_by: string
  created_at: string
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
  current_streak: number
  longest_streak: number
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
  read_at: string | null
  created_at: string
  updated_at: string
}

export type Milestone = {
  id: string
  couple_id: string
  title: string
  description: string | null
  happened_on: string
  icon: string
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
}

export type VaultContents = {
  item_id: string
  body: string | null
  media_path: string | null
  media_type: MediaType | null
}

export type NudgeKind =
  | 'miss_you'
  | 'thinking_of_you'
  | 'need_you'
  | 'kiss'
  | 'annoying'
  | 'proud'

export type Nudge = {
  id: string
  couple_id: string
  sender_id: string
  kind: NudgeKind
  message: string | null
  seen_at: string | null
  created_at: string
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
  latest_nudge?: Nudge | null
}

/** The six buttons. Order here is the order they render in. */
export const NUDGES: { kind: NudgeKind; emoji: string; label: string; sent: string }[] = [
  { kind: 'miss_you', emoji: '🥺', label: 'I miss you', sent: 'misses you' },
  { kind: 'thinking_of_you', emoji: '❤️', label: 'Thinking of you', sent: 'is thinking of you' },
  { kind: 'need_you', emoji: '🫥', label: 'I need you', sent: 'needs you' },
  { kind: 'kiss', emoji: '😘', label: 'Kiss me', sent: 'wants a kiss' },
  { kind: 'annoying', emoji: '😂', label: "You're annoying me", sent: 'is a little annoyed with you' },
  { kind: 'proud', emoji: '🫶', label: 'Proud of you', sent: 'is proud of you' },
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
