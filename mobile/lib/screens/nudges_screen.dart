import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api.dart';
import '../models.dart';
import '../session.dart';
import '../theme.dart';
import '../widgets.dart';

class NudgesScreen extends ConsumerStatefulWidget {
  const NudgesScreen({super.key});

  @override
  ConsumerState<NudgesScreen> createState() => _NudgesScreenState();
}

class _NudgesScreenState extends ConsumerState<NudgesScreen> {
  final _note = TextEditingController();

  List<Nudge> _history = [];
  bool _loading = true;
  String? _sending;
  String? _justSent;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final history = await Api.nudges();
      if (mounted) setState(() => _history = history);
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _send(String kind) async {
    setState(() => _sending = kind);
    try {
      final message = _note.text.trim();
      await Api.sendNudge(kind, note: message.isEmpty ? null : message);
      _note.clear();

      if (!mounted) return;
      setState(() => _justSent = kind);
      Future.delayed(const Duration(milliseconds: 2200), () {
        if (mounted) setState(() => _justSent = null);
      });

      await Api.syncAchievements();
      await _load();
      await ref.read(sessionProvider).refresh();
    } catch (error) {
      if (mounted) showError(context, error, friendlyError(error));
    } finally {
      if (mounted) setState(() => _sending = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final text = Theme.of(context).textTheme;
    final busy = _sending != null;

    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(title: const Text('Nudges')),
      body: SafeArea(
        top: false,
        child: _loading
            ? const LoadingView()
            : ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
                children: [
                  Text(
                    'Press one. It lands on their phone in about a second.',
                    style: text.bodyMedium,
                  ),
                  const SizedBox(height: 18),

                  // The big one gets its own row.
                  PaperCard(
                    glow: true,
                    onTap: busy ? null : () => _send('miss_you'),
                    padding: const EdgeInsets.symmetric(vertical: 40),
                    child: Column(
                      children: [
                        _justSent == 'miss_you'
                            ? const Text('💌', style: TextStyle(fontSize: 54))
                            : const SoftPulse(
                                child: Text('🥺', style: TextStyle(fontSize: 54)),
                              ),
                        const SizedBox(height: 12),
                        Text(
                          _justSent == 'miss_you' ? 'Sent.' : 'I miss you',
                          style: text.headlineSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(
                          _justSent == 'miss_you'
                              ? '${session.partnerName} will know in a second'
                              : 'tap it',
                          style: text.bodySmall,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),

                  GridView.count(
                    crossAxisCount: 2,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    mainAxisSpacing: 12,
                    crossAxisSpacing: 12,
                    childAspectRatio: 1.55,
                    children: [
                      for (final n in kNudges.where((n) => n.kind != 'miss_you'))
                        Surface(
                          onTap: busy ? null : () => _send(n.kind),
                          padding: const EdgeInsets.all(14),
                          child: Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Text(
                                _justSent == n.kind ? '✓' : n.emoji,
                                style: const TextStyle(fontSize: 28),
                              ),
                              const SizedBox(height: 8),
                              Text(
                                _justSent == n.kind ? 'sent' : n.label,
                                style: text.bodySmall,
                                textAlign: TextAlign.center,
                              ),
                            ],
                          ),
                        ),
                    ],
                  ),

                  const SizedBox(height: 18),
                  TextField(
                    controller: _note,
                    maxLength: 140,
                    decoration: const InputDecoration(
                      hintText: 'Add a few words to the next one… (optional)',
                      counterText: '',
                    ),
                  ),

                  const SizedBox(height: 26),
                  const SectionLabel('Lately'),
                  const SizedBox(height: 10),

                  if (_history.isEmpty)
                    Text(
                      'Nothing yet. Go on, press the big one.',
                      style: text.bodySmall,
                    ),

                  for (final n in _history)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: _historyRow(n, session, text),
                    ),
                ],
              ),
      ),
    );
  }

  Widget _historyRow(Nudge nudge, AppSession session, TextTheme text) {
    final meta = nudgeFor(nudge.kind);
    final mine = nudge.senderId == session.userId;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Text(meta.emoji, style: const TextStyle(fontSize: 18)),
          const SizedBox(width: 12),
          Expanded(
            child: RichText(
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              text: TextSpan(
                style: text.bodyMedium,
                children: [
                  TextSpan(
                    text: mine ? 'You' : session.partnerName,
                    style: TextStyle(color: Glow.c200),
                  ),
                  TextSpan(text: ' ${meta.sent}'),
                  if (nudge.message != null)
                    TextSpan(
                      text: ' — “${nudge.message}”',
                      style: TextStyle(color: Glow.c600),
                    ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          Text(agoLabel(nudge.createdAt), style: text.bodySmall),
        ],
      ),
    );
  }
}
