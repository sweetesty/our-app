import 'dart:io';

import 'package:supabase_flutter/supabase_flutter.dart';

import 'config.dart';
import 'models.dart';

/// Every network call the app makes, in one place. The RLS policies in
/// supabase/migrations/0003_rls.sql do the access control, so nothing here has
/// to remember to filter by couple — the database will not hand over rows that
/// are not yours in the first place.
class Api {
  static SupabaseClient get _db => Supabase.instance.client;

  static String? get userId => _db.auth.currentUser?.id;

  static List<Map<String, dynamic>> _rows(dynamic data) =>
      (data as List).map((e) => Map<String, dynamic>.from(e as Map)).toList();

  /* ---------------------------------------------------------------- auth -- */

  static Future<void> signUp(
    String email,
    String password,
    String displayName,
  ) async {
    await _db.auth.signUp(
      email: email.trim(),
      password: password,
      data: {'display_name': displayName.trim()},
    );
  }

  static Future<void> signIn(String email, String password) async {
    await _db.auth.signInWithPassword(email: email.trim(), password: password);
  }

  static Future<void> signOut() => _db.auth.signOut();

  /* ------------------------------------------------------------- pairing -- */

  static Future<Couple> createCouple(String? name) async {
    final data = await _db.rpc('create_couple', params: {'couple_name': name});
    return Couple.fromMap(Map<String, dynamic>.from(data as Map));
  }

  static Future<Couple> joinCouple(String code) async {
    final data = await _db.rpc('join_couple', params: {'code': code.trim()});
    return Couple.fromMap(Map<String, dynamic>.from(data as Map));
  }

  static Future<HomeSummary> homeSummary() async {
    final data = await _db.rpc('home_summary');
    return HomeSummary.fromMap(Map<String, dynamic>.from(data as Map));
  }

  static Future<void> updateProfile(String displayName) async {
    await _db
        .from('profiles')
        .update({'display_name': displayName.trim()})
        .eq('id', userId!);
  }

  static Future<void> updateCouple(
    String coupleId, {
    String? name,
    DateTime? anniversary,
  }) async {
    await _db
        .from('couples')
        .update({
          'name': (name?.trim().isEmpty ?? true) ? null : name!.trim(),
          'anniversary': anniversary?.toIso8601String().split('T').first,
        })
        .eq('id', coupleId);
  }

  /* --------------------------------------------------------- 1. today ----- */

  static Future<TodayQuestion?> todayQuestion() async {
    final rows = _rows(await _db.rpc('today_question'));
    return rows.isEmpty ? null : TodayQuestion.fromMap(rows.first);
  }

  /// Returns your answer always; your partner's only once yours exists. That
  /// filter is the RLS policy on daily_answers, not anything written here.
  static Future<List<DailyAnswer>> answersFor(String dailyQuestionId) async {
    final rows = _rows(
      await _db
          .from('daily_answers')
          .select()
          .eq('daily_question_id', dailyQuestionId),
    );
    return rows.map(DailyAnswer.fromMap).toList();
  }

  static Future<void> answerToday(String answer) =>
      _db.rpc('answer_today', params: {'answer': answer});

  static Future<void> askCustomQuestion(String question) =>
      _db.rpc('ask_custom_question', params: {'question': question});

  /* --------------------------------------------------------- 2. cards ----- */

  static Future<List<CardDeck>> decks() async {
    final rows = _rows(
      await _db.from('card_decks').select().order('sort_order'),
    );
    return rows.map(CardDeck.fromMap).toList();
  }

  static Future<PlayCard?> drawCard(String deckId) async {
    final rows = _rows(
      await _db.rpc('draw_card', params: {'target_deck': deckId}),
    );
    return rows.isEmpty ? null : PlayCard.fromMap(rows.first);
  }

  static Future<void> playCard(
    String coupleId,
    String cardId, {
    String? response,
  }) async {
    await _db.from('card_plays').insert({
      'couple_id': coupleId,
      'card_id': cardId,
      'played_by': userId,
      'response': response,
      'completed': true,
    });
  }

  static Future<void> addCard(
    String coupleId,
    String deckId,
    String body,
    String kind,
  ) async {
    await _db.from('cards').insert({
      'deck_id': deckId,
      'couple_id': coupleId,
      'body': body.trim(),
      'kind': kind,
      'created_by': userId,
    });
  }

  static Future<void> addDeck(
    String coupleId, {
    required String name,
    required String emoji,
    String? description,
    required String accent,
  }) async {
    final slug = name
        .trim()
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9]+'), '_')
        .replaceAll(RegExp(r'^_|_$'), '');

    await _db.from('card_decks').insert({
      'couple_id': coupleId,
      'slug': slug.isEmpty ? 'deck' : slug,
      'name': name.trim(),
      'emoji': emoji,
      'description': description?.trim(),
      'accent': accent,
      'sort_order': 200,
    });
  }

  /* --------------------------------------------------------- 3. notes ----- */

  static Future<List<LoveNote>> notes() async {
    final rows = _rows(
      await _db
          .from('love_notes')
          .select()
          .order('is_pinned', ascending: false)
          .order('created_at', ascending: false),
    );
    return rows.map(LoveNote.fromMap).toList();
  }

  static Future<void> addNote(
    String coupleId, {
    String? title,
    required String body,
    required String mood,
    required bool pinned,
  }) async {
    await _db.from('love_notes').insert({
      'couple_id': coupleId,
      'author_id': userId,
      'title': (title?.trim().isEmpty ?? true) ? null : title!.trim(),
      'body': body.trim(),
      'mood': mood,
      'is_pinned': pinned,
    });
  }

  static Future<void> markNoteRead(String noteId) =>
      _db.rpc('mark_note_read', params: {'note': noteId});

  static Future<void> toggleNotePin(String noteId) =>
      _db.rpc('toggle_note_pin', params: {'note': noteId});

  static Future<void> deleteNote(String noteId) =>
      _db.from('love_notes').delete().eq('id', noteId);

  /* ------------------------------------------------------ 4. timeline ----- */

  static Future<List<Milestone>> milestones() async {
    final rows = _rows(
      await _db.from('milestones').select().order('happened_on'),
    );
    return rows.map(Milestone.fromMap).toList();
  }

  static Future<List<MilestoneMedia>> milestoneMedia() async {
    final rows = _rows(
      await _db.from('milestone_media').select().order('created_at'),
    );
    return rows.map(MilestoneMedia.fromMap).toList();
  }

  static Future<String> saveMilestone(
    String coupleId, {
    String? id,
    required String title,
    String? description,
    required DateTime happenedOn,
    required String icon,
  }) async {
    final payload = {
      'title': title.trim(),
      'description': (description?.trim().isEmpty ?? true)
          ? null
          : description!.trim(),
      'happened_on': happenedOn.toIso8601String().split('T').first,
      'icon': icon,
    };

    if (id != null) {
      await _db.from('milestones').update(payload).eq('id', id);
      return id;
    }

    final row = await _db
        .from('milestones')
        .insert({...payload, 'couple_id': coupleId, 'created_by': userId})
        .select()
        .single();
    return row['id'] as String;
  }

  static Future<void> attachToMilestone(
    String coupleId,
    String milestoneId,
    File file,
  ) async {
    final uploaded = await uploadMedia(coupleId, 'timeline', file);
    await _db.from('milestone_media').insert({
      'milestone_id': milestoneId,
      'couple_id': coupleId,
      'storage_path': uploaded.$1,
      'media_type': uploaded.$2,
    });
  }

  static Future<void> deleteMilestone(String id, List<String> paths) async {
    await _db.from('milestones').delete().eq('id', id);
    await removeMedia(paths);
  }

  static Future<void> detachMedia(String mediaId, String path) async {
    await _db.from('milestone_media').delete().eq('id', mediaId);
    await removeMedia([path]);
  }

  /* --------------------------------------------------------- 5. vault ----- */

  static Future<List<VaultItem>> vaultItems() async {
    final rows = _rows(
      await _db.from('vault_items').select().order('created_at', ascending: false),
    );
    return rows.map(VaultItem.fromMap).toList();
  }

  /// Returns null while the item is still sealed — the policy on
  /// vault_contents simply does not match the row until it opens.
  static Future<VaultContents?> vaultContents(String itemId) async {
    final row = await _db
        .from('vault_contents')
        .select()
        .eq('item_id', itemId)
        .maybeSingle();
    return row == null ? null : VaultContents.fromMap(row);
  }

  static Future<void> unlockVaultItem(String itemId) =>
      _db.rpc('unlock_vault_item', params: {'item': itemId});

  static Future<void> sealVaultItem(
    String coupleId, {
    required String recipientId,
    required String label,
    required String unlockType,
    DateTime? unlockAt,
    String? unlockCondition,
    String? body,
    File? attachment,
  }) async {
    final item = await _db
        .from('vault_items')
        .insert({
          'couple_id': coupleId,
          'author_id': userId,
          'recipient_id': recipientId,
          'label': label.trim(),
          'unlock_type': unlockType,
          'unlock_at': unlockType == 'date'
              ? unlockAt?.toUtc().toIso8601String()
              : null,
          'unlock_condition': unlockType == 'condition' ? unlockCondition : null,
        })
        .select()
        .single();

    String? path;
    String? type;
    if (attachment != null) {
      final uploaded = await uploadMedia(coupleId, 'vault', attachment);
      path = uploaded.$1;
      type = uploaded.$2;
    }

    await _db.from('vault_contents').insert({
      'item_id': item['id'],
      'body': (body?.trim().isEmpty ?? true) ? null : body!.trim(),
      'media_path': path,
      'media_type': type,
    });
  }

  static Future<void> deleteVaultItem(String id) =>
      _db.from('vault_items').delete().eq('id', id);

  /* -------------------------------------------------------- 6. nudges ----- */

  static Future<List<Nudge>> nudges({int limit = 40}) async {
    final rows = _rows(
      await _db
          .from('nudges')
          .select()
          .order('created_at', ascending: false)
          .limit(limit),
    );
    return rows.map(Nudge.fromMap).toList();
  }

  static Future<void> sendNudge(String kind, {String? note}) =>
      _db.rpc('send_nudge', params: {'nudge_kind': kind, 'note': note});

  static Future<void> markNudgeSeen(String id) => _db
      .from('nudges')
      .update({'seen_at': DateTime.now().toUtc().toIso8601String()})
      .eq('id', id);

  /// Realtime stream of nudges landing in this couple's space.
  static RealtimeChannel nudgeChannel(
    String coupleId,
    void Function(Nudge) onNudge,
  ) {
    return _db
        .channel('nudges:$coupleId')
        .onPostgresChanges(
          event: PostgresChangeEvent.insert,
          schema: 'public',
          table: 'nudges',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'couple_id',
            value: coupleId,
          ),
          callback: (payload) =>
              onNudge(Nudge.fromMap(Map<String, dynamic>.from(payload.newRecord))),
        )
        .subscribe();
  }

  static RealtimeChannel answersChannel(
    String coupleId,
    void Function() onChange,
  ) {
    return _db
        .channel('answers:$coupleId')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'daily_answers',
          filter: PostgresChangeFilter(
            type: PostgresChangeFilterType.eq,
            column: 'couple_id',
            value: coupleId,
          ),
          callback: (_) => onChange(),
        )
        .subscribe();
  }

  static Future<void> disposeChannel(RealtimeChannel channel) =>
      _db.removeChannel(channel);

  /* ---------------------------------------------------- 7. achievements --- */

  static Future<void> syncAchievements() => _db.rpc('sync_achievements');

  static Future<List<AchievementDef>> achievementDefs() async {
    final rows = _rows(
      await _db.from('achievement_defs').select().order('sort_order'),
    );
    return rows.map(AchievementDef.fromMap).toList();
  }

  static Future<Set<String>> earnedAchievements() async {
    final rows = _rows(await _db.from('achievements').select('slug'));
    return rows.map((r) => r['slug'] as String).toSet();
  }

  static Future<CoupleStats?> stats() async {
    final row = await _db.from('couple_stats').select().maybeSingle();
    return row == null ? null : CoupleStats.fromMap(row);
  }

  /* ----------------------------------------------------------- push ------- */

  /// Upserts on the token, so calling this every launch is correct and cheap.
  static Future<void> registerDeviceToken(String token, String platform) =>
      _db.rpc('register_device_token', params: {
        'device_token': token,
        'device_platform': platform,
      });

  static Future<void> unregisterDeviceToken(String token) =>
      _db.rpc('unregister_device_token', params: {'device_token': token});

  /* --------------------------------------------------------- storage ------ */

  static String _mediaType(String path) {
    final ext = path.toLowerCase().split('.').last;
    if (['mp4', 'mov', 'webm', 'm4v'].contains(ext)) return 'video';
    if (['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus'].contains(ext)) return 'voice';
    return 'photo';
  }

  /// Storage RLS keys off the first path segment, so every object starts with
  /// the couple id. Returns (path, mediaType).
  static Future<(String, String)> uploadMedia(
    String coupleId,
    String folder,
    File file,
  ) async {
    final name = file.path.split(Platform.pathSeparator).last;
    final safe = name.replaceAll(RegExp(r'[^\w.\-]+'), '_');
    final stamp = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
    final path = '$coupleId/$folder/${stamp}_$safe';

    await _db.storage.from(Config.mediaBucket).upload(path, file);
    return (path, _mediaType(name));
  }

  /// The bucket is private, so reads go through short-lived signed URLs.
  static Future<String?> signedUrl(String path, {int seconds = 3600}) async {
    try {
      return await _db.storage
          .from(Config.mediaBucket)
          .createSignedUrl(path, seconds);
    } catch (_) {
      return null;
    }
  }

  static Future<Map<String, String>> signedUrls(
    List<String> paths, {
    int seconds = 3600,
  }) async {
    if (paths.isEmpty) return {};
    try {
      final results = await _db.storage
          .from(Config.mediaBucket)
          .createSignedUrlsResult(paths, seconds);
      // Missing objects come back as SignedUrlFailure rather than throwing, so
      // one deleted file does not blank out the whole timeline.
      return {
        for (final r in results)
          if (r is SignedUrlSuccess) r.path: r.signedUrl,
      };
    } catch (_) {
      return {};
    }
  }

  static Future<void> removeMedia(List<String> paths) async {
    if (paths.isEmpty) return;
    try {
      await _db.storage.from(Config.mediaBucket).remove(paths);
    } catch (_) {
      // The row is already gone; a stranded object is not worth failing over.
    }
  }
}

/// Turns Postgres/Supabase errors into something you would actually want to
/// read at 1am.
String friendlyError(Object error) {
  if (error is AuthException) return error.message;
  if (error is PostgrestException) return error.message;
  if (error is StorageException) return error.message;
  return 'Something went wrong. Try again.';
}
