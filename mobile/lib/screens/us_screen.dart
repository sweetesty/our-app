import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class UsScreen extends ConsumerStatefulWidget {
  const UsScreen({super.key});

  @override
  ConsumerState<UsScreen> createState() => _UsScreenState();
}

class _UsScreenState extends ConsumerState<UsScreen> {
  List<AchievementDef> _defs = [];
  Set<String> _earned = {};
  CoupleStats? _stats;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      // Recompute first so anything crossed since the last visit shows as earned.
      await Api.syncAchievements();
      final defs = await Api.achievementDefs();
      final earned = await Api.earnedAchievements();
      final stats = await Api.stats();

      if (!mounted) return;
      setState(() {
        _defs = defs;
        _earned = earned;
        _stats = stats;
      });
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final text = Theme.of(context).textTheme;

    final streak = _stats?.currentStreak ?? 0;
    final longest = _stats?.longestStreak ?? 0;
    final anniversary = session.summary?.couple?.anniversary;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('Us')),
      body: SafeArea(
        top: false,
        child: _loading
            ? const LoadingView(label: 'Counting…')
            : RefreshIndicator(
                onRefresh: _load,
                color: Ember.c400,
                backgroundColor: Dusk.c600,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                  children: [
                    Text(
                      'Not a scoreboard. Just proof you kept showing up.',
                      style: text.bodyMedium,
                    ),
                    const SizedBox(height: 18),

                    PaperCard(
                      glow: true,
                      padding: const EdgeInsets.symmetric(vertical: 30),
                      child: Column(
                        children: [
                          const SectionLabel('Answering together'),
                          const SizedBox(height: 10),
                          Text(
                            '$streak',
                            style: text.displayLarge?.copyWith(
                              color: Ember.c300,
                              fontSize: 58,
                              height: 1,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            streak == 0
                                ? "Answer today's question to start one."
                                : streak == 1
                                    ? 'day. It starts somewhere.'
                                    : 'days in a row ❤️',
                            style: text.bodyMedium,
                            textAlign: TextAlign.center,
                          ),
                          if (longest > streak) ...[
                            const SizedBox(height: 6),
                            Text(
                              'Your best run was $longest days.',
                              style: text.bodySmall,
                            ),
                          ],
                          if (anniversary != null) ...[
                            const SizedBox(height: 18),
                            const Divider(),
                            const SizedBox(height: 12),
                            Text(
                              'Together since ${longDate(anniversary)}',
                              style: text.bodySmall,
                            ),
                          ],
                        ],
                      ),
                    ),
                    const SizedBox(height: 18),

                    GridView.count(
                      crossAxisCount: 3,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: 0.95,
                      children: [
                        _stat('💌', 'Answers', _stats?.answersGiven ?? 0),
                        _stat('🃏', 'Cards', _stats?.cardsPlayed ?? 0),
                        _stat('📌', 'Notes', _stats?.notesWritten ?? 0),
                        _stat('📸', 'Memories', _stats?.memoriesAdded ?? 0),
                        _stat('🔒', 'Sealed', _stats?.vaultItems ?? 0),
                        _stat('🫂', 'Nudges', _stats?.nudgesSent ?? 0),
                      ],
                    ),

                    const SizedBox(height: 26),
                    const SectionLabel('Along the way'),
                    const SizedBox(height: 12),

                    for (var i = 0; i < _defs.length; i++)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: Rise(index: i, child: _achievement(_defs[i], text)),
                      ),
                  ],
                ),
              ),
      ),
    );
  }

  Widget _stat(String emoji, String label, int value) {
    final text = Theme.of(context).textTheme;
    return Surface(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(emoji, style: const TextStyle(fontSize: 18)),
          const SizedBox(height: 4),
          Text('$value', style: text.titleLarge?.copyWith(fontSize: 20)),
          Text(
            label.toUpperCase(),
            style: text.labelSmall?.copyWith(fontSize: 9),
          ),
        ],
      ),
    );
  }

  Widget _achievement(AchievementDef def, TextTheme text) {
    final value = _stats?.byMetric(def.metric) ?? 0;
    final done = _earned.contains(def.slug);
    final progress = (value / def.target).clamp(0.0, 1.0);

    final content = Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Opacity(
          opacity: done ? 1 : 0.45,
          child: Text(def.emoji, style: const TextStyle(fontSize: 24)),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(def.name, style: text.bodyLarge?.copyWith(fontSize: 15)),
              const SizedBox(height: 2),
              Text(def.description, style: text.bodySmall),
              if (!done) ...[
                const SizedBox(height: 10),
                ClipRRect(
                  borderRadius: BorderRadius.circular(99),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 4,
                    backgroundColor: Dusk.c800,
                    valueColor: AlwaysStoppedAnimation(
                      Ember.c500.withValues(alpha: 0.75),
                    ),
                  ),
                ),
                const SizedBox(height: 5),
                Text(
                  '${value.clamp(0, def.target)} / ${def.target}',
                  style: text.bodySmall?.copyWith(fontSize: 10.5),
                ),
              ],
            ],
          ),
        ),
      ],
    );

    return done
        ? PaperCard(padding: const EdgeInsets.all(16), child: content)
        : Surface(padding: const EdgeInsets.all(16), child: content);
  }
}
