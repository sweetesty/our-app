/// Mirrors supabase/migrations. Plain classes with fromMap so the shapes stay
/// obvious; swap for generated types once the schema settles.
library;

DateTime? _date(dynamic v) =>
    v == null ? null : DateTime.tryParse(v.toString())?.toLocal();

class Profile {
  Profile({
    required this.id,
    required this.displayName,
    this.avatarUrl,
    this.coupleId,
  });

  final String id;
  final String displayName;
  final String? avatarUrl;
  final String? coupleId;

  factory Profile.fromMap(Map<String, dynamic> m) => Profile(
    id: m['id'] as String,
    displayName: (m['display_name'] ?? 'You') as String,
    avatarUrl: m['avatar_url'] as String?,
    coupleId: m['couple_id'] as String?,
  );
}

class Couple {
  Couple({
    required this.id,
    required this.inviteCode,
    this.name,
    this.anniversary,
  });

  final String id;
  final String inviteCode;
  final String? name;
  final DateTime? anniversary;

  factory Couple.fromMap(Map<String, dynamic> m) => Couple(
    id: m['id'] as String,
    inviteCode: m['invite_code'] as String,
    name: m['name'] as String?,
    anniversary: _date(m['anniversary']),
  );

  int? get daysTogether => anniversary == null
      ? null
      : DateTime.now().difference(anniversary!).inDays.clamp(0, 1 << 30);
}

class CoupleStats {
  CoupleStats({
    required this.answersGiven,
    required this.notesWritten,
    required this.cardsPlayed,
    required this.memoriesAdded,
    required this.vaultItems,
    required this.nudgesSent,
    required this.spicyPlayed,
    required this.currentStreak,
    required this.longestStreak,
  });

  final int answersGiven;
  final int notesWritten;
  final int cardsPlayed;
  final int memoriesAdded;
  final int vaultItems;
  final int nudgesSent;
  final int spicyPlayed;
  final int currentStreak;
  final int longestStreak;

  static int _n(dynamic v) => (v as num?)?.toInt() ?? 0;

  factory CoupleStats.fromMap(Map<String, dynamic> m) => CoupleStats(
    answersGiven: _n(m['answers_given']),
    notesWritten: _n(m['notes_written']),
    cardsPlayed: _n(m['cards_played']),
    memoriesAdded: _n(m['memories_added']),
    vaultItems: _n(m['vault_items']),
    nudgesSent: _n(m['nudges_sent']),
    spicyPlayed: _n(m['spicy_played']),
    currentStreak: _n(m['current_streak']),
    longestStreak: _n(m['longest_streak']),
  );

  int byMetric(String metric) => switch (metric) {
    'answers_given' => answersGiven,
    'notes_written' => notesWritten,
    'cards_played' => cardsPlayed,
    'memories_added' => memoriesAdded,
    'vault_items' => vaultItems,
    'nudges_sent' => nudgesSent,
    'spicy_played' => spicyPlayed,
    'current_streak' => currentStreak,
    'longest_streak' => longestStreak,
    _ => 0,
  };
}

class HomeSummary {
  HomeSummary({
    required this.paired,
    this.couple,
    this.me,
    this.partner,
    this.stats,
    this.readyVault = 0,
    this.unopenedVault = 0,
    this.unreadNotes = 0,
    this.latestNudge,
  });

  final bool paired;
  final Couple? couple;
  final Profile? me;
  final Profile? partner;
  final CoupleStats? stats;
  final int readyVault;
  final int unopenedVault;
  final int unreadNotes;
  final Nudge? latestNudge;

  static Map<String, dynamic>? _obj(dynamic v) =>
      v == null ? null : Map<String, dynamic>.from(v as Map);

  factory HomeSummary.fromMap(Map<String, dynamic> m) {
    final couple = _obj(m['couple']);
    final me = _obj(m['me']);
    final partner = _obj(m['partner']);
    final stats = _obj(m['stats']);
    final nudge = _obj(m['latest_nudge']);

    return HomeSummary(
      paired: m['paired'] == true,
      couple: couple == null ? null : Couple.fromMap(couple),
      me: me == null ? null : Profile.fromMap(me),
      partner: partner == null ? null : Profile.fromMap(partner),
      stats: stats == null ? null : CoupleStats.fromMap(stats),
      readyVault: (m['ready_vault'] as num?)?.toInt() ?? 0,
      unopenedVault: (m['unopened_vault'] as num?)?.toInt() ?? 0,
      unreadNotes: (m['unread_notes'] as num?)?.toInt() ?? 0,
      latestNudge: nudge == null ? null : Nudge.fromMap(nudge),
    );
  }
}

class TodayQuestion {
  TodayQuestion({
    required this.id,
    required this.body,
    required this.category,
    required this.isCustom,
    this.myAnswer,
    required this.partnerAnswered,
    required this.revealed,
  });

  final String id;
  final String body;
  final String category;
  final bool isCustom;
  final String? myAnswer;
  final bool partnerAnswered;
  final bool revealed;

  factory TodayQuestion.fromMap(Map<String, dynamic> m) => TodayQuestion(
    id: m['daily_question_id'] as String,
    body: (m['body'] ?? '') as String,
    category: (m['category'] ?? 'general') as String,
    isCustom: m['is_custom'] == true,
    myAnswer: m['my_answer'] as String?,
    partnerAnswered: m['partner_answered'] == true,
    revealed: m['revealed'] == true,
  );
}

class DailyAnswer {
  DailyAnswer({
    required this.id,
    required this.authorId,
    required this.body,
    required this.createdAt,
  });

  final String id;
  final String authorId;
  final String body;
  final DateTime createdAt;

  factory DailyAnswer.fromMap(Map<String, dynamic> m) => DailyAnswer(
    id: m['id'] as String,
    authorId: m['author_id'] as String,
    body: (m['body'] ?? '') as String,
    createdAt: _date(m['created_at']) ?? DateTime.now(),
  );
}

class CardDeck {
  CardDeck({
    required this.id,
    required this.slug,
    required this.name,
    required this.emoji,
    this.description,
    required this.accent,
    this.coupleId,
  });

  final String id;
  final String slug;
  final String name;
  final String emoji;
  final String? description;
  final String accent;
  final String? coupleId;

  bool get isCustom => coupleId != null;

  factory CardDeck.fromMap(Map<String, dynamic> m) => CardDeck(
    id: m['id'] as String,
    slug: m['slug'] as String,
    name: m['name'] as String,
    emoji: (m['emoji'] ?? '🃏') as String,
    description: m['description'] as String?,
    accent: (m['accent'] ?? '#B98AC9') as String,
    coupleId: m['couple_id'] as String?,
  );
}

class PlayCard {
  PlayCard({
    required this.id,
    required this.deckId,
    required this.body,
    required this.kind,
  });

  final String id;
  final String deckId;
  final String body;
  final String kind;

  bool get isDare => kind == 'dare';

  factory PlayCard.fromMap(Map<String, dynamic> m) => PlayCard(
    id: m['id'] as String,
    deckId: m['deck_id'] as String,
    body: (m['body'] ?? '') as String,
    kind: (m['kind'] ?? 'question') as String,
  );
}

class LoveNote {
  LoveNote({
    required this.id,
    required this.authorId,
    this.title,
    required this.body,
    required this.mood,
    required this.isPinned,
    this.readAt,
    required this.createdAt,
  });

  final String id;
  final String authorId;
  final String? title;
  final String body;
  final String mood;
  final bool isPinned;
  final DateTime? readAt;
  final DateTime createdAt;

  factory LoveNote.fromMap(Map<String, dynamic> m) => LoveNote(
    id: m['id'] as String,
    authorId: m['author_id'] as String,
    title: m['title'] as String?,
    body: (m['body'] ?? '') as String,
    mood: (m['mood'] ?? 'sweet') as String,
    isPinned: m['is_pinned'] == true,
    readAt: _date(m['read_at']),
    createdAt: _date(m['created_at']) ?? DateTime.now(),
  );
}

class Milestone {
  Milestone({
    required this.id,
    required this.title,
    this.description,
    required this.happenedOn,
    required this.icon,
  });

  final String id;
  final String title;
  final String? description;
  final DateTime happenedOn;
  final String icon;

  factory Milestone.fromMap(Map<String, dynamic> m) => Milestone(
    id: m['id'] as String,
    title: (m['title'] ?? '') as String,
    description: m['description'] as String?,
    happenedOn: _date(m['happened_on']) ?? DateTime.now(),
    icon: (m['icon'] ?? '💫') as String,
  );
}

class MilestoneMedia {
  MilestoneMedia({
    required this.id,
    required this.milestoneId,
    required this.storagePath,
    required this.mediaType,
    this.caption,
  });

  final String id;
  final String milestoneId;
  final String storagePath;
  final String mediaType;
  final String? caption;

  factory MilestoneMedia.fromMap(Map<String, dynamic> m) => MilestoneMedia(
    id: m['id'] as String,
    milestoneId: m['milestone_id'] as String,
    storagePath: m['storage_path'] as String,
    mediaType: (m['media_type'] ?? 'photo') as String,
    caption: m['caption'] as String?,
  );
}

class VaultItem {
  VaultItem({
    required this.id,
    required this.authorId,
    required this.recipientId,
    required this.label,
    required this.unlockType,
    this.unlockAt,
    this.unlockCondition,
    this.unlockedAt,
    required this.createdAt,
  });

  final String id;
  final String authorId;
  final String recipientId;
  final String label;
  final String unlockType;
  final DateTime? unlockAt;
  final String? unlockCondition;
  final DateTime? unlockedAt;
  final DateTime createdAt;

  bool get isOpened => unlockedAt != null;

  /// Mirrors vault_is_unlocked() so the UI can show the right state without a
  /// round trip. The database still has the final say on the contents.
  bool get isReady {
    if (unlockedAt != null) return true;
    if (unlockType == 'condition') return true;
    return unlockAt != null && !unlockAt!.isAfter(DateTime.now());
  }

  factory VaultItem.fromMap(Map<String, dynamic> m) => VaultItem(
    id: m['id'] as String,
    authorId: m['author_id'] as String,
    recipientId: m['recipient_id'] as String,
    label: (m['label'] ?? '') as String,
    unlockType: (m['unlock_type'] ?? 'date') as String,
    unlockAt: _date(m['unlock_at']),
    unlockCondition: m['unlock_condition'] as String?,
    unlockedAt: _date(m['unlocked_at']),
    createdAt: _date(m['created_at']) ?? DateTime.now(),
  );
}

class VaultContents {
  VaultContents({this.body, this.mediaPath, this.mediaType});

  final String? body;
  final String? mediaPath;
  final String? mediaType;

  bool get isEmpty => (body == null || body!.isEmpty) && mediaPath == null;

  factory VaultContents.fromMap(Map<String, dynamic> m) => VaultContents(
    body: m['body'] as String?,
    mediaPath: m['media_path'] as String?,
    mediaType: m['media_type'] as String?,
  );
}

class Nudge {
  Nudge({
    required this.id,
    required this.senderId,
    required this.kind,
    this.message,
    required this.createdAt,
  });

  final String id;
  final String senderId;
  final String kind;
  final String? message;
  final DateTime createdAt;

  factory Nudge.fromMap(Map<String, dynamic> m) => Nudge(
    id: m['id'] as String,
    senderId: m['sender_id'] as String,
    kind: (m['kind'] ?? 'thinking_of_you') as String,
    message: m['message'] as String?,
    createdAt: _date(m['created_at']) ?? DateTime.now(),
  );
}

class AchievementDef {
  AchievementDef({
    required this.slug,
    required this.name,
    required this.emoji,
    required this.description,
    required this.metric,
    required this.target,
  });

  final String slug;
  final String name;
  final String emoji;
  final String description;
  final String metric;
  final int target;

  factory AchievementDef.fromMap(Map<String, dynamic> m) => AchievementDef(
    slug: m['slug'] as String,
    name: m['name'] as String,
    emoji: m['emoji'] as String,
    description: m['description'] as String,
    metric: m['metric'] as String,
    target: (m['target'] as num).toInt(),
  );
}

/* -------------------------------------------------------------------------- */
/* Static content shared with the web app                                      */
/* -------------------------------------------------------------------------- */

class NudgeKind {
  const NudgeKind(this.kind, this.emoji, this.label, this.sent);
  final String kind;
  final String emoji;
  final String label;
  final String sent;
}

const kNudges = <NudgeKind>[
  NudgeKind('miss_you', '🥺', 'I miss you', 'misses you'),
  NudgeKind('thinking_of_you', '❤️', 'Thinking of you', 'is thinking of you'),
  NudgeKind('need_you', '🫥', 'I need you', 'needs you'),
  NudgeKind('kiss', '😘', 'Kiss me', 'wants a kiss'),
  NudgeKind('annoying', '😂', "You're annoying me", 'is a little annoyed with you'),
  NudgeKind('proud', '🫶', 'Proud of you', 'is proud of you'),
];

NudgeKind nudgeFor(String kind) =>
    kNudges.firstWhere((n) => n.kind == kind, orElse: () => kNudges[1]);

class Mood {
  const Mood(this.value, this.emoji, this.label);
  final String value;
  final String emoji;
  final String label;
}

const kMoods = <Mood>[
  Mood('sweet', '💛', 'Just because'),
  Mood('hard_day', '🌧️', 'For a bad day'),
  Mood('proud', '🫶', 'Proud of you'),
  Mood('sorry', '🕊️', "I'm sorry"),
  Mood('anniversary', '🥂', 'For a milestone'),
  Mood('random', '✨', 'Random thought'),
];

Mood moodFor(String value) =>
    kMoods.firstWhere((m) => m.value == value, orElse: () => kMoods[0]);

const kMilestoneIcons = [
  '💫', '💌', '📞', '🌙', '🏡', '✈️', '🥂', '🎂', '💍', '🌊', '🎶', '☕',
];

const kConditionPresets = [
  'when you miss me',
  'when you need to hear something good',
  "when we've argued",
  "when you can't sleep",
  'when you forget why you chose me',
];

const kDeckAccents = [
  '#E8879B', '#F0B429', '#D65A5A', '#5FA8A0', '#7C7BC4', '#E8B961',
];
