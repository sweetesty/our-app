import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:our_app/models.dart';
import 'package:our_app/widgets.dart';

/// The app itself needs a live Supabase connection to boot, so these cover the
/// pure logic instead — the bits where a quiet mistake would show up as a
/// letter opening early or a name rendering wrong.
void main() {
  group('vault unlock rules', () {
    VaultItem item({
      String unlockType = 'date',
      DateTime? unlockAt,
      DateTime? unlockedAt,
    }) => VaultItem(
      id: 'i',
      authorId: 'a',
      recipientId: 'b',
      label: 'Open on your birthday',
      unlockType: unlockType,
      unlockAt: unlockAt,
      unlockCondition: 'when you miss me',
      unlockedAt: unlockedAt,
      createdAt: DateTime(2026),
    );

    test('a future date stays sealed', () {
      final future = DateTime.now().add(const Duration(days: 3));
      expect(item(unlockAt: future).isReady, isFalse);
    });

    test('a past date is ready', () {
      final past = DateTime.now().subtract(const Duration(minutes: 1));
      expect(item(unlockAt: past).isReady, isTrue);
    });

    test('condition items are always openable by the recipient', () {
      expect(item(unlockType: 'condition').isReady, isTrue);
    });

    test('an opened item stays open even if the date has not arrived', () {
      final future = DateTime.now().add(const Duration(days: 30));
      final opened = item(unlockAt: future, unlockedAt: DateTime(2026, 6));
      expect(opened.isReady, isTrue);
      expect(opened.isOpened, isTrue);
    });
  });

  group('formatting', () {
    test('initials take at most two parts', () {
      expect(initialsOf('Esther'), 'E');
      expect(initialsOf('Esther Ada Bello'), 'EA');
      expect(initialsOf(null), '·');
      expect(initialsOf('   '), '·');
    });

    test('untilUnlock phrases the wait', () {
      expect(untilUnlock(null), '');
      expect(
        untilUnlock(DateTime.now().subtract(const Duration(hours: 1))),
        'ready now',
      );
      expect(
        untilUnlock(DateTime.now().add(const Duration(days: 3, hours: 1))),
        'opens in 3 days',
      );
    });

    test('hex accents parse into opaque colours', () {
      expect(hexColor('#E8B961'), const Color(0xFFE8B961));
      expect(hexColor('E8B961'), const Color(0xFFE8B961));
    });
  });

  group('couple stats', () {
    test('byMetric matches the achievement_defs metric column', () {
      final stats = CoupleStats.fromMap({
        'answers_given': 12,
        'notes_written': 3,
        'cards_played': 25,
        'memories_added': 1,
        'vault_items': 5,
        'nudges_sent': 100,
        'spicy_played': 7,
        'current_streak': 9,
        'longest_streak': 40,
      });

      expect(stats.byMetric('answers_given'), 12);
      expect(stats.byMetric('spicy_played'), 7);
      expect(stats.byMetric('longest_streak'), 40);
      expect(stats.byMetric('nonsense'), 0);
    });

    test('missing counters default to zero rather than throwing', () {
      final stats = CoupleStats.fromMap({});
      expect(stats.answersGiven, 0);
      expect(stats.currentStreak, 0);
    });
  });
}
